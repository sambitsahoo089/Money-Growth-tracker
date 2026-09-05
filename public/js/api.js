/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

/** Minimal fetch wrapper: JSON in/out, throws Error with server message on non-2xx. */
async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', ...opts };
  init.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.body !== undefined && typeof opts.body !== 'string') {
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
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