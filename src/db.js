/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'freebuff.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'client',   -- client | admin
  currency      TEXT    NOT NULL DEFAULT 'USD',
  suspended     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS income_sources (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  amount_cents INTEGER NOT NULL,
  category     TEXT    NOT NULL,
  frequency    TEXT    NOT NULL DEFAULT 'monthly',   -- monthly | one-time
  date         TEXT    NOT NULL,                     -- start date (one-time: occurrence)
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  category     TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  date         TEXT    NOT NULL,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  frequency   TEXT    NOT NULL DEFAULT 'daily',      -- daily | weekly | monthly
  reminder    INTEGER NOT NULL DEFAULT 1,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_completions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date     TEXT    NOT NULL,
  UNIQUE (habit_id, date)
);

CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  target_cents  INTEGER NOT NULL,
  current_cents INTEGER NOT NULL DEFAULT 0,
  deadline      TEXT,
  color         TEXT    NOT NULL DEFAULT '#6366f1',
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL,
  value_cents INTEGER NOT NULL,
  date        TEXT    NOT NULL,   -- as-of date of this valuation
  note        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'open',        -- open | resolved
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date   ON expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_income_user          ON income_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user          ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_user     ON habit_completions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_goals_user           ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_date     ON assets(user_id, date);
CREATE INDEX IF NOT EXISTS idx_feedback_status      ON feedback(status);
`);

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
  // [date, amount, category, description]
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

// Healthier entries replacing the placeholder above.
function seedExpenses(userId, now) {
  const insert = db.prepare(`
    INSERT INTO expenses (user_id, amount_cents, category, description, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const rows = EXPENSE_SEED.map(([ago, amount, category, desc]) => {
    const date = new Date(now);
    date.setDate(date.getDate() - ago);
    return [amount, category, desc, date.toISOString().slice(0, 10)];
  });
  // A couple of explicitly-realistic dining rows (kept in 'food' category, as dining is a sub-style)
  const extraDining = (ago, amount, desc) => {
    const d = new Date(now);
    d.setDate(d.getDate() - ago);
    rows.push([amount, 'food', desc, d.toISOString().slice(0, 10)]);
  };
  extraDining(3, 18.75, 'Dinner out — Sushi spot');
  extraDining(25, 26.0, 'Brunch with friends');
  extraDining(44, 13.6, 'Coffee + pastry, caf\u00e9');
  const seen = new Set();
  for (const [amount, category, desc, date] of rows) {
    const key = `${date}|${amount}|${category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    insert.run(userId, toCents(amount), category, desc, date, now);
  }
}

function seedClient(db, { name, email, password, currency = 'USD' }) {
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);
  const userRes = db.prepare('INSERT INTO users (name, email, password_hash, role, currency, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)')
    .run(name, email, hash, 'client', currency, now, now);
  const userId = Number(userRes.lastInsertRowid);

  // Income
  const inc = db.prepare('INSERT INTO income_sources (user_id, name, amount_cents, category, frequency, date, created_at) VALUES (?,?,?,?,?,?,?)');
  inc.run(userId, 'Salary — Northwind Tech', toCents(6400), 'salary', 'monthly', isoDaysAgo(200), now);
  inc.run(userId, 'Freelance design work', toCents(850), 'freelance', 'monthly', isoDaysAgo(180), now);
  inc.run(userId, 'Side project payout', toCents(1200), 'business', 'one-time', isoMonthsAgo(2), now);

  seedExpenses(userId, now);

  // Habits
  const hab = db.prepare('INSERT INTO habits (user_id, name, frequency, reminder, archived, created_at) VALUES (?,?,?,?,?,?)');
  const habits = [
    ['Log daily expenses', 'daily', 1],
    ['Transfer to savings on payday', 'weekly', 1],
    ['Review budget every Sunday', 'weekly', 1],
    ['Invest in index fund monthly', 'monthly', 1],
  ];
  const habitIds = [];
  for (const [n, f, r] of habits) {
    const res = hab.run(userId, n, f, r, 0, now);
    habitIds.push(Number(res.lastInsertRowid));
  }

  // Completions: daily habit — every day for the last 14 days except 2 (realistic gap)
  const comp = db.prepare('INSERT OR IGNORE INTO habit_completions (habit_id, user_id, date) VALUES (?,?,?)');
  for (let i = 0; i < 14; i++) {
    if (i === 5 || i === 9) continue; // two missed days → current streak shows a fresh run
    comp.run(habitIds[0], userId, isoDaysAgo(i));
  }
  // Weekly habit: every Monday for the last 8 weeks except 2
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let w = 0; w < 8; w++) {
    if (w === 3) continue;
    const d = new Date(monday); d.setDate(d.getDate() - w * 7);
    comp.run(habitIds[1], userId, d.toISOString().slice(0, 10));
  }
  for (let w = 0; w < 8; w++) {
    if (w === 6) continue;
    const d = new Date(monday); d.setDate(d.getDate() - w * 7);
    comp.run(habitIds[2], userId, d.toISOString().slice(0, 10));
  }
  // Monthly habit: first week of each of the last 3 months
  for (let m = 0; m < 3; m++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - m); d.setDate(Math.min(7, d.getDate() + 5));
    comp.run(habitIds[3], userId, d.toISOString().slice(0, 10));
  }

  // Goals
  const goal = db.prepare('INSERT INTO goals (user_id, name, target_cents, current_cents, deadline, color, created_at) VALUES (?,?,?,?,?,?,?)');
  const dl = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };
  goal.run(userId, 'Emergency Fund', toCents(15000), toCents(9850), dl(10), '#10b981', now);
  goal.run(userId, 'Japan Trip', toCents(4200), toCents(1600), dl(8), '#ec4899', now);
  goal.run(userId, 'New Laptop', toCents(2400), toCents(1890), dl(2), '#6366f1', now);

  // Assets — multiple valuations per account so the net-worth trend line rises
  const asset = db.prepare('INSERT INTO assets (user_id, name, type, value_cents, date, note, created_at) VALUES (?,?,?,?,?,?,?)');
  const av = (name, type, cents, daysAgo, note = '') => asset.run(userId, name, type, cents, isoDaysAgo(daysAgo), note, now);
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

  // Feedback
  const fb = db.prepare('INSERT INTO feedback (user_id, subject, message, status, created_at) VALUES (?,?,?,?,?)');
  fb.run(userId, 'Love the habit streaks', 'The daily streak for logging expenses keeps me honest. Would love a widget for the phone home screen.', 'open', isoDaysAgo(4) + 'T09:14:00.000Z');
  fb.run(userId, 'Currency display bug on reports', 'Monthly report showed the total in USD even though my profile currency is EUR.', 'resolved', isoDaysAgo(21) + 'T18:32:00.000Z');

  return userId;
}

function seedClientSam(db) {
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync('DemoPass1', 10);
  // Joined 2 months ago (so the registration chart shows growth) but active recently
  const joined = isoMonthsAgo(2) + 'T10:00:00.000Z';
  const userRes = db.prepare('INSERT INTO users (name, email, password_hash, role, currency, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)')
    .run('Sam Rivera', 'sam@example.com', hash, 'client', 'USD', joined, now);
  const userId = Number(userRes.lastInsertRowid);

  const inc = db.prepare('INSERT INTO income_sources (user_id, name, amount_cents, category, frequency, date, created_at) VALUES (?,?,?,?,?,?,?)');
  inc.run(userId, 'Salary — Bridgepoint Studio', toCents(4200), 'salary', 'monthly', isoDaysAgo(200), now);
  seedExpenses(userId, now);

  const hab = db.prepare('INSERT INTO habits (user_id, name, frequency, reminder, archived, created_at) VALUES (?,?,?,?,?,?)');
  const habitIds = [];
  for (const [n, f, r] of [['Log daily expenses', 'daily', 1], ['Transfer to savings on payday', 'weekly', 1], ['Review budget every Sunday', 'weekly', 1], ['Invest in index fund monthly', 'monthly', 1]]) {
    const res = hab.run(userId, n, f, r, 0, now);
    habitIds.push(Number(res.lastInsertRowid));
  }
  const comp = db.prepare('INSERT OR IGNORE INTO habit_completions (habit_id, user_id, date) VALUES (?,?,?)');
  for (let i = 0; i < 12; i++) { if (i === 4 || i === 8) continue; comp.run(habitIds[0], userId, isoDaysAgo(i)); }

  const goal = db.prepare('INSERT INTO goals (user_id, name, target_cents, current_cents, deadline, color, created_at) VALUES (?,?,?,?,?,?,?)');
  const dl = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };
  goal.run(userId, 'Down payment on a car', toCents(9000), toCents(4600), dl(6), '#f59e0b', now);
  goal.run(userId, 'Emergency Fund', toCents(12000), toCents(8100), dl(5), '#10b981', now);
  goal.run(userId, 'Weekend hiking gear', toCents(900), toCents(720), dl(1), '#06b6d4', now);

  const asset = db.prepare('INSERT INTO assets (user_id, name, type, value_cents, date, note, created_at) VALUES (?,?,?,?,?,?,?)');
  const av = (name, type, cents, daysAgo, note = '') => asset.run(userId, name, type, cents, isoDaysAgo(daysAgo), note, now);
  av('Checking — BofA', 'checking', toCents(2450), 60);
  av('Checking — BofA', 'checking', toCents(2890), 1);
  av('High-Yield Savings', 'savings', toCents(6200), 60);
  av('High-Yield Savings', 'savings', toCents(8100), 1);
  av('S&P 500 Index Fund', 'investments', toCents(11800), 60);
  av('S&P 500 Index Fund', 'investments', toCents(12950), 1);
  av('401(k) — Bridgepoint', 'retirement', toCents(34700), 60);
  av('401(k) — Bridgepoint', 'retirement', toCents(37200), 1);

  const fb = db.prepare('INSERT INTO feedback (user_id, subject, message, status, created_at) VALUES (?,?,?,?,?)');
  fb.run(userId, 'Suggestion: export a PDF monthly report', 'Would be great to get a clean PDF summary of the month, ready to share with a partner.', 'open', isoDaysAgo(2) + 'T20:05:00.000Z');
  fb.run(userId, 'App is slower on my older phone', 'The dashboard takes a while to load on my 4-year-old Android. Charts seem heavy.', 'resolved', isoDaysAgo(12) + 'T11:40:00.000Z');

  return userId;
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return { seeded: false, reason: 'already populated' };

  db.exec('BEGIN');
  try {
    // Admin — the single admin account
    const adminHash = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (name, email, password_hash, role, currency, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)')
      .run('WealthHabit Admin', SEED_ADMIN_EMAIL, adminHash, 'admin', 'USD', new Date().toISOString(), null);

    // Demo clients with realistic data
    seedClient(db, { name: 'Alex Morgan', email: 'alex@example.com', password: 'DemoPass1', currency: 'USD' });
    seedClientSam(db);
    db.exec('COMMIT');
    return { seeded: true };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function resetAndSeed() {
  db.exec(`
    DELETE FROM feedback;
    DELETE FROM assets;
    DELETE FROM goals;
    DELETE FROM habit_completions;
    DELETE FROM habits;
    DELETE FROM expenses;
    DELETE FROM income_sources;
    DELETE FROM users;
  `);
  seed();
  console.log('Database reseeded.');
}

module.exports = {
  db,
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