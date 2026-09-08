/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { col, oid, SEED_ADMIN_EMAIL } = require('../db');
const { EMAIL_RE, cleanStr, CURRENCIES, bad } = require('../helpers');
const { loginRateLimit, recordLoginFailure, recordLoginSuccess, wrap } = require('../middleware');

const router = express.Router();

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Precomputed bcrypt hash of the seeded admin password, resolved once at boot.
 *  The admin tab compares the supplied password against this single stored hash —
 *  no per-request hashing of SEED_ADMIN_PASSWORD and no bcrypt work for any other
 *  email. If bcrypt fails to load on a platform, the admin account can't auth. */
let ADMIN_PASSWORD_HASH = null;
try {
  ADMIN_PASSWORD_HASH = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
} catch (e) {
  console.error('WealthHabit: bcrypt could not hash the admin password at boot:', e.message);
}

function publicUser(u) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    currency: u.currency,
    createdAt: u.created_at,
  };
}

/** Case-insensitive email lookup (SQLite compared lower(email) = lower(?)). */
async function findUserByEmail(email) {
  return col('users').findOne({ email: new RegExp(`^${escapeRegExp(email)}$`, 'i') });
}

router.post('/register', wrap(async (req, res) => {
  const name = cleanStr(req.body.name, 60);
  const email = cleanStr(req.body.email, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const currency = CURRENCIES.includes(req.body.currency) ? req.body.currency : 'USD';

  if (!name) return bad(res, 'Please enter your full name (2–60 characters).');
  if (!email || !EMAIL_RE.test(email)) return bad(res, 'Please enter a valid email address.');
  if (email.toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase()) return bad(res, 'This email belongs to the admin account and cannot be registered.');
  if (!PASSWORD_RE.test(password)) return bad(res, 'Password must be 8–64 characters and include at least one letter and one number.');

  const existing = await findUserByEmail(email);
  if (existing) return bad(res, 'An account with this email already exists.', 409);

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const userRes = await col('users').insertOne({
    name, email, password_hash: hash, role: 'client', currency,
    suspended: 0, created_at: now, last_login_at: null,
  });
  const userId = userRes.insertedId;

  // Starter habits — behavioral templates so new users start strong (no fabricated money data)
  await col('habits').insertMany([
    { user_id: userId, name: 'Log my expenses every evening', frequency: 'daily', reminder: 1, archived: 0, created_at: now },
    { user_id: userId, name: 'Save a little every day', frequency: 'daily', reminder: 1, archived: 0, created_at: now },
    { user_id: userId, name: 'Review my budget each Sunday', frequency: 'weekly', reminder: 1, archived: 0, created_at: now },
  ]);

  req.session.userId = String(userId);
  req.session.role = 'client';
  const user = await col('users').findOne({ _id: userId });
  return res.status(201).json({ user: publicUser(user), message: 'Account created. Welcome to WealthHabit!' });
}));

// Admin sign-in — only the seeded admin email + password is accepted.
// Any other email or password is rejected with a clear "wrong credentials"
// message so the admin panel is reachable only with the provisioned account.
router.post('/admin/login', loginRateLimit, wrap(async (req, res) => {
  const email = cleanStr(req.body.email, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return bad(res, 'Please enter your email and password.');
  }

  if (email.toLowerCase() !== SEED_ADMIN_EMAIL.toLowerCase()
      || !ADMIN_PASSWORD_HASH
      || !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    return bad(res, 'Wrong login credentials. The admin panel accepts only the provisioned admin account.');
  }

  const user = await findUserByEmail(SEED_ADMIN_EMAIL);
  if (!user) {
    return bad(res, 'The admin account is not set up. Please contact support.', 500);
  }
  if (user.suspended) {
    return bad(res, 'This account has been suspended. Contact support@freebuff.app.', 403);
  }

  recordLoginSuccess(req);
  await col('users').updateOne({ _id: user._id }, { $set: { last_login_at: new Date().toISOString() } });

  req.session.userId = String(user._id);
  req.session.role = user.role;
  return res.json({ user: publicUser(user) });
}));

// Client sign-in — only previously created client accounts may log in.
router.post('/client/login', loginRateLimit, wrap(async (req, res) => {
  const email = cleanStr(req.body.email, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    recordLoginFailure(req);
    return bad(res, 'Please enter your email and password.');
  }

  const user = await findUserByEmail(email);
  if (!user || user.role !== 'client' || !bcrypt.compareSync(password, user.password_hash)) {
    recordLoginFailure(req);
    return bad(res, 'Wrong email or password. Check your details and try again.');
  }
  if (user.suspended) {
    recordLoginFailure(req);
    return bad(res, 'This account has been suspended. Contact support@freebuff.app.', 403);
  }

  recordLoginSuccess(req);
  await col('users').updateOne({ _id: user._id }, { $set: { last_login_at: new Date().toISOString() } });

  req.session.userId = String(user._id);
  req.session.role = user.role;
  return res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', wrap(async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  const id = oid(req.session.userId);
  const user = await col('users').findOne({ _id: id });
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  return res.json({ user: publicUser(user) });
}));

module.exports = router;
