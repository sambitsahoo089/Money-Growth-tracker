/*
 * Freebuff — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { cleanStr, CURRENCIES, bad } = require('../helpers');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

router.get('/profile', (req, res) => {
  const u = db.prepare('SELECT id, name, email, currency, role, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!u) return bad(res, 'Account not found.', 404);
  return res.json({ profile: u });
});

router.put('/profile', (req, res) => {
  const name = cleanStr(req.body.name, 60);
  const currency = CURRENCIES.includes(req.body.currency) ? req.body.currency : null;
  if (!name) return bad(res, 'Please enter your full name (2–60 characters).');
  if (!currency) return bad(res, 'Please choose a valid base currency.');
  db.prepare('UPDATE users SET name = ?, currency = ? WHERE id = ?').run(name, currency, req.session.userId);
  return res.json({ ok: true, message: 'Profile updated.' });
});

router.put('/password', (req, res) => {
  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const next = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return bad(res, 'Account not found.', 404);
  if (!bcrypt.compareSync(current, user.password_hash)) return bad(res, 'Current password is incorrect.');
  if (!PASSWORD_RE.test(next)) return bad(res, 'New password must be 8–64 characters and include at least one letter and one number.');
  if (next === current) return bad(res, 'New password must be different from the current one.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.session.userId);
  return res.json({ ok: true, message: 'Password changed.' });
});

router.post('/feedback', (req, res) => {
  const subject = cleanStr(req.body.subject, 120);
  const message = cleanStr(req.body.message, 1000);
  if (!subject) return bad(res, 'Please enter a short subject (2–120 characters).');
  if (!message) return bad(res, 'Please describe your feedback (2–1000 characters).');
  db.prepare('INSERT INTO feedback (user_id, subject, message, status, created_at) VALUES (?,?,?,?,?)')
    .run(req.session.userId, subject, message, 'open', new Date().toISOString());
  return res.status(201).json({ ok: true, message: 'Thanks! Your feedback has been submitted.' });
});

module.exports = router;