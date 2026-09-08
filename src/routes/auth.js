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

router.post('/login', loginRateLimit, wrap(async (req, res) => {
  const email = cleanStr(req.body.email, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    recordLoginFailure(req);
    return bad(res, 'Please enter your email and password.');
  }

  // Admin-only mode: only the seeded admin account may sign in.
  if (email.toLowerCase() !== SEED_ADMIN_EMAIL.toLowerCase()
      || !bcrypt.compareSync(password, bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10))) {
    recordLoginFailure(req);
    return bad(res, 'That account is not recognized. The admin account is the only sign-in on this deployment.');
  }

  const user = await findUserByEmail(SEED_ADMIN_EMAIL);
  if (!user) {
    // Admin row missing (should not happen in a seeded deploy)
    recordLoginFailure(req);
    return bad(res, 'The admin account is not set up. Please contact support.', 500);
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
