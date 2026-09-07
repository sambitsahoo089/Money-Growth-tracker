/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
// Database name: explicit env wins, else the name embedded in the URI (e.g.
// mongodb+srv://…/wealthhabit), else a sensible default.
const URI_DB = (() => {
  try {
    const m = /^\w+:\/\/[^/]+\/([^/?]+)/.exec(MONGODB_URI);
    return m ? m[1] : null;
  } catch {
    return null;
  }
})();
const DB_NAME = process.env.MONGODB_DB || URI_DB || 'wealthhabit';

let client = null;
let database = null;

async function init() {
  if (client && database) return database;
  client = new MongoClient(MONGODB_URI, { appName: 'wealthhabit' });
  await client.connect();
  database = client.db(DB_NAME);
  await ensureIndexes(database);
  return database;
}

/** Make sure the connection exists (used by seed scripts run standalone). */
async function ensureConnected() {
  if (!database) await init();
  return database;
}

async function close() {
  if (client) await client.close();
}

/** Grab a collection — call after `await init()`. */
function col(name) {
  if (!database) throw new Error('Database not initialised — call init() before using collections.');
  return database.collection(name);
}

function isObjectIdString(s) {
  return typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);
}

/** Parse a route param into an ObjectId, or null when invalid (→ 404). */
function oid(s) {
  if (!isObjectIdString(s)) return null;
  return new ObjectId(s);
}

