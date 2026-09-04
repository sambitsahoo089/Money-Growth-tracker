'use strict';

/* ------------------------------------------------------------------ */
/* Authentication guards                                               */
/* ------------------------------------------------------------------ */

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Please sign in to continue.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Administrator access required.' });
}

/* ------------------------------------------------------------------ */
/* CSRF protection — enforce same-origin for state-changing requests   */
/* ------------------------------------------------------------------ */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sameOrigin(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next(); // non-browser client (curl, tests) — allowed
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Request origin could not be verified.' });
  }
  if (host === req.headers.host) return next();
  return res.status(403).json({ error: 'Cross-origin request rejected.' });
}

/* ------------------------------------------------------------------ */
/* Login rate limiting (in-memory)                                     */
/* ------------------------------------------------------------------ */

const attempts = new Map(); // key -> { count, resetAt }
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function pruneAttempts() {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
}

function loginRateLimit(req, res, next) {
  pruneAttempts();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const email = String(req.body && req.body.email || '').toLowerCase().trim();
  const key = `${ip}|${email}`;
  const now = Date.now();
  let rec = attempts.get(key);
  if (!rec || rec.resetAt <= now) {
    rec = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, rec);
  }
  req.loginAttempt = rec;
  if (rec.count >= MAX_ATTEMPTS) {
    const mins = Math.ceil((rec.resetAt - now) / 60000);
    return res.status(429).json({ error: `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` });
  }
  next();
}

function recordLoginFailure(req) {
  if (req.loginAttempt) req.loginAttempt.count += 1;
}

function recordLoginSuccess(req) {
  if (req.loginAttempt) attempts.delete(`${req.ip || 'unknown'}|${String(req.body && req.body.email || '').toLowerCase().trim()}`);
}

module.exports = { requireAuth, requireAdmin, sameOrigin, loginRateLimit, recordLoginFailure, recordLoginSuccess };