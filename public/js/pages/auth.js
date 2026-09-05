/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const AuthPage = {
  role: 'client', // 'client' | 'admin'
  mode: 'login',  // 'login' | 'register' (client only)

  show() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="auth-root">
        <div class="auth-card">
          <div class="brand-big">
            <img class="logo" src="/logo.png" alt="WealthHabit logo">
            <div>
              <h1>WealthHabit</h1>
              <div class="tagline">Build the habits. Watch the wealth grow.</div>
            </div>
          </div>

          <div class="role-tabs" id="role-tabs">
            <button data-role="client" class="${this.role === 'client' ? 'active' : ''}">
              <span class="ico">👤</span>
              Client
              <small>Personal finance</small>
            </button>
            <button data-role="admin" class="${this.role === 'admin' ? 'active' : ''}">
              <span class="ico">🛡️</span>
              Admin
              <small>Platform control</small>
            </button>
          </div>

          ${this.role === 'admin'
            ? `<div class="admin-note">🔐 Single admin account — sign in only. Admins are provisioned by the platform, not self-registered.</div>`
            : `<div class="auth-tabs">
                <button id="tab-login" class="${this.mode === 'login' ? 'active' : ''}">Sign in</button>
                <button id="tab-register" class="${this.mode === 'register' ? 'active' : ''}">Create account</button>
              </div>`}
          <div id="auth-body"></div>

          <div class="demo-box">
            <b>Demo credentials</b>
            <div class="row"><span>Admin (single account)</span><code>sambitkusahoo089@gmail.com / sam@1234</code></div>
            <div class="row"><span>Demo client</span><code>alex@example.com / DemoPass1</code></div>
          </div>
        </div>
      </div>`;

    app.querySelector('#role-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-role]');
      if (!btn || btn.dataset.role === this.role) return;
      this.role = btn.dataset.role;
      this.mode = 'login';
      this.show();
    });
    if (this.role === 'client') {
      app.querySelector('#tab-login').addEventListener('click', () => { this.mode = 'login'; this.show(); });
      app.querySelector('#tab-register').addEventListener('click', () => { this.mode = 'register'; this.show(); });
    }
    this.renderBody(app);
  },

  renderBody(app) {
    const body = app.querySelector('#auth-body');
    const isClient = this.role === 'client';

    body.innerHTML = !isClient
      ? `
        <form id="auth-form" novalidate>
          <div class="field">
            <label for="email">Admin email</label>
            <input class="input" type="email" id="email" name="email" placeholder="admin@yourorg.com" autocomplete="email" required>
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" type="password" id="password" name="password" placeholder="Admin password" autocomplete="current-password" required>
            <div class="field-error"></div>
          </div>
          <button class="btn block" type="submit" id="submit-btn">Sign in to Admin Panel</button>
        </form>`
      : (this.mode === 'login'
        ? `
        <form id="auth-form" novalidate>
          <div class="field">
            <label for="email">Email address</label>
            <input class="input" type="email" id="email" name="email" placeholder="you@example.com" autocomplete="email" required>
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" type="password" id="password" name="password" placeholder="Your password" autocomplete="current-password" required>
            <div class="field-error"></div>
          </div>
          <button class="btn block" type="submit" id="submit-btn">Sign in</button>
        </form>`
        : `
        <form id="auth-form" novalidate>
          <div class="field">
            <label for="name">Full name</label>
            <input class="input" id="name" name="name" maxlength="60" placeholder="e.g. Maya Patel" autocomplete="name" required>
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label for="email">Email address</label>
            <input class="input" type="email" id="email" name="email" placeholder="you@example.com" autocomplete="email" required>
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" type="password" id="password" name="password" placeholder="8+ characters, letters and numbers" autocomplete="new-password" required>
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label for="currency">Base currency</label>
            <select class="select" id="currency" name="currency">
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="INR">INR — Indian Rupee</option>
            </select>
          </div>
          <button class="btn block" type="submit" id="submit-btn">Create my account</button>
        </form>`);

    const form = body.querySelector('#auth-form');
    const btn = body.querySelector('#submit-btn');
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const submitLabel = isClient && this.mode === 'login' ? 'Sign in'
      : isClient ? 'Create my account' : 'Sign in to Admin Panel';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;
      const fields = { email: form.email, password: form.password };
      if (isClient && this.mode === 'register') fields.name = form.name;

      const setErr = (name, msg) => {
        const el = fields[name];
        if (!el) return;
        el.classList.toggle('invalid', !!msg);
        el.closest('.field').querySelector('.field-error').textContent = msg || '';
      };
      Object.values(fields).forEach((el) => setErr(el.name, ''));

      if (!emailRe.test(email)) return setErr('email', 'Please enter a valid email address.');
      if (password.length < 8) return setErr('password', 'Password must be at least 8 characters.');
      if (isClient && this.mode === 'register') {
        const name = form.name.value.trim();
        if (name.length < 2) return setErr('name', 'Please enter your full name (2–60 characters).');
        if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setErr('password', 'Use at least one letter and one number.');
      }

      btn.disabled = true;
      btn.textContent = 'Please wait…';
      try {
        const isRegister = isClient && this.mode === 'register';
        const payload = isRegister
          ? { name: form.name.value.trim(), email, password, currency: form.currency.value }
          : { email, password };
        const data = await api(`/api/auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', body: payload });
        App.me = data.user;
        App.currency = data.user.currency;
        if (data.message) toast(data.message, 'success');
        window.location.hash = '#/';
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = submitLabel;
      }
    });
  },
};