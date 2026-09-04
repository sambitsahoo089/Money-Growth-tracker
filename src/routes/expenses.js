/*
 * Freebuff — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { db, toDollars } = require('../db');
const { requireAuth } = require('../middleware');
const {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, cleanStr,
  isValidDate, parseAmountCents, bad,
} = require('../helpers');
const { monthlyIncome, monthlyExpenses, expenseBreakdown, currentMonth, activityMonths } = require('../analytics');

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}$/;

/* ----------------------------- Expenses ----------------------------- */

router.get('/expenses', (req, res) => {
  const uid = req.session.userId;
  const month = DATE_RE.test(req.query.month) ? req.query.month : currentMonth();
  const category = typeof req.query.category === 'string' && EXPENSE_CATEGORIES.includes(req.query.category) ? req.query.category : null;

  let sql = 'SELECT * FROM expenses WHERE user_id = ? AND date LIKE ?';
  const params = [uid, `${month}%`];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY date DESC, id DESC';

  const expenses = db.prepare(sql).all(...params).map((e) => ({
    id: e.id, amount: toDollars(e.amount_cents), category: e.category,
    description: e.description, date: e.date,
  }));

  return res.json({
    month,
    months: activityMonths(uid),
    expenses,
    summary: {
      total: monthlyExpenses(uid, month),
      byCategory: expenseBreakdown(uid, month),
    },
  });
});

router.post('/expenses', (req, res) => {
  const amount = parseAmountCents(req.body.amount);
  const category = EXPENSE_CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 300) : '';
  const date = typeof req.body.date === 'string' ? req.body.date : '';

  if (!amount) return bad(res, 'Please enter a valid amount (greater than 0).');
  if (!category) return bad(res, 'Please choose a valid category.');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');
  if (date > new Date().toISOString().slice(0, 10)) return bad(res, 'Expense date cannot be in the future.');

  const res2 = db.prepare('INSERT INTO expenses (user_id, amount_cents, category, description, date, created_at) VALUES (?,?,?,?,?,?)')
    .run(req.session.userId, amount, category, description, date, new Date().toISOString());
  return res.status(201).json({ ok: true, id: Number(res2.lastInsertRowid), message: 'Expense logged.' });
});

router.put('/expenses/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Expense not found.', 404);

  const amount = parseAmountCents(req.body.amount);
  const category = EXPENSE_CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 300) : '';
  const date = typeof req.body.date === 'string' ? req.body.date : '';
  if (!amount) return bad(res, 'Please enter a valid amount (greater than 0).');
  if (!category) return bad(res, 'Please choose a valid category.');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');

  db.prepare('UPDATE expenses SET amount_cents = ?, category = ?, description = ?, date = ? WHERE id = ?')
    .run(amount, category, description, date, id);
  return res.json({ ok: true, message: 'Expense updated.' });
});

router.delete('/expenses/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Expense not found.', 404);
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return res.json({ ok: true, message: 'Expense deleted.' });
});

/* ------------------------------ Income ------------------------------ */

router.get('/income', (req, res) => {
  const rows = db.prepare('SELECT * FROM income_sources WHERE user_id = ? ORDER BY frequency = \'monthly\' DESC, date DESC').all(req.session.userId)
    .map((i) => ({
      id: i.id, name: i.name, amount: toDollars(i.amount_cents),
      category: i.category, frequency: i.frequency, date: i.date,
    }));
  return res.json({ income: rows });
});

router.post('/income', (req, res) => {
  const name = cleanStr(req.body.name, 80);
  const amount = parseAmountCents(req.body.amount);
  const category = INCOME_CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const frequency = req.body.frequency === 'one-time' ? 'one-time' : 'monthly';
  const date = typeof req.body.date === 'string' ? req.body.date : '';

  if (!name) return bad(res, 'Please enter a name for this income source.');
  if (!amount) return bad(res, 'Please enter a valid amount (greater than 0).');
  if (!category) return bad(res, 'Please choose a valid category.');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');

  const res2 = db.prepare('INSERT INTO income_sources (user_id, name, amount_cents, category, frequency, date, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(req.session.userId, name, amount, category, frequency, date, new Date().toISOString());
  return res.status(201).json({ ok: true, id: Number(res2.lastInsertRowid), message: 'Income source added.' });
});

router.put('/income/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM income_sources WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Income source not found.', 404);

  const name = cleanStr(req.body.name, 80);
  const amount = parseAmountCents(req.body.amount);
  const category = INCOME_CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const frequency = req.body.frequency === 'one-time' ? 'one-time' : 'monthly';
  const date = typeof req.body.date === 'string' ? req.body.date : '';
  if (!name) return bad(res, 'Please enter a name for this income source.');
  if (!amount) return bad(res, 'Please enter a valid amount (greater than 0).');
  if (!category) return bad(res, 'Please choose a valid category.');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');

  db.prepare('UPDATE income_sources SET name = ?, amount_cents = ?, category = ?, frequency = ?, date = ? WHERE id = ?')
    .run(name, amount, category, frequency, date, id);
  return res.json({ ok: true, message: 'Income source updated.' });
});

router.delete('/income/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM income_sources WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Income source not found.', 404);
  db.prepare('DELETE FROM income_sources WHERE id = ?').run(id);
  return res.json({ ok: true, message: 'Income source deleted.' });
});

module.exports = router;