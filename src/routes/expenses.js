/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { col, oid, toDollars } = require('../db');
const { requireAuth, wrap } = require('../middleware');
const {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, cleanStr,
  isValidDate, parseAmountCents, bad,
} = require('../helpers');
const { monthlyIncome, monthlyExpenses, expenseBreakdown, currentMonth, activityMonths } = require('../analytics');

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}$/;
const outId = (doc) => String(doc._id);
const toUserId = (s) => oid(s); // route-level user ids come from the session

function expenseOut(e) {
  return {
    id: outId(e), amount: toDollars(e.amount_cents), category: e.category,
    description: e.description, date: e.date,
  };
}

/* ----------------------------- Expenses ----------------------------- */

router.get('/expenses', wrap(async (req, res) => {
  const uid = toUserId(req.session.userId);
  const month = DATE_RE.test(req.query.month) ? req.query.month : currentMonth();
  const category = typeof req.query.category === 'string' && EXPENSE_CATEGORIES.includes(req.query.category) ? req.query.category : null;

  const filter = { user_id: uid, date: { $regex: `^${month}` } };
  if (category) filter.category = category;

  const expenses = (await col('expenses').find(filter).sort({ date: -1, _id: -1 }).toArray()).map(expenseOut);

  return res.json({
    month,
    months: await activityMonths(req.session.userId),
    expenses,
    summary: {
      total: await monthlyExpenses(req.session.userId, month),
      byCategory: await expenseBreakdown(req.session.userId, month),
    },
  });
}));

router.post('/expenses', wrap(async (req, res) => {
  const amount = parseAmountCents(req.body.amount);
  const category = EXPENSE_CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 300) : '';
  const date = typeof req.body.date === 'string' ? req.body.date : '';

  if (!amount) return bad(res, 'Please enter a valid amount (greater than 0).');
  if (!category) return bad(res, 'Please choose a valid category.');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');
  if (date > new Date().toISOString().slice(0, 10)) return bad(res, 'Expense date cannot be in the future.');

  const res2 = await col('expenses').insertOne({
    user_id: toUserId(req.session.userId), amount_cents: amount, category, description, date,
    created_at: new Date().toISOString(),
  });
  return res.status(201).json({ ok: true, id: String(res2.insertedId), message: 'Expense logged.' });
}));

router.put('/expenses/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('expenses').findOne({ _id: id, user_id: toUserId(req.session.userId) });
  if (!existing) return bad(res, 'Expense not found.', 404);

  const amount = parseAmountCents(req.body.amount);
  const category = EXPENSE_CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 300) : '';
  const date = typeof req.body.date === 'string' ? req.body.date : '';
  if (!amount) return bad(res, 'Please enter a valid amount (greater than 0).');
  if (!category) return bad(res, 'Please choose a valid category.');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');

  await col('expenses').updateOne({ _id: id }, { $set: { amount_cents: amount, category, description, date } });
  return res.json({ ok: true, message: 'Expense updated.' });
}));

router.delete('/expenses/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('expenses').findOne({ _id: id, user_id: toUserId(req.session.userId) });
  if (!existing) return bad(res, 'Expense not found.', 404);
  await col('expenses').deleteOne({ _id: id });
  return res.json({ ok: true, message: 'Expense deleted.' });
}));

/* ------------------------------ Income ------------------------------ */

router.get('/income', wrap(async (req, res) => {
  const rows = await col('income_sources').find({ user_id: toUserId(req.session.userId) }).toArray();
  // Order: monthly sources first, then date desc (matches the SQL ORDER BY frequency = 'monthly' DESC, date DESC)
  rows.sort((a, b) => {
    if (a.frequency === 'monthly' && b.frequency !== 'monthly') return -1;
    if (b.frequency === 'monthly' && a.frequency !== 'monthly') return 1;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
  return res.json({
    income: rows.map((i) => ({
      id: outId(i), name: i.name, amount: toDollars(i.amount_cents),
      category: i.category, frequency: i.frequency, date: i.date,
    })),
  });
}));

router.post('/income', wrap(async (req, res) => {
  const name = cleanStr(req.body.name, 80);
  const amount = parseAmountCents(req.body.amount);
  const category = INCOME_CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const frequency = req.body.frequency === 'one-time' ? 'one-time' : 'monthly';
  const date = typeof req.body.date === 'string' ? req.body.date : '';

  if (!name) return bad(res, 'Please enter a name for this income source.');
  if (!amount) return bad(res, 'Please enter a valid amount (greater than 0).');
  if (!category) return bad(res, 'Please choose a valid category.');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');

  const res2 = await col('income_sources').insertOne({
    user_id: toUserId(req.session.userId), name, amount_cents: amount, category, frequency, date,
    created_at: new Date().toISOString(),
  });
  return res.status(201).json({ ok: true, id: String(res2.insertedId), message: 'Income source added.' });
}));

router.put('/income/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('income_sources').findOne({ _id: id, user_id: toUserId(req.session.userId) });
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

  await col('income_sources').updateOne({ _id: id }, { $set: { name, amount_cents: amount, category, frequency, date } });
  return res.json({ ok: true, message: 'Income source updated.' });
}));

router.delete('/income/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('income_sources').findOne({ _id: id, user_id: toUserId(req.session.userId) });
  if (!existing) return bad(res, 'Income source not found.', 404);
  await col('income_sources').deleteOne({ _id: id });
  return res.json({ ok: true, message: 'Income source deleted.' });
}));

module.exports = router;
