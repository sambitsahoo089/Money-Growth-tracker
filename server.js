/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const path = require('node:path');

const { init, seed, col } = require('./src/db');
const MongoSessionStore = require('./src/session-store');
const { sameOrigin, cors, setAllowedOrigins } = require('./src/middleware');

const PORT = Number(process.env.PORT) || 3000;
const PRODUCTION = process.env.NODE_ENV === 'production';

async function main() {
  // Connect to MongoDB and create indexes.
  await init();
  const seeded = await seed();
  if (seeded.seeded) console.log('✓ Seeded MongoDB with admin account and demo data.');

  // Session signing secret. Persist via SESSION_SECRET so restarts keep sessions alive.
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.warn('⚠  SESSION_SECRET not set — using an ephemeral secret. Sessions will not survive restarts. Set SESSION_SECRET in production.');
    secret = crypto.randomBytes(32).toString('hex');
  }

  // Cross-origin frontends (e.g. the SPA on Vercel) that may call this API.
  setAllowedOrigins((process.env.ALLOWED_ORIGINS || '').split(','));

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  // CORS: must run before the session/CSRF guards so preflights are answered.
  app.use(cors);

  app.use(session({
    store: new MongoSessionStore(col('sessions')),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // 'none' lets the Vercel-hosted SPA (a different site) send the session cookie.
      sameSite: PRODUCTION ? 'none' : 'lax',
      secure: PRODUCTION,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  app.use(sameOrigin); // CSRF: enforce same-origin (or the configured SPA origin) on state-changing requests

  /* ------------------------------- API ------------------------------- */
  app.use('/api/auth', require('./src/routes/auth'));
  app.use('/api/user', require('./src/routes/user'));
  app.use('/api/dashboard', require('./src/routes/dashboard'));
  app.use('/api', require('./src/routes/expenses'));
  app.use('/api/habits', require('./src/routes/habits'));
  app.use('/api/goals', require('./src/routes/goals'));
  app.use('/api/wealth', require('./src/routes/wealth'));
  app.use('/api/admin', require('./src/routes/admin'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

  /* ------------------- Runtime config for the SPA -------------------- */
  // The SPA reads window.APP_API_BASE before any fetch. Empty string means
  // "same origin as this page", which is always correct: local dev and the
  // Render-served SPA share an origin, and on Vercel vercel.json proxies
  // /api/* to this server so the browser stays on the Vercel origin.
  app.get('/config.js', (req, res) => {
    res
      .type('application/javascript')
      .set('Cache-Control', 'no-store')
      .send('window.APP_API_BASE = "";\n');
  });

  /* ---------------------------- Static SPA ---------------------------- */
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/config.js') return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  /* --------------------------- Error handler -------------------------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  app.listen(PORT, () => {
    console.log(`WealthHabit running → http://localhost:${PORT}`);
    if (PRODUCTION) console.log('  SPA talks to this API same-origin (Vercel proxies /api/* here).');
  });
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
