'use strict';

const express = require('express');
const { db, toDollars } = require('../db');
const { requireAdmin } = require('../middleware');
const { bad } = require('../helpers');

const router = express.Router();
router.use(requireAdmin);

router.get('/metrics', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = \'client\'').get().c;
  const active30 = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = \'client\' AND last_login_at >= datetime(\'now\', \'-30 days\')').get().c;
  const totalExpenses = db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c;
  const expenseValue = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM expenses').get().c;
  const openFeedback = db.prepare('SELECT COUNT(*) AS c FROM feedback WHERE status = \'open\'').get().c;
  const totalFeedback = db.prepare('SELECT COUNT(*) AS c FROM feedback').get().c;
  const totalGoals = db.prepare('SELECT COUNT(*) AS c FROM goals').get().c;
  const goalValue = db.prepare('SELECT COALESCE(SUM(current_cents), 0) AS c FROM goals').get().c;
  const habitsTracked = db.prepare('SELECT COUNT(*) AS c FROM habits').get().c;
  const completions = db.prepare('SELECT COUNT(*) AS c FROM habit_completions').get().c;
  const suspended = db.prepare('SELECT COUNT(*) AS c FROM users WHERE suspended = 1').get().c;

  // Cumulative client registrations over the last 6 months
  const registrations = [];
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const c = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = \'client\' AND created_at >= ? AND created_at < ?').get(start.toISOString(), end.toISOString()).c;
    registrations.push({ label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, count: c });
  }

  // Platform-wide spending by category
  const spending = db.prepare('SELECT category, SUM(amount_cents) AS c FROM expenses GROUP BY category ORDER BY c DESC').all()
    .map((r) => ({ category: r.category, total: toDollars(r.c) }));

  return res.json({
    users: { total: totalUsers, active30, suspended },
    activity: { expenses: totalExpenses, expenseValue: toDollars(expenseValue), habits: habitsTracked, completions },
    goals: { total: totalGoals, value: toDollars(goalValue) },
    feedback: { open: openFeedback, total: totalFeedback },
    registrations,
    spending,
  });
});

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.currency, u.suspended, u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM expenses e WHERE e.user_id = u.id) AS expense_count,
      (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) AS goal_count
    FROM users u ORDER BY u.created_at DESC`).all()
    .map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, currency: u.currency,
      suspended: !!u.suspended, createdAt: u.created_at, lastLoginAt: u.last_login_at,
      expenseCount: u.expense_count, goalCount: u.goal_count,
    }));
  return res.json({ users });
});

router.put('/users/:id/suspend', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.userId) return bad(res, 'You cannot suspend your own account.');
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!target) return bad(res, 'User not found.', 404);
  if (target.role === 'admin') return bad(res, 'Admin accounts cannot be suspended.');
  const suspended = req.body.suspended ? 1 : 0;
  db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(suspended, id);
  return res.json({ ok: true, message: suspended ? 'Account suspended.' : 'Account re-activated.' });
});

router.get('/feedback', (req, res) => {
  const status = req.query.status === 'resolved' ? 'resolved' : req.query.status === 'open' ? 'open' : null;
  let sql = `
    SELECT f.id, f.subject, f.message, f.status, f.created_at, u.name AS user_name, u.email AS user_email
    FROM feedback f JOIN users u ON u.id = f.user_id`;
  const params = [];
  if (status) { sql += ' WHERE f.status = ?'; params.push(status); }
  sql += ' ORDER BY f.created_at DESC';
  const items = db.prepare(sql).all(...params);
  return res.json({ feedback: items });
});

router.put('/feedback/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT id FROM feedback WHERE id = ?').get(id);
  if (!item) return bad(res, 'Feedback item not found.', 404);
  const status = req.body.status === 'resolved' ? 'resolved' : 'open';
  db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id);
  return res.json({ ok: true, message: status === 'resolved' ? 'Marked as resolved.' : 'Re-opened.' });
});

module.exports = router;