async function ensureIndexes(db) {
  const users = db.collection('users');
  const expenses = db.collection('expenses');
  const incomeSources = db.collection('income_sources');
  const habits = db.collection('habits');
  const completions = db.collection('habit_completions');
  const goals = db.collection('goals');
  const assets = db.collection('assets');
  const feedback = db.collection('feedback');
  const sessions = db.collection('sessions');

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    users.createIndex({ role: 1, created_at: 1 }),
    expenses.createIndex({ user_id: 1, date: -1 }),
    incomeSources.createIndex({ user_id: 1, date: -1 }),
    habits.createIndex({ user_id: 1, created_at: 1 }),
    completions.createIndex({ habit_id: 1, date: 1 }, { unique: true }),
    completions.createIndex({ user_id: 1, date: 1 }),
    goals.createIndex({ user_id: 1, created_at: 1 }),
    assets.createIndex({ user_id: 1, date: 1 }),
    feedback.createIndex({ user_id: 1 }),
    feedback.createIndex({ status: 1, created_at: -1 }),
    sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function toCents(dollars) {
  return Math.round(Number(dollars) * 100);
}
function toDollars(cents) {
  return Math.round(Number(cents)) / 100;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoMonthsAgo(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Seed — realistic sample data. Idempotent: only seeds when empty.    */
/* ------------------------------------------------------------------ */

const SEED_ADMIN_EMAIL = 'sambitkusahoo089@gmail.com';
const SEED_ADMIN_PASSWORD = 'sam@1234';

const EXPENSE_SEED = [
  // [date-days-ago, amount, category, description]
  // This month (relative to seed run)
  [0, 1850.0, 'housing', 'Rent — Maple Street apartment'],
  [0, 64.2,  'utilities', 'Electricity bill'],
  [0, 38.5,  'utilities', 'Internet — Fiber 500'],
  [0, 22.9,  'subscriptions', 'Streaming + music subscription'],
  [0, 14.99, 'subscriptions', 'Cloud storage'],
  [1, 86.4,  'food', 'Weekly groceries — Whole Foods'],
  [1, 24.6,  'food', 'Lunch with team'],
  [2, 12.5,  'transport', 'Ride share'],
  [2, 41.0,  'food', 'Weekly groceries — Trader Joe\u2019s'],
  [4, 32.0,  'food', 'Dinner out — Ramen bar'],
  [5, 9.99,  'subscriptions', 'Productivity app'],
  [6, 55.0,  'transport', 'Monthly transit pass'],
  [7, 78.3,  'food', 'Weekly groceries — Costco'],
  [8, 15.0,  'entertainment', 'Movie tickets'],
  // 1 month ago
  [32, 1850.0, 'housing', 'Rent — Maple Street apartment'],
  [33, 61.8,  'utilities', 'Electricity bill'],
  [33, 38.5,  'utilities', 'Internet — Fiber 500'],
  [34, 88.1,  'food', 'Weekly groceries'],
  [35, 26.0,  'dining', 'Brunch with friends'],
  [36, 12.5,  'transport', 'Ride share'],
  [37, 42.0,  'shopping', 'Running shoes (sale)'],
  [38, 75.0,  'health', 'Gym membership'],
  [39, 96.0,  'food', 'Weekly groceries + meal prep'],
  [40, 18.0,  'entertainment', 'Concert ticket'],
  [41, 22.9,  'subscriptions', 'Streaming + music subscription'],
  [43, 11.25, 'transport', 'Metro card top-up'],
  // 2 months ago
  [62, 1850.0, 'housing', 'Rent — Maple Street apartment'],
  [63, 59.3,  'utilities', 'Electricity bill'],
  [63, 38.5,  'utilities', 'Internet — Fiber 500'],
  [64, 92.7,  'food', 'Weekly groceries'],
  [65, 149.0, 'travel', 'Weekend trip — gas + lodging share'],
  [66, 25.0,  'dining', 'Dinner with family'],
  [67, 75.0,  'health', 'Gym membership'],
  [68, 14.99, 'subscriptions', 'Cloud storage'],
  [69, 84.2,  'food', 'Weekly groceries'],
  [70, 39.0,  'transport', 'Car maintenance (oil change)'],
  [71, 22.9,  'subscriptions', 'Streaming + music subscription'],
  [72, 56.0,  'shopping', 'Home essentials'],
  [73, 16.4,  'food', 'Lunch out'],
  // 3 months ago
  [92, 1820.0, 'housing', 'Rent — Maple Street apartment'],
  [93, 57.6,  'utilities', 'Electricity bill'],
  [93, 38.5,  'utilities', 'Internet — Fiber 500'],
  [94, 86.9,  'food', 'Weekly groceries'],
  [95, 120.0, 'entertainment', 'Streaming device + subscription'],
  [96, 11.5,  'transport', 'Metro card top-up'],
  [97, 75.0,  'health', 'Gym membership'],
  [98, 44.8,  'dining', 'Date night dinner'],
  [99, 91.5,  'food', 'Weekly groceries'],
  [100, 22.9, 'subscriptions', 'Streaming + music subscription'],
  [101, 68.0, 'shopping', 'Work clothes'],
  [102, 10.0,  'transport', 'Parking'],
  [103, 27.3,  'food', 'Team lunch'],
];

/** Expense documents (amount in cents) for a user, relative to `now`. */
function buildExpenseDocs(userId, now) {
  const rows = EXPENSE_SEED.map(([ago, amount, category, desc]) => {
    const date = new Date(now);
    date.setDate(date.getDate() - ago);
    return { amount_cents: toCents(amount), category, description: desc, date: date.toISOString().slice(0, 10) };
  });
  // A couple of explicitly-realistic dining rows (kept in 'food' category, as dining is a sub-style)
  const extraDining = (ago, amount, desc) => {
    const d = new Date(now);
    d.setDate(d.getDate() - ago);
    rows.push({ amount_cents: toCents(amount), category: 'food', description: desc, date: d.toISOString().slice(0, 10) });
  };
  extraDining(3, 18.75, 'Dinner out — Sushi spot');
  extraDining(25, 26.0, 'Brunch with friends');
  extraDining(44, 13.6, 'Coffee + pastry, caf\u00e9');

  const seen = new Set();
  return rows
    .filter((r) => {
      const key = `${r.date}|${r.amount_cents}|${r.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({ user_id: userId, created_at: now, ...r }));
}

async function seedClient({ name, email, password, currency = 'USD', joinedAt = null }) {
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);
  const userRes = await col('users').insertOne({
    name,
    email,
    password_hash: hash,
    role: 'client',
    currency,
    suspended: 0,
    created_at: joinedAt || now,
    last_login_at: now,
  });
  const userId = userRes.insertedId;

  await col('income_sources').insertMany([
    { user_id: userId, name: 'Salary — Northwind Tech', amount_cents: toCents(6400), category: 'salary', frequency: 'monthly', date: isoDaysAgo(200), created_at: now },
    { user_id: userId, name: 'Freelance design work', amount_cents: toCents(850), category: 'freelance', frequency: 'monthly', date: isoDaysAgo(180), created_at: now },
    { user_id: userId, name: 'Side project payout', amount_cents: toCents(1200), category: 'business', frequency: 'one-time', date: isoMonthsAgo(2), created_at: now },
  ]);

  const expenseDocs = buildExpenseDocs(userId, now);
  for (let i = 0; i < expenseDocs.length; i += 100) {
    await col('expenses').insertMany(expenseDocs.slice(i, i + 100));
  }

  // Habits + completions
  const habitDocs = [
    ['Log daily expenses', 'daily', 1],
    ['Transfer to savings on payday', 'weekly', 1],
    ['Review budget every Sunday', 'weekly', 1],
    ['Invest in index fund monthly', 'monthly', 1],
  ].map(([n, f, r]) => ({ user_id: userId, name: n, frequency: f, reminder: r, archived: 0, created_at: now }));
  const habitIds = [];
  for (const doc of habitDocs) {
    const res = await col('habits').insertOne(doc);
    habitIds.push(res.insertedId);
  }

  // Completions: daily habit — every day for the last 14 days except 2 (realistic gap)
  const compDocs = [];
  for (let i = 0; i < 14; i++) {
    if (i === 5 || i === 9) continue; // two missed days → current streak shows a fresh run
    compDocs.push({ habit_id: habitIds[0], user_id: userId, date: isoDaysAgo(i) });
  }
  // Weekly habits: every Monday for the last 8 weeks except 2
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let w = 0; w < 8; w++) {
    if (w === 3) continue;
    const d = new Date(monday); d.setDate(d.getDate() - w * 7);
    compDocs.push({ habit_id: habitIds[1], user_id: userId, date: d.toISOString().slice(0, 10) });
  }
  for (let w = 0; w < 8; w++) {
    if (w === 6) continue;
    const d = new Date(monday); d.setDate(d.getDate() - w * 7);
    compDocs.push({ habit_id: habitIds[2], user_id: userId, date: d.toISOString().slice(0, 10) });
  }
  // Monthly habit: first week of each of the last 3 months
  for (let m = 0; m < 3; m++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - m); d.setDate(Math.min(7, d.getDate() + 5));
    compDocs.push({ habit_id: habitIds[3], user_id: userId, date: d.toISOString().slice(0, 10) });
  }
  for (let i = 0; i < compDocs.length; i += 200) {
    await col('habit_completions').insertMany(compDocs.slice(i, i + 200));
  }

  // Goals
  const dl = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };
  await col('goals').insertMany([
    { user_id: userId, name: 'Emergency Fund', target_cents: toCents(15000), current_cents: toCents(9850), deadline: dl(10), color: '#10b981', created_at: now },
    { user_id: userId, name: 'Japan Trip', target_cents: toCents(4200), current_cents: toCents(1600), deadline: dl(8), color: '#ec4899', created_at: now },
    { user_id: userId, name: 'New Laptop', target_cents: toCents(2400), current_cents: toCents(1890), deadline: dl(2), color: '#6366f1', created_at: now },
  ]);

  // Assets — multiple valuations per account so the net-worth trend line rises
  const assetDocs = [];
  const av = (name, type, cents, daysAgo, note = '') => assetDocs.push({ user_id: userId, name, type, value_cents: cents, date: isoDaysAgo(daysAgo), note, created_at: now });
  av('Checking — Chase', 'checking', toCents(3120), 95, 'Main checking account');
  av('Checking — Chase', 'checking', toCents(3480), 62);
  av('Checking — Chase', 'checking', toCents(3940), 30);
  av('Checking — Chase', 'checking', toCents(4210), 1);
  av('High-Yield Savings', 'savings', toCents(7200), 95, 'Emergency fund — 4.2% APY');
  av('High-Yield Savings', 'savings', toCents(8150), 62);
  av('High-Yield Savings', 'savings', toCents(9000), 30);
  av('High-Yield Savings', 'savings', toCents(9850), 1);
  av('Vanguard Total Market ETF', 'investments', toCents(18300), 95, 'Taxable brokerage');
  av('Vanguard Total Market ETF', 'investments', toCents(19850), 62);
  av('Vanguard Total Market ETF', 'investments', toCents(22100), 30);
  av('Vanguard Total Market ETF', 'investments', toCents(24300), 1);
  av('401(k) — Northwind', 'retirement', toCents(52800), 95, '7% match');
  av('401(k) — Northwind', 'retirement', toCents(56100), 62);
  av('401(k) — Northwind', 'retirement', toCents(58900), 30);
  av('401(k) — Northwind', 'retirement', toCents(61750), 1);
  av('Roth IRA', 'retirement', toCents(10400), 95);
  av('Roth IRA', 'retirement', toCents(11200), 62);
  av('Roth IRA', 'retirement', toCents(11850), 30);
  av('Roth IRA', 'retirement', toCents(12400), 1);
  av('Crypto (BTC + ETH)', 'crypto', toCents(2700), 95);
  av('Crypto (BTC + ETH)', 'crypto', toCents(2900), 62);
  av('Crypto (BTC + ETH)', 'crypto', toCents(3050), 30);
  av('Crypto (BTC + ETH)', 'crypto', toCents(3100), 1);
  for (let i = 0; i < assetDocs.length; i += 100) {
    await col('assets').insertMany(assetDocs.slice(i, i + 100));
  }

  await col('feedback').insertMany([
    { user_id: userId, subject: 'Love the habit streaks', message: 'The daily streak for logging expenses keeps me honest. Would love a widget for the phone home screen.', status: 'open', created_at: isoDaysAgo(4) + 'T09:14:00.000Z' },
    { user_id: userId, subject: 'Currency display bug on reports', message: 'Monthly report showed the total in USD even though my profile currency is EUR.', status: 'resolved', created_at: isoDaysAgo(21) + 'T18:32:00.000Z' },
  ]);

  return userId;
}

async function seedClientSam() {
  const now = new Date().toISOString();
  const joined = isoMonthsAgo(2) + 'T10:00:00.000Z';
  const hash = bcrypt.hashSync('DemoPass1', 10);
  const userRes = await col('users').insertOne({
    name: 'Sam Rivera',
    email: 'sam@example.com',
    password_hash: hash,
    role: 'client',
    currency: 'USD',
    suspended: 0,
    created_at: joined,
    last_login_at: now,
  });
  const userId = userRes.insertedId;

  await col('income_sources').insertMany([
    { user_id: userId, name: 'Salary — Bridgepoint Studio', amount_cents: toCents(4200), category: 'salary', frequency: 'monthly', date: isoDaysAgo(200), created_at: now },
  ]);

  const expenseDocs = buildExpenseDocs(userId, now);
  for (let i = 0; i < expenseDocs.length; i += 100) {
    await col('expenses').insertMany(expenseDocs.slice(i, i + 100));
  }

  const habitDocs = [
    ['Log daily expenses', 'daily', 1],
    ['Transfer to savings on payday', 'weekly', 1],
    ['Review budget every Sunday', 'weekly', 1],
    ['Invest in index fund monthly', 'monthly', 1],
  ].map(([n, f, r]) => ({ user_id: userId, name: n, frequency: f, reminder: r, archived: 0, created_at: now }));
  const habitIds = [];
  for (const doc of habitDocs) {
    const res = await col('habits').insertOne(doc);
    habitIds.push(res.insertedId);
  }

  const compDocs = [];
  for (let i = 0; i < 12; i++) { if (i === 4 || i === 8) continue; compDocs.push({ habit_id: habitIds[0], user_id: userId, date: isoDaysAgo(i) }); }
  await col('habit_completions').insertMany(compDocs);

  const dl = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };
  await col('goals').insertMany([
    { user_id: userId, name: 'Down payment on a car', target_cents: toCents(9000), current_cents: toCents(4600), deadline: dl(6), color: '#f59e0b', created_at: now },
    { user_id: userId, name: 'Emergency Fund', target_cents: toCents(12000), current_cents: toCents(8100), deadline: dl(5), color: '#10b981', created_at: now },
    { user_id: userId, name: 'Weekend hiking gear', target_cents: toCents(900), current_cents: toCents(720), deadline: dl(1), color: '#06b6d4', created_at: now },
  ]);

  const assetDocs = [];
  const av = (name, type, cents, daysAgo, note = '') => assetDocs.push({ user_id: userId, name, type, value_cents: cents, date: isoDaysAgo(daysAgo), note, created_at: now });
  av('Checking — BofA', 'checking', toCents(2450), 60);
  av('Checking — BofA', 'checking', toCents(2890), 1);
  av('High-Yield Savings', 'savings', toCents(6200), 60);
  av('High-Yield Savings', 'savings', toCents(8100), 1);
  av('S&P 500 Index Fund', 'investments', toCents(11800), 60);
  av('S&P 500 Index Fund', 'investments', toCents(12950), 1);
  av('401(k) — Bridgepoint', 'retirement', toCents(34700), 60);
  av('401(k) — Bridgepoint', 'retirement', toCents(37200), 1);
  await col('assets').insertMany(assetDocs);

  await col('feedback').insertMany([
    { user_id: userId, subject: 'Suggestion: export a PDF monthly report', message: 'Would be great to get a clean PDF summary of the month, ready to share with a partner.', status: 'open', created_at: isoDaysAgo(2) + 'T20:05:00.000Z' },
    { user_id: userId, subject: 'App is slower on my older phone', message: 'The dashboard takes a while to load on my 4-year-old Android. Charts seem heavy.', status: 'resolved', created_at: isoDaysAgo(12) + 'T11:40:00.000Z' },
  ]);

  return userId;
}

async function seed() {
  await ensureConnected();
  const count = await col('users').countDocuments({});
  if (count > 0) return { seeded: false, reason: 'already populated' };

  // Admin — the single admin account
  const adminHash = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
  await col('users').insertOne({
    name: 'WealthHabit Admin',
    email: SEED_ADMIN_EMAIL,
    password_hash: adminHash,
    role: 'admin',
    currency: 'USD',
    suspended: 0,
    created_at: new Date().toISOString(),
    last_login_at: null,
  });

  // Demo clients with realistic data
  await seedClient({ name: 'Alex Morgan', email: 'alex@example.com', password: 'DemoPass1', currency: 'USD' });
  await seedClientSam();
  return { seeded: true };
}

async function resetAndSeed() {
  await ensureConnected();
  await Promise.all([
    col('feedback').deleteMany({}),
    col('assets').deleteMany({}),
    col('goals').deleteMany({}),
    col('habit_completions').deleteMany({}),
    col('habits').deleteMany({}),
    col('expenses').deleteMany({}),
    col('income_sources').deleteMany({}),
    col('users').deleteMany({}),
  ]);
  const result = await seed();
  console.log('Database reseeded.');
  return result;
}

module.exports = {
  init,
  close,
  col,
  oid,
  ObjectId,
  DB_NAME,
  MONGODB_URI,
  seed,
  resetAndSeed,
  toCents,
  toDollars,
  todayISO,
  isoDaysAgo,
  isoMonthsAgo,
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD,
};
