/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { col, oid } = require('../db');
const { cleanStr, CURRENCIES, bad } = require('../helpers');
const { requireAuth, wrap } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

function profileOut(u) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    currency: u.currency,
    role: u.role,
    created_at: u.created_at,
  };
}

router.get('/profile', wrap(async (req, res) => {
  const u = await col('users').findOne({ _id: oid(req.session.userId) });
  if (!u) return bad(res, 'Account not found.', 404);
  return res.json({ profile: profileOut(u) });
}));

router.put('/profile', wrap(async (req, res) => {
  const name = cleanStr(req.body.name, 60);
  const currency = CURRENCIES.includes(req.body.currency) ? req.body.currency : null;
  if (!name) return bad(res, 'Please enter your full name (2–60 characters).');
  if (!currency) return bad(res, 'Please choose a valid base currency.');
  await col('users').updateOne({ _id: oid(req.session.userId) }, { $set: { name, currency } });
  return res.json({ ok: true, message: 'Profile updated.' });
}));

router.put('/password', wrap(async (req, res) => {
  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const next = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const user = await col('users').findOne({ _id: oid(req.session.userId) });
  if (!user) return bad(res, 'Account not found.', 404);
  if (!bcrypt.compareSync(current, user.password_hash)) return bad(res, 'Current password is incorrect.');
  if (!PASSWORD_RE.test(next)) return bad(res, 'New password must be 8–64 characters and include at least one letter and one number.');
  if (next === current) return bad(res, 'New password must be different from the current one.');
  await col('users').updateOne({ _id: user._id }, { $set: { password_hash: bcrypt.hashSync(next, 10) } });
  return res.json({ ok: true, message: 'Password changed.' });
}));

router.post('/feedback', wrap(async (req, res) => {
  const subject = cleanStr(req.body.subject, 120);
  const message = cleanStr(req.body.message, 1000);
  if (!subject) return bad(res, 'Please enter a short subject (2–120 characters).');
  if (!message) return bad(res, 'Please describe your feedback (2–1000 characters).');
  await col('feedback').insertOne({
    user_id: oid(req.session.userId),
    subject,
    message,
    status: 'open',
    created_at: new Date().toISOString(),
  });
  return res.status(201).json({ ok: true, message: 'Thanks! Your feedback has been submitted.' });
}));

module.exports = router;
