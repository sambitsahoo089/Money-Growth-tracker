/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const AdminPage = {
  state: { tab: 'users', metrics: null, users: [], feedback: [] },

  async show(view) {
    view.innerHTML = '<div class="empty"><div class="big">🛠️</div>Loading admin panel…</div>';
    try {
      const [metrics, users, feedback] = await Promise.all([
        api('/api/admin/metrics'),
        api('/api/admin/users'),
        api('/api/admin/feedback'),
      ]);
      this.state.metrics = metrics;
      this.state.users = users.users;
      this.state.feedback = feedback.feedback;
    } catch (err) {
      view.innerHTML = `<div class="empty">Could not load admin data.<br><button class="btn small ghost" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    this.render(view);
  },

  render(view) {
    const m = this.state.metrics;
    const { tab } = this.state;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Admin Panel</h1>
          <div class="sub">Platform overview, user administration &amp; feedback.</div>
        </div>
        <span class="spacer"></span>
        <div class="seg" id="admin-tabs">
          <button data-tab="users" class="${tab === 'users' ? 'active' : ''}">Users</button>
          <button data-tab="feedback" class="${tab === 'feedback' ? 'active' : ''}">Feedback ${m.feedback.open > 0 ? `(${m.feedback.open})` : ''}</button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat"><div class="label">Registered users</div><div class="value">${m.users.total}</div><div class="delta up">${m.users.active30} active · last 30 days</div></div>
        <div class="stat"><div class="label">Expenses logged</div><div class="value">${m.activity.expenses}</div><div class="delta up">${money(m.activity.expenseValue, { compact: true })} total</div></div>
        <div class="stat"><div class="label">Habit completions</div><div class="value">${m.activity.completions}</div><div class="delta up">${m.activity.habits} habits tracked</div></div>
        <div class="stat"><div class="label">Goals saved toward</div><div class="value">${m.goals.total}</div><div class="delta up">${money(m.goals.value, { compact: true })} saved</div></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>New registrations</h3><span class="spacer"></span><span class="badge purple">6 months</span></div>
          <div class="chart-box" id="admin-reg-chart"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Platform spending by category</h3></div>
          <div class="chart-box" id="admin-spend-chart"></div>
        </div>
      </div>

      <div id="admin-body" style="margin-top:16px"></div>`;

    Charts.barChart(view.querySelector('#admin-reg-chart'), {
      labels: m.registrations.map((r) => r.label.slice(5).replace('-', '/')),
      values: m.registrations.map((r) => r.count),
      colors: m.registrations.map(() => '#4f46e5'),
    });
    Charts.barChart(view.querySelector('#admin-spend-chart'), {
      labels: m.spending.map((s) => catMeta(s.category).label),
      values: m.spending.map((s) => s.total),
      colors: m.spending.map((s) => catMeta(s.category).color),
      money: true,
    });

    view.querySelector('#admin-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.state.tab = btn.dataset.tab;
      this.render(view);
    });

    const body = view.querySelector('#admin-body');
    if (tab === 'users') this.renderUsers(body);
    else this.renderFeedback(body);
  },

  renderUsers(body) {
    const users = this.state.users;
    body.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>User accounts</h3><span class="spacer"></span><span class="badge">${users.length} total</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>User</th><th>Role</th><th>Joined</th><th>Last login</th><th>Activity</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td data-label="User">
                  <div style="display:flex;align-items:center;gap:9px">
                    <span class="avatar-inline">${esc(initials(u.name))}</span>
                    <span><b>${esc(u.name)}</b><div class="muted">${esc(u.email)}</div></span>
                  </div>
                </td>
                <td data-label="Role"><span class="badge ${u.role === 'admin' ? 'purple' : 'blue'}">${u.role === 'admin' ? 'Admin' : 'Client'}</span></td>
                <td data-label="Joined" class="muted">${fmtDateTime(u.createdAt)}</td>
                <td data-label="Last login" class="muted">${fmtDateTime(u.lastLoginAt)}</td>
                <td data-label="Activity" class="muted">${u.expenseCount} expenses · ${u.goalCount} goals</td>
                <td data-label="Status">${u.suspended ? '<span class="badge red">Suspended</span>' : '<span class="badge green">Active</span>'}</td>
                <td class="actions">
                  ${u.role === 'admin'
                    ? '<span class="muted">—</span>'
                    : `<button class="btn small ${u.suspended ? 'ghost' : 'danger'}" data-suspend="${u.id}" data-suspended="${u.suspended ? 1 : 0}">${u.suspended ? 'Re-activate' : 'Suspend'}</button>`}
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
    body.querySelectorAll('[data-suspend]').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.suspend);
      const suspended = b.dataset.suspended === '1';
      const ok = await confirmDialog(suspended ? 'Re-activate this account?' : 'Suspend this account? They will not be able to sign in.', { danger: !suspended });
      if (!ok) return;
      try {
        const data = await api(`/api/admin/users/${id}/suspend`, { method: 'PUT', body: { suspended: !suspended } });
        toast(data.message, 'success');
        this.show(document.getElementById('view'));
      } catch (err) { toast(err.message, 'error'); }
    }));
  },

  renderFeedback(body) {
    const feedback = this.state.feedback;
    body.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Feedback &amp; inquiries</h3><span class="spacer"></span>
          <span class="badge ${this.state.metrics.feedback.open > 0 ? 'amber' : 'green'}">${this.state.metrics.feedback.open} open · ${this.state.metrics.feedback.total} total</span>
        </div>
        ${feedback.length === 0
          ? '<div class="empty">No feedback yet.</div>'
          : feedback.map((f) => `
            <div class="fb-item">
              <div class="fb-head">
                <span class="badge ${f.status === 'open' ? 'amber' : 'green'}">${f.status === 'open' ? 'Open' : 'Resolved'}</span>
                <span class="fb-subject">${esc(f.subject)}</span>
                <button class="btn small ${f.status === 'open' ? 'ghost' : ''}" data-fb="${f.id}" data-status="${f.status}">${f.status === 'open' ? 'Mark resolved' : 'Re-open'}</button>
              </div>
              <div class="fb-msg">${esc(f.message)}</div>
              <div class="fb-meta">${esc(f.user_name)} · ${esc(f.user_email)} · ${fmtDateTime(f.created_at)}</div>
            </div>`).join('')}
      </div>`;
    body.querySelectorAll('[data-fb]').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.fb);
      const status = b.dataset.status === 'open' ? 'resolved' : 'open';
      try {
        const data = await api(`/api/admin/feedback/${id}`, { method: 'PUT', body: { status } });
        toast(data.message, 'success');
        this.show(document.getElementById('view'));
      } catch (err) { toast(err.message, 'error'); }
    }));
  },
};