/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const HabitsPage = {
  data: null,

  async show(view) {
    view.innerHTML = '<div class="empty"><div class="big">🔥</div>Loading your habits…</div>';
    try {
      this.data = await api('/api/habits');
    } catch (err) {
      view.innerHTML = `<div class="empty">Could not load habits.<br><button class="btn small ghost" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    this.render(view);
  },

  render(view) {
    const habits = this.data.habits;
    const doneToday = habits.filter((h) => h.doneToday).length;
    const avgRate = habits.length ? Math.round(habits.reduce((s, h) => s + h.completionRate, 0) / habits.length) : 0;
    const dueCount = habits.length - doneToday;
    // Longest streak, compared across frequencies by calendar-day equivalent
    const best = habits.reduce((acc, h) => {
      const equiv = h.bestStreak * (h.unit === 'day' ? 1 : h.unit === 'week' ? 7 : 30);
      return equiv > acc.equiv ? { habit: h, equiv } : acc;
    }, { habit: null, equiv: -1 });
    const longStreak = best.habit;
    const longStreakText = longStreak
      ? `${longStreak.bestStreak} ${plural(longStreak.bestStreak, longStreak.unit)} · ${esc(longStreak.name)}`
      : '—';

    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Habit Tracker</h1>
          <div class="sub">Small daily actions compound into serious wealth.</div>
        </div>
        <span class="spacer"></span>
        <button class="btn" id="hab-add">+ New habit</button>
      </div>

      <div class="stat-grid">
        <div class="stat"><div class="label">Active habits</div><div class="value">${habits.length}</div></div>
        <div class="stat"><div class="label">Done today</div><div class="value" style="color:var(--green)">${doneToday}/${habits.length}</div>
          ${dueCount > 0 ? `<div class="delta down">${dueCount} still due</div>` : '<div class="delta up">All done! 🎉</div>'}
        </div>
        <div class="stat"><div class="label">Avg completion</div><div class="value">${avgRate}%</div>
          <div class="delta ${avgRate >= 70 ? 'up' : 'down'}">this month</div>
        </div>
        <div class="stat"><div class="label">Longest streak</div><div class="value" style="font-size:17px">${longStreak ? longStreak.bestStreak + ' ' + plural(longStreak.bestStreak, longStreak.unit) : '—'}</div>
          <div class="delta up">${longStreak ? esc(longStreak.name) : 'keep it going 🔥'}</div>
        </div>
      </div>

      <div class="card" style="background:linear-gradient(135deg,rgba(129,140,248,.14),rgba(168,85,247,.07));border-style:dashed;border-color:rgba(129,140,248,.5)">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px;color:#c7d2fe">⏰ In-app reminders are on</div>
        <div style="font-size:13px;color:var(--muted)">WealthHabit highlights habits that are due each day on your dashboard. Mark them done right from the dashboard or here.</div>
      </div>

      ${habits.length === 0
        ? '<div class="card"><div class="empty"><div class="big">🌱</div>No habits yet. Create your first one — start with something tiny you can repeat daily.</div></div>'
        : habits.map((h) => this.habitCard(h)).join('')}`;

    view.querySelector('#hab-add').addEventListener('click', () => this.openModal());
    view.querySelectorAll('[data-done]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const data = await api(`/api/habits/${btn.dataset.done}/toggle`, { method: 'POST', body: {} });
          toast(data.message, 'success');
          this.show(view);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    view.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
      const h = habits.find((x) => x.id === Number(btn.dataset.edit));
      this.openModal(h);
    }));
    view.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
      const h = habits.find((x) => x.id === Number(btn.dataset.del));
      const ok = await confirmDialog(`Delete habit "${esc(h.name)}"? Its ${h.bestStreak}-${plural(h.bestStreak, h.unit)} best streak will be lost.`, { danger: true });
      if (!ok) return;
      try {
        const data = await api(`/api/habits/${h.id}`, { method: 'DELETE' });
        toast(data.message, 'success');
        this.show(view);
      } catch (err) { toast(err.message, 'error'); }
    }));
  },

  habitCard(h) {
    const freqColor = h.frequency === 'daily' ? '#f59e0b' : h.frequency === 'weekly' ? '#3b82f6' : '#8b5cf6';
    const streakText = `${h.currentStreak} ${plural(h.currentStreak, h.unit)} streak · best ${h.bestStreak} ${plural(h.bestStreak, h.unit)}`;
    const cal = h.calendar.map((c) => {
      const isToday = c.date === todayStr();
      return `<span class="cell ${c.done ? 'done' : ''} ${isToday ? 'today' : ''}" title="${c.date}${c.done ? ' ✓' : ''}"></span>`;
    }).join('');
    return `
      <div class="card habit-card">
        <div class="h-top">
          <span class="dot" style="background:${freqColor}"></span>
          <span class="h-name">${esc(h.name)}</span>
          <span class="badge" style="background:${freqColor}22;color:${freqColor}">${FREQ_META[h.frequency]}</span>
          ${h.reminder ? '<span class="badge blue">⏰ reminder</span>' : ''}
          <button class="done-btn ${h.doneToday ? 'done' : ''}" data-done="${h.id}" title="${h.doneToday ? 'Undo' : 'Mark done'}">${h.doneToday ? '✓' : ''}</button>
        </div>
        <div class="h-streak">🔥 ${streakText} · ${h.completionRate}% this month</div>
        <div class="cal-strip">${cal}</div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost small" data-edit="${h.id}">✎ Edit</button>
          <button class="btn danger small" data-del="${h.id}" style="margin-left:auto">Delete</button>
        </div>
      </div>`;
  },

  openModal(existing = null) {
    const { close, el } = openModal(`
      <h2>${existing ? 'Edit habit' : 'Create a habit'} <button class="close-x" data-close>✕</button></h2>
      <form id="hab-form">
        <div class="field">
          <label>Habit name</label>
          <input class="input" name="name" maxlength="80" placeholder="e.g. Transfer \$50 to savings" value="${existing ? esc(existing.name) : ''}" required>
          <div class="field-error"></div>
        </div>
        <div class="field">
          <label>Frequency</label>
          <select class="select" name="frequency">
            <option value="daily" ${!existing || existing.frequency === 'daily' ? 'selected' : ''}>Daily — every single day</option>
            <option value="weekly" ${existing && existing.frequency === 'weekly' ? 'selected' : ''}>Weekly — once a week</option>
            <option value="monthly" ${existing && existing.frequency === 'monthly' ? 'selected' : ''}>Monthly — once a month</option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox-line"><input type="checkbox" name="reminder" ${!existing || existing.reminder ? 'checked' : ''}> Show a reminder on my dashboard when this habit is due</label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn" type="submit">${existing ? 'Save changes' : 'Create habit'}</button>
        </div>
      </form>`);
    const form = el.querySelector('#hab-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: form.name.value.trim(),
        frequency: form.frequency.value,
        reminder: form.reminder.checked,
      };
      try {
        const data = existing
          ? await api(`/api/habits/${existing.id}`, { method: 'PUT', body })
          : await api('/api/habits', { method: 'POST', body });
        toast(data.message, 'success');
        close();
        this.show(document.getElementById('view'));
      } catch (err) {
        const field = form.name.closest('.field');
        field.querySelector('.field-error').textContent = err.message;
        field.classList.add('has-error');
      }
    });
  },
};