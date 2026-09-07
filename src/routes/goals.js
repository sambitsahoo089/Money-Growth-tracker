/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { col, oid, toDollars, todayISO } = require('../db');
const { requireAuth, wrap } = require('../middleware');
const { cleanStr, isValidDate, parseAmountCents, bad } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

const COLORS = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

function goalOut(g) {
  const percent = g.target_cents > 0 ? Math.min(100, Math.round((g.current_cents / g.target_cents) * 100)) : 0;
  let daysLeft = null;
  if (g.deadline) daysLeft = Math.ceil((new Date(g.deadline + 'T23:59:59') - new Date()) / 86400000);
  return {
    id: String(g._id),
    name: g.name,
    target: toDollars(g.target_cents),
    current: toDollars(g.current_cents),
    percent,
    deadline: g.deadline,
    daysLeft,
    color: g.color,
    createdAt: g.created_at,
  };
}

router.get('/', wrap(async (req, res) => {
  const goals = (await col('goals').find({ user_id: oid(req.session.userId) }).sort({ created_at: 1 }).toArray()).map(goalOut);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.current, 0);
  return res.json({ goals, totals: { target: totalTarget, current: totalCurrent, percent: totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0 } });
}));

router.post('/', wrap(async (req, res) => {
  const name = cleanStr(req.body.name, 80);
  const target = parseAmountCents(req.body.target);
  const current = req.body.current === undefined || req.body.current === '' ? 0 : parseAmountCents(req.body.current);
  const deadline = req.body.deadline || null;
  const color = COLORS.includes(req.body.color) ? req.body.color : '#6366f1';

  if (!name) return bad(res, 'Please enter a goal name (2–80 characters).');
  if (!target) return bad(res, 'Please enter a target amount greater than 0.');
  if (current === null) return bad(res, 'Current amount must be a valid number.');
  if (current > target) return bad(res, 'Current amount cannot exceed the target.');
  if (deadline && !isValidDate(deadline)) return bad(res, 'Please enter a valid deadline date.');
  if (deadline && deadline < todayISO()) return bad(res, 'Deadline cannot be in the past.');

  const res2 = await col('goals').insertOne({
    user_id: oid(req.session.userId), name, target_cents: target, current_cents: current, deadline, color,
    created_at: new Date().toISOString(),
  });
  return res.status(201).json({ ok: true, id: String(res2.insertedId), message: 'Goal created. Future you says thanks!' });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const g = id && await col('goals').findOne({ _id: id, user_id: oid(req.session.userId) });
  if (!g) return bad(res, 'Goal not found.', 404);

  const name = cleanStr(req.body.name, 80);
  const target = parseAmountCents(req.body.target);
  const current = req.body.current === undefined || req.body.current === '' ? 0 : parseAmountCents(req.body.current);
  const deadline = req.body.deadline || null;
  const color = COLORS.includes(req.body.color) ? req.body.color : g.color;

  if (!name) return bad(res, 'Please enter a goal name (2–80 characters).');
  if (!target) return bad(res, 'Please enter a target amount greater than 0.');
  if (current === null) return bad(res, 'Current amount must be a valid number.');
  if (current > target) return bad(res, 'Current amount cannot exceed the target.');
  if (deadline && !isValidDate(deadline)) return bad(res, 'Please enter a valid deadline date.');
  if (deadline && deadline < todayISO()) return bad(res, 'Deadline cannot be in the past.');

  await col('goals').updateOne({ _id: id }, { $set: { name, target_cents: target, current_cents: current, deadline, color } });
  return res.json({ ok: true, message: 'Goal updated.' });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const g = id && await col('goals').findOne({ _id: id, user_id: oid(req.session.userId) });
  if (!g) return bad(res, 'Goal not found.', 404);
  await col('goals').deleteOne({ _id: id });
  return res.json({ ok: true, message: 'Goal removed.' });
}));

/** Add (or subtract, for negative amounts) money to a goal. */
router.post('/:id/contribute', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const g = id && await col('goals').findOne({ _id: id, user_id: oid(req.session.userId) });
  if (!g) return bad(res, 'Goal not found.', 404);

  const raw = typeof req.body.amount === 'string' ? req.body.amount.replace(/[,$\s]/g, '') : req.body.amount;
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return bad(res, 'Please enter a non-zero amount.');
  const delta = Math.round(n * 100);
  if (Math.abs(delta) > 99999999900) return bad(res, 'Amount is too large.');

  const next = g.current_cents + delta;
  if (next < 0) return bad(res, 'Contribution would make the saved amount negative.');
  if (next > g.target_cents) return bad(res, `This goal's target is ${toDollars(g.target_cents).toFixed(2)} — add at most ${toDollars(g.target_cents - g.current_cents).toFixed(2)} more.`);

  await col('goals').updateOne({ _id: id }, { $set: { current_cents: next } });
  return res.json({ ok: true, message: delta > 0 ? `Contributed ${toDollars(delta).toFixed(2)}. 🎉` : `Withdrew ${toDollars(-delta).toFixed(2)}.` });
}));

module.exports = router;
