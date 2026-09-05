/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const WealthPage = {
  data: null,

  async show(view) {
    view.innerHTML = '<div class="empty"><div class="big">📈</div>Loading your wealth…</div>';
    try {
      this.data = await api('/api/wealth');
    } catch (err) {
      view.innerHTML = `<div class="empty">Could not load wealth data.<br><button class="btn small ghost" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    this.render(view);
  },

  render(view) {
    const { netWorth, assets, allocation, netWorthSeries } = this.data;
    const series = netWorthSeries.filter((p) => p.value > 0);
    const start = series.length ? series[0].value : 0;
    const growth = start > 0 ? Math.round(((netWorth - start) / start) * 100) : 0;
    const largestAsset = [...assets].sort((a, b) => b.value - a.value)[0] || null;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Wealth Analytics</h1>
          <div class="sub">Track assets, watch net worth compound.</div>
        </div>
        <span class="spacer"></span>
        <button class="btn" id="asset-add">+ Record asset value</button>
      </div>

      <div class="stat-grid">
        <div class="stat"><div class="label">Net worth</div><div class="value">${money(netWorth, { compact: true })}</div>
          <div class="delta ${growth >= 0 ? 'up' : 'down'}">${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth)}% since tracking began</div>
        </div>
        <div class="stat"><div class="label">Asset accounts</div><div class="value">${assets.length}</div></div>
        <div class="stat"><div class="label">Largest asset</div><div class="value" style="font-size:15px">${largestAsset ? esc(largestAsset.name) : '—'}</div>
          <div class="delta up">${largestAsset ? money(largestAsset.value, { compact: true }) : ''}</div>
        </div>
        <div class="stat"><div class="label">Largest category</div><div class="value" style="font-size:15px">${allocation[0] ? esc(ASSET_TYPE_META[allocation[0].type]?.label || allocation[0].type) : '—'}</div>
          <div class="delta up">${allocation[0] ? pct(allocation[0].value / (netWorth || 1), 0) : ''}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Net worth over time</h3><span class="spacer"></span><span class="badge purple">12 months</span></div>
          <div class="chart-box" id="wealth-line"></div>
          <div class="kbd-hint" style="margin-top:8px">Net worth = latest recorded value of every account, summed month by month.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Asset allocation</h3></div>
          <div class="chart-box" id="wealth-donut"></div>
          <div class="legend" id="wealth-legend"></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head">
          <h3>Accounts &amp; assets</h3><span class="spacer"></span>
          <button class="btn small" id="asset-add-2">+ Record value</button>
        </div>
        ${assets.length === 0
          ? '<div class="empty"><div class="big">🏦</div>No assets recorded yet. Add your checking account, savings, investments and retirement accounts.</div>'
          : `<div class="table-wrap"><table class="data">
              <thead><tr><th>Account</th><th>Type</th><th>As of</th><th>Value</th><th>Note</th><th></th></tr></thead>
              <tbody>
                ${assets.map((a) => `
                  <tr>
                    <td data-label="Account"><b>${esc(a.name)}</b></td>
                    <td data-label="Type"><span class="badge" style="background:${ASSET_TYPE_META[a.type]?.color || '#8b93a7'}22;color:${ASSET_TYPE_META[a.type]?.color || '#8b93a7'}">${esc(ASSET_TYPE_META[a.type]?.label || a.type)}</span></td>
                    <td data-label="As of" class="muted">${fmtDate(a.date)}</td>
                    <td data-label="Value" class="amount">${money(a.value)}</td>
                    <td data-label="Note" class="muted">${esc(a.note || '—')}</td>
                    <td class="actions">
                      <button class="btn ghost small" data-edit="${a.id}">✎</button>
                      <button class="btn danger small" data-del="${a.id}">✕</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table></div>`}
      </div>`;

    Charts.lineChart(view.querySelector('#wealth-line'), {
      labels: series.map((p) => p.label.slice(5).replace('-', '/')),
      values: series.map((p) => p.value),
      color: '#10b981', money: true, height: 250,
    });

    Charts.donutChart(view.querySelector('#wealth-donut'), {
      items: allocation.map((a) => ({ label: ASSET_TYPE_META[a.type]?.label || a.type, value: a.value, color: ASSET_TYPE_META[a.type]?.color || '#8b93a7' })),
      centerValue: money(netWorth, { compact: true }),
      centerLabel: 'Net worth',
      height: 230,
    });
    const legend = view.querySelector('#wealth-legend');
    legend.innerHTML = allocation.map((a) => `
      <div class="li">
        <span class="dot" style="background:${ASSET_TYPE_META[a.type]?.color || '#8b93a7'}"></span>
        ${esc(ASSET_TYPE_META[a.type]?.label || a.type)}
        <span class="pct">${money(a.value, { compact: true })} · ${netWorth > 0 ? Math.round((a.value / netWorth) * 100) : 0}%</span>
      </div>`).join('');

    view.querySelectorAll('#asset-add, #asset-add-2').forEach((b) => b.addEventListener('click', () => this.openModal()));
    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const a = assets.find((x) => x.id === Number(b.dataset.edit));
      this.openModal(a);
    }));
    view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const a = assets.find((x) => x.id === Number(b.dataset.del));
      const ok = await confirmDialog(`Remove "${esc(a.name)}" (${money(a.value)})?`, { danger: true });
      if (!ok) return;
      try {
        const data = await api(`/api/assets/${a.id}`, { method: 'DELETE' });
        toast(data.message, 'success');
        this.show(view);
      } catch (err) { toast(err.message, 'error'); }
    }));
  },

  openModal(existing = null) {
    const { close, el } = openModal(`
      <h2>${existing ? 'Edit asset value' : 'Record asset value'} <button class="close-x" data-close>✕</button></h2>
      <form id="asset-form">
        <div class="field">
          <label>Account name</label>
          <input class="input" name="name" maxlength="80" placeholder="e.g. High-Yield Savings" value="${existing ? esc(existing.name) : ''}" required>
          <div class="field-error"></div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Type</label>
            <select class="select" name="type">
              ${Object.entries(ASSET_TYPE_META).map(([k, v]) => `<option value="${k}" ${existing && existing.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Value</label>
            <input class="input" name="value" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" value="${existing ? existing.value : ''}" required>
            <div class="field-error"></div>
          </div>
        </div>
        <div class="field">
          <label>As of date</label>
          <input class="input" name="date" type="date" max="${todayStr()}" value="${existing ? existing.date : todayStr()}" required>
          <div class="hint">Record updated values over time — WealthHabit builds your net-worth trend from them.</div>
        </div>
        <div class="field">
          <label>Note (optional)</label>
          <input class="input" name="note" maxlength="200" placeholder="e.g. Emergency fund — 4.2% APY" value="${existing ? esc(existing.note) : ''}">
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn" type="submit">${existing ? 'Save changes' : 'Record asset'}</button>
        </div>
      </form>`);
    const form = el.querySelector('#asset-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: form.name.value.trim(),
        type: form.type.value,
        value: form.value.value,
        date: form.date.value,
        note: form.note.value.trim(),
      };
      try {
        const data = existing
          ? await api(`/api/assets/${existing.id}`, { method: 'PUT', body })
          : await api('/api/assets', { method: 'POST', body });
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