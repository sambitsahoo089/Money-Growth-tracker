'use strict';

const DashboardPage = {
  data: null,

  async show(view) {
    view.innerHTML = '<div class="empty"><div class="big">📊</div>Loading your financial picture…</div>';
    try {
      this.data = await api('/api/dashboard');
    } catch (err) {
      view.innerHTML = `<div class="empty">Could not load your dashboard.<br><button class="btn small ghost" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    const d = this.data;
    const firstName = App.me.name.split(' ')[0];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const savingsRatePct = Math.round(d.savingsRate * 100);
    const expenseDelta = d.expenses - d.prevExpenses;
    // Trim months before the user started tracking (zeros) so the trend starts where data begins
    const firstIdx = d.netWorthSeries.findIndex((p) => p.value > 0);
    const trend = firstIdx === -1 ? [] : d.netWorthSeries.slice(firstIdx);
    const delta = trend.length >= 2 ? trend[trend.length - 1].value - trend[0].value : 0;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Good ${this.greeting()}, ${esc(firstName)} 👋</h1>
          <div class="sub">${today} · Net worth is trending ${delta >= 0 ? 'up' : 'down'} ${money(Math.abs(delta), { compact: true })} since ${trend.length ? monthLabel(trend[0].label) : 'you started tracking'}.</div>
        </div>
        <span class="spacer"></span>
        <button class="btn" id="dash-quick-expense">+ Log expense</button>
      </div>

      <div class="stat-grid">
        <div class="stat">
          <div class="label">Net worth</div>
          <div class="value">${money(d.netWorth, { compact: true })}</div>
          <div class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${money(Math.abs(delta), { compact: true })} · 6 mo</div>
        </div>
        <div class="stat">
          <div class="label">Income · ${monthLabel(d.month).split(' ')[0]}</div>
          <div class="value">${money(d.income)}</div>
          <div class="delta up">▲ ${money(Math.max(0, d.income - d.prevIncome.total), { compact: true })} vs last month</div>
        </div>
        <div class="stat">
          <div class="label">Spending · ${monthLabel(d.month).split(' ')[0]}</div>
          <div class="value">${money(d.expenses)}</div>
          <div class="delta ${expenseDelta <= 0 ? 'up' : 'down'}">${expenseDelta <= 0 ? '▼' : '▲'} ${money(Math.abs(expenseDelta), { compact: true })} vs last month</div>
        </div>
        <div class="stat">
          <div class="label">Savings rate</div>
          <div class="value">${savingsRatePct}%</div>
          <div class="delta ${savingsRatePct >= 20 ? 'up' : 'down'}">${savingsRatePct >= 20 ? 'Great discipline!' : 'Aim for 20%+'}</div>
        </div>
      </div>

      <div class="grid-3">
        <div class="card">
          <div class="card-head"><h3>Net worth trend</h3><span class="spacer"></span><span class="badge purple">6 months</span></div>
          <div class="chart-box" id="dash-networth-chart"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Spending by category</h3><span class="spacer"></span><span class="badge">This month</span></div>
          <div class="chart-box" id="dash-category-chart"></div>
          <div class="legend" id="dash-category-legend"></div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="card">
          <div class="card-head">
            <h3>Savings goals</h3><span class="spacer"></span>
            <a class="btn small ghost" href="#/goals">View all</a>
          </div>
          ${d.goals.length === 0
            ? '<div class="empty">No goals yet — create one to start saving with purpose.</div>'
            : d.goals.map((g) => `
              <div style="padding:10px 0;border-bottom:1px solid var(--bg)">
                <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px">
                  <b>${esc(g.name)}</b>
                  <span class="muted">${money(g.current)} / ${money(g.target, { compact: true })}</span>
                </div>
                <div class="progress"><div style="width:${g.percent}%;background:${g.color}"></div></div>
              </div>`).join('')}
        </div>
        <div class="card">
          <div class="card-head">
            <h3>Habits due today</h3><span class="spacer"></span>
            <a class="btn small ghost" href="#/habits">Habit tracker</a>
          </div>
          ${d.habitsDue.length === 0
            ? '<div class="empty" style="padding:14px">🎉 All habits done today — you\'re on fire!</div>'
            : d.habitsDue.slice(0, 4).map((h) => `
              <div class="due-item">
                <span class="dot" style="background:${h.frequency === 'daily' ? '#f59e0b' : h.frequency === 'weekly' ? '#3b82f6' : '#8b5cf6'}"></span>
                <span style="flex:1;font-weight:600;font-size:13.5px">${esc(h.name)}</span>
                <span class="badge">${FREQ_META[h.frequency]}</span>
                <button class="done-btn" data-done-habit="${h.id}" title="Mark done">✓</button>
              </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head">
          <h3>Recent transactions</h3><span class="spacer"></span>
          <a class="btn small ghost" href="#/expenses">Expense tracker</a>
        </div>
        ${d.recent.length === 0
          ? '<div class="empty">No expenses logged yet.</div>'
          : d.recent.map((t) => `
            <div class="tx-row">
              <span class="avatar-inline">${esc(catMeta(t.category).label.split(' ')[0].slice(0, 2))}</span>
              <div class="tx-main">
                <div class="tx-desc">${esc(t.description || catMeta(t.category).label)}</div>
                <div class="tx-date">${fmtDate(t.date)} · <span class="badge" style="background:${catMeta(t.category).color}22;color:${catMeta(t.category).color}">${esc(catMeta(t.category).label)}</span></div>
              </div>
              <span class="amount">−${money(t.amount)}</span>
            </div>`).join('')}
      </div>`;

    // Charts
    if (trend.length === 0) {
      view.querySelector('#dash-networth-chart').innerHTML = '<div class="empty" style="padding:40px 10px">Record assets in Wealth Analytics to see your net worth trend.</div>';
    } else {
      const labels = trend.map((p) => p.label.slice(5).replace('-', '/'));
      Charts.lineChart(view.querySelector('#dash-networth-chart'), {
        labels,
        values: trend.map((p) => p.value),
        color: '#4f46e5', money: true,
      });
    }

    const catTotal = d.categoryBreakdown.reduce((s, c) => s + c.total, 0);
    Charts.donutChart(view.querySelector('#dash-category-chart'), {
      items: d.categoryBreakdown.map((c) => ({ label: catMeta(c.category).label, value: c.total, color: catMeta(c.category).color })),
      centerValue: money(catTotal, { compact: true }),
      centerLabel: 'Spent',
    });
    const legend = view.querySelector('#dash-category-legend');
    legend.innerHTML = d.categoryBreakdown.slice(0, 5).map((c) => `
      <div class="li">
        <span class="dot" style="background:${catMeta(c.category).color}"></span>
        ${esc(catMeta(c.category).label)}
        <span class="pct">${money(c.total)}</span>
      </div>`).join('') || '<div class="li muted">No spending recorded this month.</div>';

    // Actions
    view.querySelector('#dash-quick-expense').addEventListener('click', () => {
      window.location.hash = '#/expenses';
      setTimeout(() => ExpensesPage.openExpenseModal(), 120);
    });
    view.querySelectorAll('[data-done-habit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const data = await api(`/api/habits/${btn.dataset.doneHabit}/toggle`, { method: 'POST', body: {} });
          toast(data.message, 'success');
          this.show(view);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  },

  greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  },
};