'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { db, toCents, SEED_ADMIN_EMAIL } = require('../db');
const { EMAIL_RE, cleanStr, CURRENCIES, bad } = require('../helpers');
const { loginRateLimit, recordLoginFailure, recordLoginSuccess } = require('../middleware');

const router = express.Router();

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    currency: u.currency,
    createdAt: u.created_at,
  };
}

router.post('/register', (req, res) => {
  const name = cleanStr(req.body.name, 60);
  const email = cleanStr(req.body.email, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const currency = CURRENCIES.includes(req.body.currency) ? req.body.currency : 'USD';

  if (!name) return bad(res, 'Please enter your full name (2–60 characters).');
  if (!email || !EMAIL_RE.test(email)) return bad(res, 'Please enter a valid email address.');
  if (email.toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase()) return bad(res, 'This email belongs to the admin account and cannot be registered.');
  if (!PASSWORD_RE.test(password)) return bad(res, 'Password must be 8–64 characters and include at least one letter and one number.');

  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
  if (existing) return bad(res, 'An account with this email already exists.', 409);

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const res2 = db.prepare('INSERT INTO users (name, email, password_hash, role, currency, created_at) VALUES (?,?,?,?,?,?)')
    .run(name, email, hash, 'client', currency, now);
  const userId = Number(res2.lastInsertRowid);

  // Starter habits — behavioral templates so new users start strong (no fabricated money data)
  const hab = db.prepare('INSERT INTO habits (user_id, name, frequency, reminder, archived, created_at) VALUES (?,?,?,?,?,?)');
  hab.run(userId, 'Log my expenses every evening', 'daily', 1, 0, now);
  hab.run(userId, 'Save a little every day', 'daily', 1, 0, now);
  hab.run(userId, 'Review my budget each Sunday', 'weekly', 1, 0, now);

  req.session.userId = userId;
  req.session.role = 'client';
  req.session.save((err) => {
    if (err) return bad(res, 'Could not start a session. Please sign in.', 500);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return res.status(201).json({ user: publicUser(user), message: 'Account created. Welcome to Freebuff!' });
  });
});

router.post('/login', loginRateLimit, (req, res) => {
  const email = cleanStr(req.body.email, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    recordLoginFailure(req);
    return bad(res, 'Please enter your email and password.');
  }

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordLoginFailure(req);
    return bad(res, 'Incorrect email or password.');
  }
  if (user.suspended) {
    recordLoginFailure(req);
    return bad(res, 'This account has been suspended. Contact support@freebuff.app.', 403);
  }

  recordLoginSuccess(req);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.save((err) => {
    if (err) return bad(res, 'Could not start a session.', 500);
    return res.json({ user: publicUser(user) });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  return res.json({ user: publicUser(user) });
});

module.exports = router;