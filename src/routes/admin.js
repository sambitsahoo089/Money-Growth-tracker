/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { col, oid, toDollars } = require('../db');
const { requireAdmin, wrap } = require('../middleware');
const { bad } = require('../helpers');

const router = express.Router();
router.use(requireAdmin);

const outId = (doc) => String(doc._id);

router.get('/metrics', wrap(async (req, res) => {
  const users = col('users');
  const expenses = col('expenses');
  const feedback = col('feedback');
  const goals = col('goals');
  const habits = col('habits');
  const completions = col('habit_completions');

  const iso30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [totalUsers, active30, suspended, totalExpenses, expenseAgg, openFeedback, totalFeedback, goalAgg, habitsTracked, completionCount] = await Promise.all([
    users.countDocuments({ role: 'client' }),
    users.countDocuments({ role: 'client', last_login_at: { $gte: iso30 } }),
    users.countDocuments({ suspended: 1 }),
    expenses.countDocuments({}),
    expenses.aggregate([{ $group: { _id: null, c: { $sum: '$amount_cents' } } }]).next(),
    feedback.countDocuments({ status: 'open' }),
    feedback.countDocuments({}),
    goals.aggregate([{ $group: { _id: null, c: { $sum: '$current_cents' } } }]).next(),
    habits.countDocuments({}),
    completions.countDocuments({}),
  ]);

  // Cumulative client registrations over the last 6 months
  const registrations = [];
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const c = await users.countDocuments({ role: 'client', created_at: { $gte: start.toISOString(), $lt: end.toISOString() } });
    registrations.push({ label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, count: c });
  }

  // Platform-wide spending by category
  const spendingRows = await expenses.aggregate([
    { $group: { _id: '$category', c: { $sum: '$amount_cents' } } },
    { $sort: { c: -1 } },
  ]).toArray();
  const spending = spendingRows.map((r) => ({ category: r._id, total: toDollars(r.c) }));

  const goalAggCount = await goals.countDocuments({});

  return res.json({
    users: { total: totalUsers, active30, suspended },
    activity: { expenses: totalExpenses, expenseValue: toDollars(expenseAgg ? expenseAgg.c : 0), habits: habitsTracked, completions: completionCount },
    goals: { total: goalAggCount, value: toDollars(goalAgg ? goalAgg.c : 0) },
    feedback: { open: openFeedback, total: totalFeedback },
    registrations,
    spending,
  });
}));

router.get('/users', wrap(async (req, res) => {
  const rows = await col('users').aggregate([
    { $sort: { created_at: -1 } },
    {
      $lookup: {
        from: 'expenses',
        let: { uid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$user_id', '$$uid'] } } }, { $count: 'n' }],
        as: 'expenses',
      },
    },
    {
      $lookup: {
        from: 'goals',
        let: { uid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$user_id', '$$uid'] } } }, { $count: 'n' }],
        as: 'goals',
      },
    },
  ]).toArray();

  const users = rows.map((u) => ({
    id: outId(u),
    name: u.name,
    email: u.email,
    role: u.role,
    currency: u.currency,
    suspended: !!u.suspended,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    expenseCount: (u.expenses[0] && u.expenses[0].n) || 0,
    goalCount: (u.goals[0] && u.goals[0].n) || 0,
  }));
  return res.json({ users });
}));

router.put('/users/:id/suspend', wrap(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return bad(res, 'User not found.', 404);
  if (String(id) === req.session.userId) return bad(res, 'You cannot suspend your own account.');
  const target = await col('users').findOne({ _id: id });
  if (!target) return bad(res, 'User not found.', 404);
  if (target.role === 'admin') return bad(res, 'Admin accounts cannot be suspended.');
  const suspended = req.body.suspended ? 1 : 0;
  await col('users').updateOne({ _id: id }, { $set: { suspended } });
  return res.json({ ok: true, message: suspended ? 'Account suspended.' : 'Account re-activated.' });
}));

router.get('/feedback', wrap(async (req, res) => {
  const status = req.query.status === 'resolved' ? 'resolved' : req.query.status === 'open' ? 'open' : null;
  const match = status ? { $match: { status } } : { $match: {} };
  const rows = await col('feedback').aggregate([
    match,
    { $sort: { created_at: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user',
      },
    },
  ]).toArray();

  const feedback = rows.map((f) => {
    const u = f.user[0] || {};
    return {
      id: outId(f),
      subject: f.subject,
      message: f.message,
      status: f.status,
      created_at: f.created_at,
      user_name: u.name || 'Unknown user',
      user_email: u.email || '',
    };
  });
  return res.json({ feedback });
}));

router.put('/feedback/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const item = id && await col('feedback').findOne({ _id: id });
  if (!item) return bad(res, 'Feedback item not found.', 404);
  const status = req.body.status === 'resolved' ? 'resolved' : 'open';
  await col('feedback').updateOne({ _id: id }, { $set: { status } });
  return res.json({ ok: true, message: status === 'resolved' ? 'Marked as resolved.' : 'Re-opened.' });
}));

module.exports = router;
