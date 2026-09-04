'use strict';

const express = require('express');
const { db, toDollars, todayISO } = require('../db');
const { requireAuth } = require('../middleware');
const { cleanStr, isValidDate, parseAmountCents, bad } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

const COLORS = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

function goalOut(g) {
  const percent = g.target_cents > 0 ? Math.min(100, Math.round((g.current_cents / g.target_cents) * 100)) : 0;
  let daysLeft = null;
  if (g.deadline) daysLeft = Math.ceil((new Date(g.deadline + 'T23:59:59') - new Date()) / 86400000);
  return {
    id: g.id,
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

router.get('/', (req, res) => {
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at').all(req.session.userId).map(goalOut);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.current, 0);
  return res.json({ goals, totals: { target: totalTarget, current: totalCurrent, percent: totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0 } });
});

router.post('/', (req, res) => {
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

  const res2 = db.prepare('INSERT INTO goals (user_id, name, target_cents, current_cents, deadline, color, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(req.session.userId, name, target, current, deadline, color, new Date().toISOString());
  return res.status(201).json({ ok: true, id: Number(res2.lastInsertRowid), message: 'Goal created. Future you says thanks!' });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const g = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, req.session.userId);
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

  db.prepare('UPDATE goals SET name = ?, target_cents = ?, current_cents = ?, deadline = ?, color = ? WHERE id = ?')
    .run(name, target, current, deadline, color, id);
  return res.json({ ok: true, message: 'Goal updated.' });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const g = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!g) return bad(res, 'Goal not found.', 404);
  db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  return res.json({ ok: true, message: 'Goal removed.' });
});

/** Add (or subtract, for negative amounts) money to a goal. */
router.post('/:id/contribute', (req, res) => {
  const id = Number(req.params.id);
  const g = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!g) return bad(res, 'Goal not found.', 404);

  const raw = typeof req.body.amount === 'string' ? req.body.amount.replace(/[,$\s]/g, '') : req.body.amount;
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return bad(res, 'Please enter a non-zero amount.');
  const delta = Math.round(n * 100);
  if (Math.abs(delta) > 99999999900) return bad(res, 'Amount is too large.');

  const next = g.current_cents + delta;
  if (next < 0) return bad(res, 'Contribution would make the saved amount negative.');
  if (next > g.target_cents) return bad(res, `This goal's target is ${toDollars(g.target_cents).toFixed(2)} — add at most ${toDollars(g.target_cents - g.current_cents).toFixed(2)} more.`);

  db.prepare('UPDATE goals SET current_cents = ? WHERE id = ?').run(next, id);
  return res.json({ ok: true, message: delta > 0 ? `Contributed ${toDollars(delta).toFixed(2)}. 🎉` : `Withdrew ${toDollars(-delta).toFixed(2)}.` });
});

module.exports = router;