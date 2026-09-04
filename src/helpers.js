'use strict';

const EXPENSE_CATEGORIES = ['food', 'transport', 'housing', 'utilities', 'entertainment', 'health', 'subscriptions', 'shopping', 'travel', 'other'];
const INCOME_CATEGORIES = ['salary', 'freelance', 'investments', 'gift', 'business', 'other'];
const ASSET_TYPES = ['checking', 'savings', 'investments', 'retirement', 'crypto', 'property', 'other'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(res, message, status = 400) {
  return res.status(status).json({ error: message });
}

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function cleanStr(v, maxLen) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length === 0 || s.length > maxLen) return null;
  return s;
}

/** Parse an amount in dollars into integer cents, or null if invalid. */
function parseAmountCents(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const cents = Math.round(v * 100);
    if (cents <= 0 || cents > 99999999900) return null;
    return cents;
  }
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,$\s]/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > 999999999) return null;
    const cents = Math.round(n * 100);
    return cents > 0 ? cents : null;
  }
  return null;
}

function parseMoneyOut(v) {
  return Math.round(Number(v)) / 100;
}

module.exports = {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  ASSET_TYPES,
  FREQUENCIES,
  CURRENCIES,
  EMAIL_RE,
  isValidDate,
  cleanStr,
  parseAmountCents,
  parseMoneyOut,
  bad,
};