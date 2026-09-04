'use strict';

/* Dependency-free SVG charts. Each chart registers a redraw fn so the
   whole page re-renders at the right size after resize. */

const Charts = (() => {
  const redraws = [];

  function register(fn) {
    redraws.push(fn);
  }

  let debounced = false;
  window.addEventListener('resize', () => {
    if (debounced) return;
    debounced = true;
    setTimeout(() => { debounced = false; redraws.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }, 150);
  });

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  // Theme-aware neutrals (falls back gracefully if vars are missing).
  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch { return fallback; }
  }
  const GRID = () => cssVar('--chart-grid', '#22304f');
  const LABEL = () => cssVar('--chart-label', '#7e8ca8');
  const TEXT = () => cssVar('--chart-text', '#e8edf6');

  function fmtAxis(v) {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return String(Math.round(v));
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  /* ------------------------- Line chart ------------------------- */
  function lineChart(container, { labels, values, color = '#4f46e5', height = 220, money = false }) {
    const render = () => {
      const width = container.clientWidth || 400;
      if (width < 40) return;
      const pad = { top: 14, right: 12, bottom: 26, left: 46 };
      const W = width, H = height;
      const iw = W - pad.left - pad.right, ih = H - pad.top - pad.bottom;
      container.innerHTML = '';
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      const vmax = niceMax(Math.max(...values, 1));
      const vmin = 0;

      const x = (i) => pad.left + (values.length === 1 ? iw / 2 : (i / (values.length - 1)) * iw);
      const y = (v) => pad.top + ih - ((v - vmin) / (vmax - vmin)) * ih;

      // gridlines + y labels
      const ticks = 4;
      for (let t = 0; t <= ticks; t++) {
        const v = vmin + ((vmax - vmin) * t) / ticks;
        const yy = y(v);
        svg.appendChild(svgEl('line', { x1: pad.left, y1: yy, x2: W - pad.right, y2: yy, stroke: GRID(), 'stroke-width': 1 }));
        const label = svgEl('text', { x: pad.left - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 10, fill: LABEL() });
        label.textContent = fmtAxis(v);
        svg.appendChild(label);
      }

      // x labels (sparse)
      const step = Math.max(1, Math.ceil(labels.length / 8));
      labels.forEach((l, i) => {
        if (i % step !== 0 && i !== labels.length - 1) return;
        const t = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: LABEL() });
        t.textContent = l;
        svg.appendChild(t);
      });

      // area + line
      const pts = values.map((v, i) => `${x(i)},${y(v)}`);
      if (values.length > 1) {
        const area = svgEl('polygon', {
          points: `${pad.left},${pad.top + ih} ${pts.join(' ')} ${pad.left + iw},${pad.top + ih}`,
          fill: color, opacity: 0.08,
        });
        svg.appendChild(area);
      }
      const line = svgEl('polyline', {
        points: pts.join(' '),
        fill: 'none', stroke: color, 'stroke-width': 2.5,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      });
      svg.appendChild(line);

      // points with tooltips
      values.forEach((v, i) => {
        const c = svgEl('circle', { cx: x(i), cy: y(v), r: i === values.length - 1 ? 4 : 2.5, fill: '#fff', stroke: color, 'stroke-width': 2 });
        const title = svgEl('title');
        title.textContent = `${labels[i]} — ${money ? fmtAxis(v) : v}`;
        c.appendChild(title);
        svg.appendChild(c);
      });

      container.appendChild(svg);
    };
    render();
    register(render);
  }

  /* ------------------------- Bar chart ------------------------- */
  function barChart(container, { labels, values, colors, height = 220, money = false }) {
    const render = () => {
      const width = container.clientWidth || 400;
      if (width < 40 || labels.length === 0) return;
      const pad = { top: 14, right: 8, bottom: 26, left: 46 };
      const W = width, H = height;
      const iw = W - pad.left - pad.right, ih = H - pad.top - pad.bottom;
      container.innerHTML = '';
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      const vmax = niceMax(Math.max(...values, 1));

      const ticks = 4;
      for (let t = 0; t <= ticks; t++) {
        const v = (vmax * t) / ticks;
        const yy = pad.top + ih - (v / vmax) * ih;
        svg.appendChild(svgEl('line', { x1: pad.left, y1: yy, x2: W - pad.right, y2: yy, stroke: GRID(), 'stroke-width': 1 }));
        const label = svgEl('text', { x: pad.left - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 10, fill: LABEL() });
        label.textContent = fmtAxis(v);
        svg.appendChild(label);
      }

      const slot = iw / labels.length;
      const bw = Math.min(46, slot * 0.55);
      labels.forEach((l, i) => {
        const v = values[i];
        const h = (v / vmax) * ih;
        const cx = pad.left + slot * i + slot / 2;
        const bar = svgEl('rect', {
          x: cx - bw / 2, y: pad.top + ih - h, width: bw, height: Math.max(h, v > 0 ? 2 : 0),
          rx: 4, fill: colors[i] || '#6366f1',
        });
        const title = svgEl('title');
        title.textContent = `${l} — ${money ? fmtAxis(v) : v}`;
        bar.appendChild(title);
        svg.appendChild(bar);
        const t = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle', 'font-size': 9.5, fill: LABEL() });
        t.textContent = String(l).length > 7 ? String(l).slice(0, 6) + '…' : l;
        svg.appendChild(t);
      });

      container.appendChild(svg);
    };
    render();
    register(render);
  }

  /* ------------------------- Donut ------------------------- */
  function donutChart(container, { items, centerLabel = '', centerValue = '', height = 200 }) {
    const render = () => {
      const width = container.clientWidth || 400;
      if (width < 40) return;
      const total = items.reduce((s, i) => s + i.value, 0);
      const W = width, H = height;
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 18, C = 2 * Math.PI * r;
      container.innerHTML = '';
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });

      if (total <= 0) {
        const t = svgEl('text', { x: cx, y: cy, 'text-anchor': 'middle', 'font-size': 12, fill: LABEL() });
        t.textContent = 'No data yet';
        svg.appendChild(t);
        container.appendChild(svg);
        return;
      }

      let offset = 0;
      items.forEach((it) => {
        const frac = it.value / total;
        const c = svgEl('circle', {
          cx, cy, r,
          fill: 'none', stroke: it.color, 'stroke-width': 20,
          'stroke-dasharray': `${frac * C} ${C}`,
          'stroke-dashoffset': -offset,
          transform: `rotate(-90 ${cx} ${cy})`,
        });
        const title = svgEl('title');
        title.textContent = `${it.label} — ${money(it.value, { compact: true })} (${pct(frac, 1)})`;
        c.appendChild(title);
        svg.appendChild(c);
        offset += frac * C;
      });

      if (centerValue || centerLabel) {
        const v = svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: TEXT() });
        v.textContent = centerValue;
        svg.appendChild(v);
        const l = svgEl('text', { x: cx, y: cy + 15, 'text-anchor': 'middle', 'font-size': 10, fill: LABEL() });
        l.textContent = centerLabel;
        svg.appendChild(l);
      }
      container.appendChild(svg);
    };
    render();
    register(render);
  }

  /* ------------------------- Sparkline ------------------------- */
  function sparkline(container, { values, color = '#10b981', height = 36 }) {
    const render = () => {
      const width = container.clientWidth || 200;
      if (width < 40 || values.length < 2) return;
      container.innerHTML = '';
      const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      const vmax = Math.max(...values), vmin = Math.min(...values);
      const range = vmax - vmin || 1;
      const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 3 - ((v - vmin) / range) * (height - 6)}`);
      svg.appendChild(svgEl('polygon', {
        points: `0,${height} ${pts.join(' ')} ${width},${height}`,
        fill: color, opacity: 0.12,
      }));
      svg.appendChild(svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      container.appendChild(svg);
    };
    render();
    register(render);
  }

  return { lineChart, barChart, donutChart, sparkline };
})();