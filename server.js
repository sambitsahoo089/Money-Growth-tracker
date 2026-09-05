/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { seed } = require('./src/db');
const { sameOrigin } = require('./src/middleware');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Seed demo data on first boot (no-op when the DB is already populated).
try {
  const result = seed();
  if (result.seeded) console.log('✓ Seeded database with admin account and demo data.');
} catch (err) {
  console.error('Seed error:', err);
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Session cookie secret, persisted so restarts keep sessions alive.
const DATA_DIR = path.join(__dirname, 'data');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret');
let secret;
try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { /* generate below */ }
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
}

app.set('trust proxy', 1);
app.use(session({
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(sameOrigin); // CSRF: enforce same-origin on state-changing requests

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

/* ---------------------------- Static SPA ---------------------------- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
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
});