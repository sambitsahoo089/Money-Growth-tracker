/*
 * Freebuff — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const NAV = [
  { route: 'dashboard', href: '#/', icon: '📊', label: 'Dashboard' },
  { route: 'expenses', href: '#/expenses', icon: '🧾', label: 'Expense Tracker' },
  { route: 'habits', href: '#/habits', icon: '🔥', label: 'Habit Tracker' },
  { route: 'goals', href: '#/goals', icon: '🎯', label: 'Savings Goals' },
  { route: 'wealth', href: '#/wealth', icon: '📈', label: 'Wealth Analytics' },
];

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  expenses: 'Expense Tracker',
  habits: 'Habit Tracker',
  goals: 'Savings Goals',
  wealth: 'Wealth Analytics',
  admin: 'Admin Panel',
};

// Keep page methods bound so `this` refers to the page object.
const PAGES = {
  dashboard: (view) => DashboardPage.show(view),
  expenses: (view) => ExpensesPage.show(view),
  habits: (view) => HabitsPage.show(view),
  goals: (view) => GoalsPage.show(view),
  wealth: (view) => WealthPage.show(view),
  admin: (view) => AdminPage.show(view),
};

let currentRoute = null;

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return h || 'dashboard';
}

function routeIsAdmin(route) {
  return route === 'admin';
}

function renderShell(activeRoute) {
  const me = App.me;
  const adminLink = me && me.role === 'admin'
    ? `<a href="#/admin" class="${activeRoute === 'admin' ? 'active' : ''}"><span class="ico">🛠️</span> Admin Panel</a>`
    : '';
  const navLinks = NAV.map((n) => `<a href="${n.href}" class="${n.route === activeRoute ? 'active' : ''}"><span class="ico">${n.icon}</span> ${n.label}</a>`).join('');

  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <div class="sidebar-backdrop" id="nav-backdrop"></div>
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <span class="logo">📈</span>
          <span>Freebuff<small>WEALTH &amp; HABITS</small></span>
        </div>
        <nav class="nav">
          <div class="nav-label">Finance</div>
          ${navLinks}
          <div class="nav-label">Manage</div>
          ${adminLink}
        </nav>
        <div class="sidebar-footer">
          <div class="user-chip">
            <span class="avatar">${esc(initials(me.name))}</span>
            <span style="min-width:0">
              <div class="u-name">${esc(me.name)}</div>
              <div class="u-email">${esc(me.email)}</div>
            </span>
          </div>
          <div class="sidebar-actions">
            <button class="btn ghost small" id="nav-profile">Profile</button>
            <button class="btn ghost small" id="nav-feedback">Feedback</button>
            <button class="btn ghost small" id="nav-logout" title="Sign out">Logout</button>
          </div>
        </div>
      </aside>
      <div class="topbar">
        <button class="menu-btn" id="menu-btn" aria-label="Open menu">☰</button>
        <span class="page-title">${PAGE_TITLES[activeRoute] || 'Freebuff'}</span>
        <span class="spacer"></span>
        <div class="user-menu">
          <span class="avatar">${esc(initials(me.name))}</span>
          <span>${esc(me.name.split(' ')[0])}</span>
        </div>
      </div>
      <main class="main" id="view"></main>
    </div>`;

  // Sidebar drawer (mobile)
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('nav-backdrop');
  const closeNav = () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); };
  document.getElementById('menu-btn').addEventListener('click', () => {
    sidebar.classList.toggle('open'); backdrop.classList.toggle('open');
  });
  backdrop.addEventListener('click', closeNav);
  sidebar.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', closeNav));

  document.getElementById('nav-logout').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    App.me = null;
    window.location.hash = '#/login';
  });
  document.getElementById('nav-profile').addEventListener('click', ProfileModal.open);
  document.getElementById('nav-feedback').addEventListener('click', FeedbackModal.open);
}

/* ---------- profile + feedback modals (client-side) ---------- */
const ProfileModal = {
  async open() {
    const { close, el } = openModal(`
      <h2>Profile settings <button class="close-x" data-close>✕</button></h2>
      <form id="profile-form">
        <div class="field">
          <label>Full name</label>
          <input class="input" name="name" maxlength="60" value="${esc(App.me.name)}" required>
          <div class="field-error"></div>
        </div>
        <div class="field">
          <label>Base currency</label>
          <select class="select" name="currency">
            ${['USD', 'EUR', 'GBP', 'INR'].map((c) => `<option ${c === App.currency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn" type="submit">Save changes</button>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <div class="field">
          <label>Current password</label>
          <input class="input" type="password" name="currentPassword" autocomplete="current-password">
          <div class="field-error"></div>
        </div>
        <div class="field">
          <label>New password</label>
          <input class="input" type="password" name="newPassword" autocomplete="new-password">
          <div class="hint">8–64 characters, at least one letter and one number.</div>
          <div class="field-error"></div>
        </div>
        <div class="form-actions">
          <button class="btn ghost" type="submit" id="pwd-btn">Change password</button>
        </div>
      </form>`);
    const form = el.querySelector('#profile-form');
    const setErr = (name, msg) => {
      const field = form.querySelector(`[name="${name}"]`).closest('.field');
      field.classList.toggle('has-error', !!msg);
      field.querySelector('.field-error').textContent = msg || '';
    };
    form.addEventListener('submit', async (e) => {
      const isPwd = e.submitter && e.submitter.id === 'pwd-btn';
      e.preventDefault();
      if (isPwd) {
        const currentPassword = form.querySelector('[name="currentPassword"]').value;
        const newPassword = form.querySelector('[name="newPassword"]').value;
        try {
          await api('/api/user/password', { method: 'PUT', body: { currentPassword, newPassword } });
          toast('Password changed.', 'success');
          close();
        } catch (err) { toast(err.message, 'error'); }
        return;
      }
      const name = form.querySelector('[name="name"]').value.trim();
      const currency = form.querySelector('[name="currency"]').value;
      if (name.length < 2) { setErr('name', 'Name must be at least 2 characters.'); return; }
      try {
        const data = await api('/api/user/profile', { method: 'PUT', body: { name, currency } });
        App.me.name = name; App.currency = currency;
        toast(data.message, 'success');
        close();
        render();
      } catch (err) { setErr('name', err.message); }
    });
  },
};

const FeedbackModal = {
  async open() {
    const { close, el } = openModal(`
      <h2>Send feedback <button class="close-x" data-close>✕</button></h2>
      <form id="feedback-form">
        <div class="field">
          <label>Subject</label>
          <input class="input" name="subject" maxlength="120" placeholder="e.g. Idea for a new chart" required>
          <div class="field-error"></div>
        </div>
        <div class="field">
          <label>Message</label>
          <textarea class="textarea" name="message" maxlength="1000" placeholder="Tell us what you love or what we could improve…" required></textarea>
          <div class="field-error"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn" type="submit">Submit</button>
        </div>
      </form>`);
    const form = el.querySelector('#feedback-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subject = form.querySelector('[name="subject"]').value.trim();
      const message = form.querySelector('[name="message"]').value.trim();
      if (subject.length < 2 || message.length < 2) { toast('Please fill in both fields.', 'error'); return; }
      try {
        const data = await api('/api/user/feedback', { method: 'POST', body: { subject, message } });
        toast(data.message, 'success');
        close();
      } catch (err) { toast(err.message, 'error'); }
    });
  },
};

/* ---------------- boot & route ---------------- */
async function render() {
  const route = parseHash();
  if (!App.me) {
    currentRoute = null;
    if (route !== 'auth') window.location.hash = '#/auth';
    AuthPage.show();
    return;
  }
  if (route === 'auth') { window.location.hash = '#/'; return; }

  if (routeIsAdmin(route) && App.me.role !== 'admin') {
    toast('Admin access required.', 'error');
    window.location.hash = '#/';
    return;
  }

  const pageFn = PAGES[route] || PAGES.dashboard;
  currentRoute = route;
  renderShell(route);
  pageFn(document.getElementById('view'));
}

async function boot() {
  window.addEventListener('hashchange', render);
  try {
    const data = await api('/api/auth/me');
    App.me = data.user;
    App.currency = data.user.currency;
  } catch {
    App.me = null;
  }
  render();
}

boot();