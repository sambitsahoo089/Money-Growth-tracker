/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

/**
 * The SPA talks to this API. window.APP_API_BASE comes from /config.js
 * (served by the Express app, or by a Vercel lambda when the SPA is hosted
 * on Vercel). Empty string ⇒ same origin as this page (local dev / Render).
 */
const API_BASE = (typeof window.APP_API_BASE === 'string' ? window.APP_API_BASE : '').replace(/\/+$/, '');

/** Minimal fetch wrapper: JSON in/out, throws Error with server message on non-2xx. */
async function api(path, opts = {}) {
  const init = { credentials: 'include', ...opts };
  init.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.body !== undefined && typeof opts.body !== 'string') {
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API_BASE + path, init);
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth')) {
      window.location.hash = '#/login';
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
