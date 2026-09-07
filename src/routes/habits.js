/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { col, oid, todayISO } = require('../db');
const { requireAuth, wrap } = require('../middleware');
const { FREQUENCIES, cleanStr, isValidDate, bad } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

const outId = (doc) => String(doc._id);

/** Full habit stats: streaks + 35-day completion calendar. */
async function habitWithStats(h) {
  const completions = await col('habit_completions').find({ habit_id: h._id, user_id: h.user_id }).toArray();
  const dates = new Set(completions.map((r) => r.date));
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
    id: outId(h),
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

router.get('/', wrap(async (req, res) => {
  const habits = await col('habits').find({ user_id: oid(req.session.userId), archived: 0 }).sort({ created_at: 1 }).toArray();
  const withStats = [];
  for (const h of habits) withStats.push(await habitWithStats(h));
  return res.json({ habits: withStats });
}));

router.post('/', wrap(async (req, res) => {
  const name = cleanStr(req.body.name, 80);
  const frequency = FREQUENCIES.includes(req.body.frequency) ? req.body.frequency : 'daily';
  if (!name) return bad(res, 'Please enter a habit name (2–80 characters).');
  const reminder = req.body.reminder ? 1 : 0;
  const res2 = await col('habits').insertOne({
    user_id: oid(req.session.userId), name, frequency, reminder, archived: 0,
    created_at: new Date().toISOString(),
  });
  return res.status(201).json({ ok: true, id: String(res2.insertedId), message: 'Habit created. Consistency is a superpower!' });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('habits').findOne({ _id: id, user_id: oid(req.session.userId) });
  if (!existing) return bad(res, 'Habit not found.', 404);
  const name = cleanStr(req.body.name, 80);
  const frequency = FREQUENCIES.includes(req.body.frequency) ? req.body.frequency : 'daily';
  if (!name) return bad(res, 'Please enter a habit name (2–80 characters).');
  const reminder = req.body.reminder ? 1 : 0;
  await col('habits').updateOne({ _id: id }, { $set: { name, frequency, reminder } });
  return res.json({ ok: true, message: 'Habit updated.' });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('habits').findOne({ _id: id, user_id: oid(req.session.userId) });
  if (!existing) return bad(res, 'Habit not found.', 404);
  await Promise.all([
    col('habit_completions').deleteMany({ habit_id: id }),
    col('habits').deleteOne({ _id: id }),
  ]);
  return res.json({ ok: true, message: 'Habit deleted.' });
}));

/** Toggle completion for a date (defaults to today). */
router.post('/:id/toggle', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const habit = id && await col('habits').findOne({ _id: id, user_id: oid(req.session.userId) });
  if (!habit) return bad(res, 'Habit not found.', 404);
  const date = typeof req.body.date === 'string' && req.body.date ? req.body.date : todayISO();
  if (!isValidDate(date)) return bad(res, 'Invalid date.');
  if (date > todayISO()) return bad(res, 'Cannot mark a future date.');

  const result = await col('habit_completions').updateOne(
    { habit_id: id, user_id: oid(req.session.userId), date },
    { $setOnInsert: {} },
    { upsert: true },
  );
  if (result.upsertedCount === 0) {
    await col('habit_completions').deleteOne({ habit_id: id, user_id: oid(req.session.userId), date });
    return res.json({ ok: true, done: false, message: 'Marked as not done.' });
  }
  return res.json({ ok: true, done: true, message: 'Nice! One step closer to the streak. 🔥' });
}));

module.exports = router;
