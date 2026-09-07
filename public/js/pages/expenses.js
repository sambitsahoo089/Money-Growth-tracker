/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const ExpensesPage = {
  state: { month: null, months: [], tab: 'expenses', data: null, income: [] },

  async show(view) {
    if (!this.state.month) {
      const d = new Date();
      this.state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    view.innerHTML = '<div class="empty"><div class="big">🧾</div>Loading transactions…</div>';
    try {
      const [data, inc] = await Promise.all([api(`/api/expenses?month=${this.state.month}`), api('/api/income')]);
      this.state.data = data;
      this.state.months = data.months;
      this.state.income = inc.income;
    } catch (err) {
      view.innerHTML = `<div class="empty">Could not load transactions.<br><button class="btn small ghost" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    this.render(view);
  },

  render(view) {
    const { month, data, income, tab } = this.state;
    // Recurring salary — counts toward every month.
    const incMonthly = income.filter((i) => i.frequency === 'monthly').reduce((s, i) => s + i.amount, 0);
    // Total income this month = recurring salary + one-time income dated within the selected month.
    const incThisMonth = income
      .filter((i) => i.frequency === 'monthly' || (i.frequency === 'one-time' && i.date.slice(0, 7) === month))
      .reduce((s, i) => s + i.amount, 0);
    const netCashflow = incThisMonth - data.summary.total;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Expense Tracker</h1>
          <div class="sub">${tab === 'income' ? 'Track salary, freelance and other income sources.' : 'Log every dollar, understand where it goes.'}</div>
        </div>
        <span class="spacer"></span>
        ${tab === 'income'
          ? `<button class="btn" id="add-source-btn">+ Add income source</button>`
          : `<button class="btn ghost" id="exp-export">⬇ Export CSV</button>
             <button class="btn" id="exp-add">+ Add expense</button>`}
      </div>

      <div class="filter-row">
        <button class="btn ghost small" id="month-prev">‹ Prev</button>
        <b style="min-width:170px;text-align:center">${monthLabel(month)}</b>
        <button class="btn ghost small" id="month-next">Next ›</button>
        <span class="spacer"></span>
        <div class="seg" id="exp-tabs">
          <button data-tab="expenses" class="${tab === 'expenses' ? 'active' : ''}">Expenses</button>
          <button data-tab="income" class="${tab === 'income' ? 'active' : ''}">Income sources</button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat"><div class="label">Spent this month</div><div class="value">${money(data.summary.total)}</div></div>
        <div class="stat"><div class="label">Monthly income</div><div class="value">${money(incMonthly)}</div></div>
        <div class="stat"><div class="label">Total income this month</div><div class="value">${money(incThisMonth)}</div></div>
        <div class="stat"><div class="label">Net cash flow</div><div class="value" style="color:${netCashflow >= 0 ? 'var(--green)' : 'var(--red)'}">${money(netCashflow)}</div></div>
        <div class="stat"><div class="label">Top category</div><div class="value" style="font-size:16px">${data.summary.byCategory[0] ? esc(catMeta(data.summary.byCategory[0].category).label) : '—'}</div></div>
      </div>

      <div id="exp-body"></div>`;

    const addBtn = view.querySelector('#exp-add') || view.querySelector('#add-source-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (tab === 'income') this.openIncomeModal();
        else this.openExpenseModal();
      });
    }
    const exportBtn = view.querySelector('#exp-export');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportCsv());
    view.querySelector('#month-prev').addEventListener('click', () => {
      this.state.month = shiftMonth(month, -1);
      this.show(view);
    });
    view.querySelector('#month-next').addEventListener('click', () => {
      this.state.month = shiftMonth(month, 1);
      this.show(view);
    });
    view.querySelector('#exp-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.state.tab = btn.dataset.tab;
      this.render(view);
    });

    const body = view.querySelector('#exp-body');
    if (tab === 'expenses') this.renderExpenses(body);
    else this.renderIncome(body);
  },

  renderExpenses(body) {
    const { data } = this.state;
    const total = data.summary.total;

    body.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Spending by category</h3><span class="spacer"></span><span class="badge purple">${monthLabel(this.state.month)}</span></div>
          <div class="chart-box" id="exp-cat-chart"></div>
          <div class="legend" id="exp-cat-legend"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${data.expenses.length} transaction${data.expenses.length === 1 ? '' : 's'}</h3><span class="spacer"></span><span class="badge">Total ${money(total)}</span></div>
          ${data.expenses.length === 0
            ? '<div class="empty"><div class="big">🍃</div>No expenses this month. A clean slate!</div>'
            : `<div class="table-wrap"><table class="data" id="exp-table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th></th></tr></thead>
                <tbody>
                  ${data.expenses.map((e) => `
                    <tr>
                      <td data-label="Date">${fmtDate(e.date)}</td>
                      <td data-label="Description"><b>${esc(e.description || catMeta(e.category).label)}</b></td>
                      <td data-label="Category"><span class="badge" style="background:${catMeta(e.category).color}22;color:${catMeta(e.category).color}">${esc(catMeta(e.category).label)}</span></td>
                      <td data-label="Amount" class="amount">−${money(e.amount)}</td>
                      <td class="actions">
                        <button class="btn ghost small" data-edit="${e.id}">✎</button>
                        <button class="btn danger small" data-del="${e.id}">✕</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>
      </div>`;

    Charts.barChart(body.querySelector('#exp-cat-chart'), {
      labels: data.summary.byCategory.map((c) => catMeta(c.category).label),
      values: data.summary.byCategory.map((c) => c.total),
      colors: data.summary.byCategory.map((c) => catMeta(c.category).color),
      money: true,
    });
    const legend = body.querySelector('#exp-cat-legend');
    legend.innerHTML = data.summary.byCategory.map((c) => `
      <div class="li">
        <span class="dot" style="background:${catMeta(c.category).color}"></span>
        ${esc(catMeta(c.category).label)}
        <span class="pct">${money(c.total)} · ${total > 0 ? Math.round((c.total / total) * 100) : 0}%</span>
      </div>`).join('') || '<div class="li muted">No spending this month.</div>';

    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const e = this.state.data.expenses.find((x) => x.id === b.dataset.edit);
      this.openExpenseModal(e);
    }));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const e = this.state.data.expenses.find((x) => x.id === b.dataset.del);
      const ok = await confirmDialog(`Delete "${esc(e.description || catMeta(e.category).label)}" (${money(e.amount)})?`, { danger: true });
      if (!ok) return;
      try {
        const data = await api(`/api/expenses/${e.id}`, { method: 'DELETE' });
        toast(data.message, 'success');
        this.show(document.getElementById('view'));
      } catch (err) { toast(err.message, 'error'); }
    }));
  },

  renderIncome(body) {
    const { income } = this.state;
    const total = income.reduce((s, i) => s + i.amount, 0);
    const monthly = income.filter((i) => i.frequency === 'monthly').reduce((s, i) => s + i.amount, 0);

    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>Income sources</h3><span class="spacer"></span>
          <span class="badge green">${money(monthly)} / month</span>
        </div>
        ${income.length === 0
          ? '<div class="empty"><div class="big">💰</div>No income sources yet — use the “+ Add income source” button to add your salary or freelance gigs.</div>'
          : `<div class="table-wrap"><table class="data">
              <thead><tr><th>Name</th><th>Category</th><th>Frequency</th><th>Amount</th><th>Start date</th><th></th></tr></thead>
              <tbody>
                ${income.map((i) => `
                  <tr>
                    <td data-label="Name"><b>${esc(i.name)}</b></td>
                    <td data-label="Category"><span class="badge" style="background:${INCOME_META[i.category]?.color || '#8b93a7'}22;color:${INCOME_META[i.category]?.color || '#8b93a7'}">${esc(INCOME_META[i.category]?.label || i.category)}</span></td>
                    <td data-label="Frequency"><span class="badge ${i.frequency === 'monthly' ? 'green' : 'blue'}">${i.frequency === 'monthly' ? 'Monthly' : 'One-time'}</span></td>
                    <td data-label="Amount" class="amount">${money(i.amount)}</td>
                    <td data-label="Start date" class="muted">${fmtDate(i.date)}</td>
                    <td class="actions">
                      <button class="btn ghost small" data-edit="${i.id}">✎</button>
                      <button class="btn danger small" data-del="${i.id}">✕</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table></div>`}
        <div class="kbd-hint" style="margin-top:10px">Recurring income counts toward every month; one-time income counts in the month it is dated.</div>
      </div>`;

    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const i = income.find((x) => x.id === b.dataset.edit);
      this.openIncomeModal(i);
    }));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const i = income.find((x) => x.id === b.dataset.del);
      const ok = await confirmDialog(`Delete income source "${esc(i.name)}"?`, { danger: true });
      if (!ok) return;
      try {
        const data = await api(`/api/income/${i.id}`, { method: 'DELETE' });
        toast(data.message, 'success');
        this.show(document.getElementById('view'));
      } catch (err) { toast(err.message, 'error'); }
    }));
  },

  openExpenseModal(existing = null) {
    const today = todayStr();
    const { close, el } = openModal(`
      <h2>${existing ? 'Edit expense' : 'Log an expense'} <button class="close-x" data-close>✕</button></h2>
      <form id="exp-form">
        <div class="field">
          <label>Amount</label>
          <input class="input" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" value="${existing ? existing.amount : ''}" required>
          <div class="field-error"></div>
        </div>
        <div class="field">
          <label>Category</label>
          <select class="select" name="category">
            ${Object.entries(CATEGORY_META).map(([k, v]) => `<option value="${k}" ${existing && existing.category === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Description</label>
          <input class="input" name="description" maxlength="300" placeholder="e.g. Weekly groceries — Whole Foods" value="${existing ? esc(existing.description) : ''}">
        </div>
        <div class="field">
          <label>Date</label>
          <input class="input" name="date" type="date" max="${today}" value="${existing ? existing.date : today}" required>
          <div class="field-error"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn" type="submit">${existing ? 'Save changes' : 'Log expense'}</button>
        </div>
      </form>`);
    const form = el.querySelector('#exp-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = form.amount.value;
      const category = form.category.value;
      const description = form.description.value.trim();
      const date = form.date.value;
      if (!(Number(amount) > 0)) { form.amount.closest('.field').classList.add('has-error'); return; }
      const errEl = form.amount.closest('.field').querySelector('.field-error');
      try {
        const body = { amount, category, description, date };
        const data = existing
          ? await api(`/api/expenses/${existing.id}`, { method: 'PUT', body })
          : await api('/api/expenses', { method: 'POST', body });
        toast(data.message, 'success');
        close();
        this.show(document.getElementById('view'));
      } catch (err) { errEl.textContent = err.message; form.amount.closest('.field').classList.add('has-error'); }
    });
  },

  openIncomeModal(existing = null) {
    const { close, el } = openModal(`
      <h2>${existing ? 'Edit income source' : 'Add income source'} <button class="close-x" data-close>✕</button></h2>
      <form id="inc-form">
        <div class="field">
          <label>Name</label>
          <input class="input" name="name" maxlength="80" placeholder="e.g. Salary — Northwind Tech" value="${existing ? esc(existing.name) : ''}" required>
          <div class="field-error"></div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Amount / month</label>
            <input class="input" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" value="${existing ? existing.amount : ''}" required>
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label>Category</label>
            <select class="select" name="category">
              ${Object.entries(INCOME_META).map(([k, v]) => `<option value="${k}" ${existing && existing.category === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Frequency</label>
            <select class="select" name="frequency">
              <option value="monthly" ${!existing || existing.frequency === 'monthly' ? 'selected' : ''}>Monthly recurring</option>
              <option value="one-time" ${existing && existing.frequency === 'one-time' ? 'selected' : ''}>One-time</option>
            </select>
          </div>
          <div class="field">
            <label>Start date</label>
            <input class="input" name="date" type="date" value="${existing ? existing.date : todayStr()}" required>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn" type="submit">${existing ? 'Save changes' : 'Add source'}</button>
        </div>
      </form>`);
    const form = el.querySelector('#inc-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: form.name.value.trim(),
        amount: form.amount.value,
        category: form.category.value,
        frequency: form.frequency.value,
        date: form.date.value,
      };
      const errEl = form.name.closest('.field').querySelector('.field-error');
      try {
        const data = existing
          ? await api(`/api/income/${existing.id}`, { method: 'PUT', body })
          : await api('/api/income', { method: 'POST', body });
        toast(data.message, 'success');
        close();
        this.show(document.getElementById('view'));
      } catch (err) { errEl.textContent = err.message; form.name.closest('.field').classList.add('has-error'); }
    });
  },

  /** Quote a CSV cell only when required (Excel-friendly minimal quoting). */
  csvCell(value) {
    const s = String(value ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  },

  exportCsv() {
    const { data, month } = this.state;
    const rows = [['Date', 'Description', 'Category', 'Amount']];
    data.expenses.forEach((e) => {
      rows.push([e.date, e.description || catMeta(e.category).label, catMeta(e.category).label, e.amount.toFixed(2)]);
    });
    rows.push(['Month total', '', '', data.summary.total.toFixed(2)]);
    // \uFEFF (BOM) makes Excel detect UTF-8, so dates & text open correctly.
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => this.csvCell(c)).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `freebuff-expenses-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Exported ${data.expenses.length} transactions to freebuff-expenses-${month}.csv`, 'success');
  },
};