/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const { col, oid, toDollars } = require('./db');

/** Collections store user_id as ObjectId; routes pass the hex-string id from the session. */
function toUid(userId) {
  const id = oid(userId);
  if (!id) throw new Error('Invalid user id.');
  return id;
}

function outId(doc) {
  return doc ? String(doc._id) : null;
}

/** Latest valuation per asset identity (name + type) — i.e. current portfolio. */
async function currentAssets(userId) {
  const uid = toUid(userId);
  const rows = await col('assets').aggregate([
    { $match: { user_id: uid } },
    { $sort: { date: 1, _id: 1 } },
    { $group: { _id: { name: '$name', type: '$type' }, doc: { $last: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { type: 1, name: 1 } },
  ]).toArray();
  return rows.map((r) => ({ id: outId(r), name: r.name, type: r.type, value: toDollars(r.value_cents), date: r.date }));
}

async function currentNetWorth(userId) {
  const assets = await currentAssets(userId);
  return assets.reduce((s, a) => s + a.value, 0);
}

/**
 * Net worth as a step function over the trailing `months` months.
 * For each month end, the latest valuation (per asset identity) at or before
 * that month end is used.
 */
async function netWorthSeries(userId, months = 6) {
  const uid = toUid(userId);
  const assets = await col('assets').find({ user_id: uid }).sort({ date: 1 }).toArray();
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
async function monthlyIncome(userId, month) {
  const uid = toUid(userId);
  const rows = await col('income_sources').find({ user_id: uid }).toArray();
  let recurringCents = 0;
  let oneTimeCents = 0;
  for (const r of rows) {
    if (r.frequency === 'monthly') recurringCents += r.amount_cents;
    else if (r.frequency === 'one-time' && r.date.startsWith(month)) oneTimeCents += r.amount_cents;
  }
  return { recurring: toDollars(recurringCents), oneTime: toDollars(oneTimeCents), total: toDollars(recurringCents + oneTimeCents) };
}

async function monthlyExpenses(userId, month) {
  const uid = toUid(userId);
  const rows = await col('expenses').find({ user_id: uid, date: { $regex: `^${month}` } }).toArray();
  return toDollars(rows.reduce((s, e) => s + e.amount_cents, 0));
}

async function expenseBreakdown(userId, month) {
  const uid = toUid(userId);
  const rows = await col('expenses').aggregate([
    { $match: { user_id: uid, date: { $regex: `^${month}` } } },
    { $group: { _id: '$category', c: { $sum: '$amount_cents' } } },
    { $sort: { c: -1 } },
  ]).toArray();
  return rows.map((r) => ({ category: r._id, total: toDollars(r.c) }));
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Months (YYYY-MM) that have expense or income activity, newest first. */
async function activityMonths(userId) {
  const uid = toUid(userId);
  const [expenseMonths, incomeMonths] = await Promise.all([
    col('expenses').aggregate([
      { $match: { user_id: uid } },
      { $group: { _id: { $substrCP: ['$date', 0, 7] } } },
    ]).toArray(),
    col('income_sources').aggregate([
      { $match: { user_id: uid } },
      { $group: { _id: { $substrCP: ['$date', 0, 7] } } },
    ]).toArray(),
  ]);
  const months = new Set();
  for (const r of expenseMonths) months.add(r._id);
  for (const r of incomeMonths) months.add(r._id);
  return [...months].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
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
