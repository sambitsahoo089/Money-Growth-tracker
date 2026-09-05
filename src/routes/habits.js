/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { db, todayISO } = require('../db');
const { requireAuth } = require('../middleware');
const { FREQUENCIES, cleanStr, isValidDate, bad } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

/** Full habit stats: streaks + 35-day completion calendar. */
function habitWithStats(h) {
  const dates = new Set(
    db.prepare('SELECT date FROM habit_completions WHERE habit_id = ? AND user_id = ?').all(h.id, h.user_id).map((r) => r.date)
  );
  const today = todayISO();

  let currentStreak = 0;
  if (h.frequency === 'daily') {
    const d = new Date();
    if (!dates.has(today)) d.setDate(d.getDate() - 1); // grace period until day ends
    while (dates.has(d.toISOString().slice(0, 10))) { currentStreak += 1; d.setDate(d.getDate() - 1); }
  } else if (h.frequency === 'weekly') {
    const dow = (new Date()).getDay();
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((dow + 6) % 7));
    const w = new Date(weekStart);
    const hasWeek = (ws) => [...dates].some((d) => { const t = new Date(d); const diff = Math.round((ws - t) / 86400000); return diff >= 0 && diff < 7; });
    if (!hasWeek(w)) w.setDate(w.getDate() - 7);
    while (hasWeek(w)) { currentStreak += 1; w.setDate(w.getDate() - 7); }
  } else { // monthly
    const thisMonth = today.slice(0, 7);
    const monthsDone = new Set([...dates].map((d) => d.slice(0, 7)));
    const m = new Date();
    if (!monthsDone.has(thisMonth)) m.setMonth(m.getMonth() - 1);
    while (monthsDone.has(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)) {
      currentStreak += 1;
      m.setMonth(m.getMonth() - 1);
    }
  }

  // Best streak (daily: exact; weekly/monthly: approximate to current)
  let bestStreak = currentStreak;
  if (h.frequency === 'daily') {
    let run = 0;
    const start = new Date(); start.setDate(start.getDate() - 150);
    for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
      if (dates.has(d.toISOString().slice(0, 10))) { run += 1; bestStreak = Math.max(bestStreak, run); }
      else run = 0;
    }
  }

  const completionsThisMonth = [...dates].filter((d) => d.startsWith(today.slice(0, 7))).length;
  const expectedThisMonth = h.frequency === 'daily' ? new Date().getDate()
    : h.frequency === 'weekly' ? Math.ceil(new Date().getDate() / 7) : 1;

  // 35-day calendar grid (oldest → newest)
  const calendar = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    calendar.push({ date: iso, day: d.getDate(), done: dates.has(iso) });
  }

  return {
    id: h.id,
    name: h.name,
    frequency: h.frequency,
    unit: h.frequency === 'daily' ? 'day' : h.frequency === 'weekly' ? 'week' : 'month',
    reminder: !!h.reminder,
    archived: !!h.archived,
    createdAt: h.created_at,
    doneToday: dates.has(today),
    currentStreak,
    bestStreak,
    completionsThisMonth,
    expectedThisMonth,
    completionRate: expectedThisMonth > 0 ? Math.round((completionsThisMonth / expectedThisMonth) * 100) : 0,
    calendar,
  };
}

router.get('/', (req, res) => {
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND archived = 0 ORDER BY created_at').all(req.session.userId);
  return res.json({ habits: habits.map(habitWithStats) });
});

router.post('/', (req, res) => {
  const name = cleanStr(req.body.name, 80);
  const frequency = FREQUENCIES.includes(req.body.frequency) ? req.body.frequency : 'daily';
  if (!name) return bad(res, 'Please enter a habit name (2–80 characters).');
  const reminder = req.body.reminder ? 1 : 0;
  const res2 = db.prepare('INSERT INTO habits (user_id, name, frequency, reminder, archived, created_at) VALUES (?,?,?,?,?,?)')
    .run(req.session.userId, name, frequency, reminder, 0, new Date().toISOString());
  return res.status(201).json({ ok: true, id: Number(res2.lastInsertRowid), message: 'Habit created. Consistency is a superpower!' });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Habit not found.', 404);
  const name = cleanStr(req.body.name, 80);
  const frequency = FREQUENCIES.includes(req.body.frequency) ? req.body.frequency : 'daily';
  if (!name) return bad(res, 'Please enter a habit name (2–80 characters).');
  const reminder = req.body.reminder ? 1 : 0;
  db.prepare('UPDATE habits SET name = ?, frequency = ?, reminder = ? WHERE id = ?').run(name, frequency, reminder, id);
  return res.json({ ok: true, message: 'Habit updated.' });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Habit not found.', 404);
  db.prepare('DELETE FROM habit_completions WHERE habit_id = ?').run(id);
  db.prepare('DELETE FROM habits WHERE id = ?').run(id);
  return res.json({ ok: true, message: 'Habit deleted.' });
});

/** Toggle completion for a date (defaults to today). */
router.post('/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!habit) return bad(res, 'Habit not found.', 404);
  const date = typeof req.body.date === 'string' && req.body.date ? req.body.date : todayISO();
  if (!isValidDate(date)) return bad(res, 'Invalid date.');
  if (date > todayISO()) return bad(res, 'Cannot mark a future date.');

  const existing = db.prepare('SELECT id FROM habit_completions WHERE habit_id = ? AND user_id = ? AND date = ?').get(id, req.session.userId, date);
  if (existing) {
    db.prepare('DELETE FROM habit_completions WHERE id = ?').run(existing.id);
    return res.json({ ok: true, done: false, message: 'Marked as not done.' });
  }
  db.prepare('INSERT OR IGNORE INTO habit_completions (habit_id, user_id, date) VALUES (?,?,?)').run(id, req.session.userId, date);
  return res.json({ ok: true, done: true, message: 'Nice! One step closer to the streak. 🔥' });
});

module.exports = router;