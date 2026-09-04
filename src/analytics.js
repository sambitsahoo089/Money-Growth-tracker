/*
 * Freebuff — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const { db, toDollars } = require('./db');

/** Latest valuation per asset identity (name + type) — i.e. current portfolio. */
function currentAssets(userId) {
  const rows = db.prepare(`
    SELECT a.* FROM assets a
    JOIN (SELECT name, type, MAX(date) AS md FROM assets WHERE user_id = ? GROUP BY name, type) l
      ON a.name = l.name AND a.type = l.type AND a.date = l.md
    WHERE a.user_id = ?
    ORDER BY a.type, a.name`).all(userId, userId);
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, value: toDollars(r.value_cents), date: r.date }));
}

function currentNetWorth(userId) {
  return currentAssets(userId).reduce((s, a) => s + a.value, 0);
}

/**
 * Net worth as a step function over the trailing `months` months.
 * For each month end, the latest valuation (per asset identity) at or before
 * that month end is used.
 */
function netWorthSeries(userId, months = 6) {
  const assets = db.prepare('SELECT name, type, value_cents, date FROM assets WHERE user_id = ? ORDER BY date ASC').all(userId);
  if (assets.length === 0) return [];

  const points = [];
  const now = new Date();
  for (let m = months - 1; m >= 0; m--) {
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59); // last day of that month
    const endISO = end.toISOString().slice(0, 10);
    const latest = new Map(); // name|type -> cents
    for (const a of assets) {
      if (a.date > endISO) continue;
      latest.set(`${a.name}|${a.type}`, a.value_cents);
    }
    let total = 0;
    for (const cents of latest.values()) total += cents;
    points.push({ label: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`, value: toDollars(total) });
  }
  return points;
}

/** Income credited during month YYYY-MM: recurring sources + one-time entries dated in that month. */
function monthlyIncome(userId, month) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN frequency = 'monthly' THEN amount_cents ELSE 0 END), 0) AS recurring_cents,
      COALESCE(SUM(CASE WHEN frequency = 'one-time' AND date LIKE ? THEN amount_cents ELSE 0 END), 0) AS one_time_cents
    FROM income_sources WHERE user_id = ?`).get(`${month}%`, userId);
  return { recurring: toDollars(row.recurring_cents), oneTime: toDollars(row.one_time_cents), total: toDollars(row.recurring_cents + row.one_time_cents) };
}

function monthlyExpenses(userId, month) {
  const row = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM expenses WHERE user_id = ? AND date LIKE ?')
    .get(userId, `${month}%`);
  return toDollars(row.c);
}

function expenseBreakdown(userId, month) {
  const rows = db.prepare(`
    SELECT category, SUM(amount_cents) AS c FROM expenses
    WHERE user_id = ? AND date LIKE ?
    GROUP BY category ORDER BY c DESC`).all(userId, `${month}%`);
  return rows.map((r) => ({ category: r.category, total: toDollars(r.c) }));
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Months (YYYY-MM) that have expense or income activity, newest first. */
function activityMonths(userId) {
  const rows = db.prepare(`
    SELECT DISTINCT substr(date, 1, 7) AS m FROM expenses WHERE user_id = ?
    UNION SELECT DISTINCT substr(date, 1, 7) FROM income_sources WHERE user_id = ?
    ORDER BY m DESC`).all(userId, userId);
  return rows.map((r) => r.m);
}

module.exports = {
  currentAssets,
  currentNetWorth,
  netWorthSeries,
  monthlyIncome,
  monthlyExpenses,
  expenseBreakdown,
  currentMonth,
  activityMonths,
};