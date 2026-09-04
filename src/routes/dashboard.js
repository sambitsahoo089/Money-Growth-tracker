'use strict';

const express = require('express');
const { db, toDollars, todayISO } = require('../db');
const { requireAuth } = require('../middleware');
const { currentNetWorth, netWorthSeries, monthlyIncome, monthlyExpenses, expenseBreakdown, currentMonth } = require('../analytics');

const router = express.Router();
router.use(requireAuth);

function habitStats(userId) {
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND archived = 0 ORDER BY created_at').all(userId);
  const completions = db.prepare('SELECT habit_id, date FROM habit_completions WHERE user_id = ?').all(userId);
  const byHabit = new Map();
  for (const c of completions) {
    if (!byHabit.has(c.habit_id)) byHabit.set(c.habit_id, new Set());
    byHabit.get(c.habit_id).add(c.date);
  }

  const today = todayISO();
  const dow = (new Date()).getDay(); // 0 Sun .. 6 Sat
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - ((dow + 6) % 7)); return d.toISOString().slice(0, 10); })();

  return habits.map((h) => {
    const dates = byHabit.get(h.id) || new Set();
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
      id: h.id,
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

router.get('/', (req, res) => {
  const uid = req.session.userId;
  const month = currentMonth();
  const income = monthlyIncome(uid, month);
  const expenses = monthlyExpenses(uid, month);
  const savingsRate = income.total > 0 ? Math.max(0, (income.total - expenses) / income.total) : 0;

  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY (current_cents * 1.0 / target_cents) DESC').all(uid)
    .slice(0, 3)
    .map((g) => ({
      id: g.id,
      name: g.name,
      target: toDollars(g.target_cents),
      current: toDollars(g.current_cents),
      percent: Math.min(100, Math.round((g.current_cents / g.target_cents) * 100)),
      deadline: g.deadline,
      color: g.color,
    }));

  const habits = habitStats(uid);
  const habitsDue = habits.filter((h) => !h.doneToday);

  const recent = db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 6').all(uid)
    .map((e) => ({ id: e.id, amount: toDollars(e.amount_cents), category: e.category, description: e.description, date: e.date }));

  const netWorthSeriesData = netWorthSeries(uid, 6);

  // Previous month for the delta stats
  const prevDate = new Date(); prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevExpenses = monthlyExpenses(uid, prevMonth);
  const prevIncome = monthlyIncome(uid, prevMonth);

  const series = netWorthSeriesData;
  const netWorthDelta = series.length >= 2 ? series[series.length - 1].value - series[0].value : 0;

  return res.json({
    netWorth: currentNetWorth(uid),
    netWorthDelta,
    netWorthSeries: series,
    income: income.total,
    expenses,
    prevExpenses,
    prevIncome,
    savingsRate,
    goals,
    habitsDue,
    habitsTotal: habits.length,
    recent,
    categoryBreakdown: expenseBreakdown(uid, month),
    month,
  });
});

module.exports = router;