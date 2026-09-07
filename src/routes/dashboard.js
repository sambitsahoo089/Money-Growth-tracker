/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { col, oid, toDollars, todayISO } = require('../db');
const { requireAuth, wrap } = require('../middleware');
const { currentNetWorth, netWorthSeries, monthlyIncome, monthlyExpenses, expenseBreakdown, currentMonth } = require('../analytics');

const router = express.Router();
router.use(requireAuth);

const outId = (doc) => String(doc._id);

async function habitStats(userId) {
  const uid = oid(userId);
  const [habits, completions] = await Promise.all([
    col('habits').find({ user_id: uid, archived: 0 }).sort({ created_at: 1 }).toArray(),
    col('habit_completions').find({ user_id: uid }).toArray(),
  ]);
  const byHabit = new Map(); // habit id (string) -> Set of dates
  for (const c of completions) {
    const key = String(c.habit_id);
    if (!byHabit.has(key)) byHabit.set(key, new Set());
    byHabit.get(key).add(c.date);
  }

  const today = todayISO();
  const dow = (new Date()).getDay(); // 0 Sun .. 6 Sat
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - ((dow + 6) % 7)); return d.toISOString().slice(0, 10); })();

  return habits.map((h) => {
    const dates = byHabit.get(outId(h)) || new Set();
    const doneToday = dates.has(today);

    let currentStreak = 0;
    let bestStreak = 0;
    if (h.frequency === 'daily') {
      let streak = 0;
      const d = new Date();
      if (!dates.has(today)) d.setDate(d.getDate() - 1); // grace: streak counts if yesterday done
      while (dates.has(d.toISOString().slice(0, 10))) {
        streak += 1;
        d.setDate(d.getDate() - 1);
      }
      currentStreak = streak;
      let run = 0;
      const start = new Date(); start.setDate(start.getDate() - 120);
      for (let dd = new Date(start); dd <= new Date(); dd.setDate(dd.getDate() + 1)) {
        if (dates.has(dd.toISOString().slice(0, 10))) { run += 1; bestStreak = Math.max(bestStreak, run); }
        else run = 0;
      }
    } else if (h.frequency === 'weekly') {
      // current streak in weeks
      let streak = 0;
      const w = new Date(weekStart);
      if (![...dates].some((d) => d >= weekStart)) w.setDate(w.getDate() - 7);
      while ([...dates].some((d) => { const dw = new Date(d); const dws = new Date(w); const diff = Math.round((dws - dw) / 86400000); return diff >= 0 && diff < 7; })) {
        streak += 1;
        w.setDate(w.getDate() - 7);
      }
      currentStreak = streak;
      bestStreak = streak; // approximate for weekly
    } else {
      const monthKey = today.slice(0, 7);
      const monthsDone = new Set([...dates].map((d) => d.slice(0, 7)));
      currentStreak = 0;
      const m = new Date();
      if (!monthsDone.has(monthKey)) m.setMonth(m.getMonth() - 1);
      while (monthsDone.has(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)) {
        currentStreak += 1;
        m.setMonth(m.getMonth() - 1);
      }
      bestStreak = currentStreak;
    }

    const completionsThisMonth = [...dates].filter((d) => d.startsWith(today.slice(0, 7))).length;

    return {
      id: outId(h),
      name: h.name,
      frequency: h.frequency,
      reminder: !!h.reminder,
      doneToday,
      currentStreak,
      bestStreak,
      completionsThisMonth,
    };
  });
}

router.get('/', wrap(async (req, res) => {
  const uid = req.session.userId;
  const month = currentMonth();
  const income = await monthlyIncome(uid, month);
  const expenses = await monthlyExpenses(uid, month);
  const savingsRate = income.total > 0 ? Math.max(0, (income.total - expenses) / income.total) : 0;

  const [goals, habits, recent] = await Promise.all([
    col('goals').find({ user_id: oid(uid) }).toArray(),
    habitStats(uid),
    col('expenses').find({ user_id: oid(uid) }).sort({ date: -1, _id: -1 }).limit(6).toArray(),
  ]);
  const topGoals = goals
    .sort((a, b) => (b.current_cents / b.target_cents) - (a.current_cents / a.target_cents))
    .slice(0, 3)
    .map((g) => ({
      id: outId(g),
      name: g.name,
      target: toDollars(g.target_cents),
      current: toDollars(g.current_cents),
      percent: Math.min(100, Math.round((g.current_cents / g.target_cents) * 100)),
      deadline: g.deadline,
      color: g.color,
    }));

  const habitsDue = habits.filter((h) => !h.doneToday);

  const recentOut = recent.map((e) => ({ id: outId(e), amount: toDollars(e.amount_cents), category: e.category, description: e.description, date: e.date }));
  const netWorthSeriesData = await netWorthSeries(uid, 6);

  // Previous month for the delta stats
  const prevDate = new Date(); prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevExpenses = await monthlyExpenses(uid, prevMonth);
  const prevIncome = await monthlyIncome(uid, prevMonth);

  const series = netWorthSeriesData;
  const netWorthDelta = series.length >= 2 ? series[series.length - 1].value - series[0].value : 0;

  return res.json({
    netWorth: await currentNetWorth(uid),
    netWorthDelta,
    netWorthSeries: series,
    income: income.total,
    expenses,
    prevExpenses,
    prevIncome,
    savingsRate,
    goals: topGoals,
    habitsDue,
    habitsTotal: habits.length,
    recent: recentOut,
    categoryBreakdown: await expenseBreakdown(uid, month),
    month,
  });
}));

module.exports = router;
