/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

/* ---------------- State ---------------- */
const App = {
  me: null,          // current user {id, name, email, role, currency}
  currency: 'USD',
};

/* ---------------- XSS-safe escaping ---------------- */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------------- Toasts ---------------- */
function toast(message, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
}

/* ---------------- Modals ---------------- */
function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">${html}</div>
    </div>`;
  const backdrop = root.querySelector('.modal-backdrop');
  const modal = root.querySelector('.modal');
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { close, el: modal };
}

function confirmDialog(message, { danger = false } = {}) {
  return new Promise((resolve) => {
    const { close } = openModal(`
      <h2>Are you sure?</h2>
      <p style="font-size:14px;color:var(--muted);margin-bottom:18px">${esc(message)}</p>
      <div class="form-actions">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'danger' : ''}" id="confirm-yes">${danger ? 'Delete' : 'Confirm'}</button>
      </div>`);
    document.getElementById('confirm-yes').addEventListener('click', () => { close(); resolve(true); });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(false)));
  });
}

/* ---------------- Formatting ---------------- */
function money(n, opts = {}) {
  const value = Number(n) || 0;
  const cur = opts.currency || App.currency || 'USD';
  if (opts.compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e6) return `${sign}${Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 1 }).format(abs / 1e6)}M`;
    if (abs >= 1e3) return `${sign}${Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 1 }).format(abs / 1e3)}k`;
    return Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(value);
  }
  return Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function pct(n, digits = 0) {
  return `${(Number(n) * 100).toFixed(digits)}%`;
}

function fmtDate(iso, { withYear = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function initials(name) {
  return String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

/* ---------------- Metadata ---------------- */
const CATEGORY_META = {
  food:          { label: 'Food & Dining',     color: '#f97316' },
  transport:     { label: 'Transport',         color: '#3b82f6' },
  housing:       { label: 'Housing',           color: '#8b5cf6' },
  utilities:     { label: 'Utilities',         color: '#06b6d4' },
  entertainment: { label: 'Entertainment',     color: '#ec4899' },
  health:        { label: 'Health & Fitness',  color: '#10b981' },
  subscriptions: { label: 'Subscriptions',     color: '#6366f1' },
  shopping:      { label: 'Shopping',          color: '#f59e0b' },
  travel:        { label: 'Travel',            color: '#14b8a6' },
  other:         { label: 'Other',             color: '#8b93a7' },
};

const INCOME_META = {
  salary:      { label: 'Salary',      color: '#10b981' },
  freelance:   { label: 'Freelance',   color: '#3b82f6' },
  investments: { label: 'Investments', color: '#8b5cf6' },
  gift:        { label: 'Gift',        color: '#ec4899' },
  business:    { label: 'Business',    color: '#f59e0b' },
  other:       { label: 'Other',       color: '#8b93a7' },
};

const ASSET_TYPE_META = {
  checking:    { label: 'Checking',       color: '#3b82f6' },
  savings:     { label: 'Savings',        color: '#10b981' },
  investments: { label: 'Investments',    color: '#8b5cf6' },
  retirement:  { label: 'Retirement',     color: '#6366f1' },
  crypto:      { label: 'Crypto',         color: '#f59e0b' },
  property:    { label: 'Property',       color: '#14b8a6' },
  other:       { label: 'Other',          color: '#8b93a7' },
};

const FREQ_META = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

function catMeta(cat) { return CATEGORY_META[cat] || { label: cat, color: '#8b93a7' }; }

function plural(n, unit) {
  if (unit === 'day') return n === 1 ? 'day' : 'days';
  if (unit === 'week') return n === 1 ? 'week' : 'weeks';
  return n === 1 ? 'month' : 'months';
}

/* ---------------- Misc ---------------- */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function formatMonthNav(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function shiftMonth(month, delta) {
  const d = formatMonthNav(month);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}