/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const GoalsPage = {
  data: null,

  async show(view) {
    view.innerHTML = '<div class="empty"><div class="big">🎯</div>Loading your goals…</div>';
    try {
      this.data = await api('/api/goals');
    } catch (err) {
      view.innerHTML = `<div class="empty">Could not load goals.<br><button class="btn small ghost" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    this.render(view);
  },

  render(view) {
    const { goals, totals } = this.data;
    const remaining = totals.target - totals.current;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Savings Goals</h1>
          <div class="sub">Give every dollar a destination.</div>
        </div>
        <span class="spacer"></span>
        <button class="btn" id="goal-add">+ New goal</button>
      </div>

      <div class="card" style="background:linear-gradient(135deg,#312e81,#4f46e5);color:#fff;border:1px solid rgba(129,140,248,.55)">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:14px">Overall goal progress</b>
          <span style="margin-left:auto;font-size:13px;opacity:.85">${money(totals.current)} of ${money(totals.target)}</span>
          <span style="font-size:15px;font-weight:800">${totals.percent}%</span>
        </div>
        <div class="progress" style="margin-top:10px;background:rgba(2,6,18,.35)"><div style="width:${totals.percent}%;background:#6ee7b7"></div></div>
        <div style="font-size:12.5px;opacity:.8;margin-top:8px">${money(remaining)} more to fully fund all goals</div>
      </div>

      ${goals.length === 0
        ? '<div class="card"><div class="empty"><div class="big">🏝️</div>No goals yet. Emergency fund, vacation, new laptop — pick what matters and start saving.</div></div>'
        : `<div class="grid-2">${goals.map((g) => this.goalCard(g)).join('')}</div>`}`;

    view.querySelector('#goal-add').addEventListener('click', () => this.openModal());

    view.querySelectorAll('[data-contribute]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = Number(form.dataset.contribute);
        const input = form.querySelector('input');
        const amount = input.value;
        try {
          const data = await api(`/api/goals/${id}/contribute`, { method: 'POST', body: { amount } });
          toast(data.message, 'success');
          this.show(view);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const g = goals.find((x) => x.id === Number(b.dataset.edit));
      this.openModal(g);
    }));
    view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const g = goals.find((x) => x.id === Number(b.dataset.del));
      const ok = await confirmDialog(`Delete goal "${esc(g.name)}"?`, { danger: true });
      if (!ok) return;
      try {
        const data = await api(`/api/goals/${g.id}`, { method: 'DELETE' });
        toast(data.message, 'success');
        this.show(view);
      } catch (err) { toast(err.message, 'error'); }
    }));
  },

  goalCard(g) {
    const daysLeft = g.daysLeft;
    const eta = daysLeft === null ? 'No deadline' : daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
    const etaColor = daysLeft !== null && daysLeft <= 30 ? 'var(--red)' : 'var(--muted)';
    return `
      <div class="card goal-card" style="border-left-color:${g.color}">
        <div class="g-head">
          <h3>${esc(g.name)}</h3>
          <span class="badge" style="background:${g.color}22;color:${g.color}">${g.percent}%</span>
        </div>
        <div class="g-amounts">${money(g.current)} <span class="muted">of ${money(g.target)}</span></div>
        <div class="progress"><div style="width:${g.percent}%;background:${g.color}"></div></div>
        <div class="g-meta">
          <span style="color:${etaColor}">⏳ ${eta}</span>
          <span>${money(g.target - g.current)} to go</span>
        </div>
        <form class="contribute" data-contribute="${g.id}" style="display:flex;gap:8px;margin-top:12px">
          <input class="input" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="Add amount" required>
          <button class="btn small" type="submit">+ Add</button>
        </form>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn ghost small" data-edit="${g.id}">✎ Edit</button>
          <button class="btn danger small" data-del="${g.id}" style="margin-left:auto">Delete</button>
        </div>
      </div>`;
  },

  openModal(existing = null) {
    const colors = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];
    const { close, el } = openModal(`
      <h2>${existing ? 'Edit goal' : 'Create a savings goal'} <button class="close-x" data-close>✕</button></h2>
      <form id="goal-form">
        <div class="field">
          <label>Goal name</label>
          <input class="input" name="name" maxlength="80" placeholder="e.g. Emergency Fund" value="${existing ? esc(existing.name) : ''}" required>
          <div class="field-error"></div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Target amount</label>
            <input class="input" name="target" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" value="${existing ? existing.target : ''}" required>
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label>Saved so far</label>
            <input class="input" name="current" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${existing ? existing.current : '0'}">
          </div>
        </div>
        <div class="field">
          <label>Target date (optional)</label>
          <input class="input" name="deadline" type="date" min="${todayStr()}" value="${existing && existing.deadline ? existing.deadline : ''}">
          <div class="hint">WealthHabit will show how many days are left to reach your goal.</div>
        </div>
        <div class="field">
          <label>Color</label>
          <div class="swatches" id="goal-swatches">
            ${colors.map((c) => `<button type="button" class="swatch ${(!existing || existing.color === c) && c === '#6366f1' ? 'sel' : ''} ${existing && existing.color === c ? 'sel' : ''}" style="background:${c}" data-color="${c}"></button>`).join('')}
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn" type="submit">${existing ? 'Save changes' : 'Create goal'}</button>
        </div>
      </form>`);
    const form = el.querySelector('#goal-form');
    let color = existing ? existing.color : '#6366f1';
    el.querySelectorAll('.swatch').forEach((s) => s.addEventListener('click', () => {
      el.querySelectorAll('.swatch').forEach((x) => x.classList.remove('sel'));
      s.classList.add('sel');
      color = s.dataset.color;
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: form.name.value.trim(),
        target: form.target.value,
        current: form.current.value,
        deadline: form.deadline.value || null,
        color,
      };
      try {
        const data = existing
          ? await api(`/api/goals/${existing.id}`, { method: 'PUT', body })
          : await api('/api/goals', { method: 'POST', body });
        toast(data.message, 'success');
        close();
        this.show(document.getElementById('view'));
      } catch (err) {
        const targetField = form.target.closest('.field');
        targetField.querySelector('.field-error').textContent = err.message;
        targetField.classList.add('has-error');
      }
    });
  },
};