/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 *
 * Vercel lambda: serves /config.js (via the rewrite in public/vercel.json).
 * The SPA reads window.APP_API_BASE before any fetch so it can call the
 * Render-hosted API. Set API_BASE_URL in the Vercel project's environment.
 */
'use strict';

module.exports = (req, res) => {
  const base = process.env.API_BASE_URL || '';
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`window.APP_API_BASE = ${JSON.stringify(base)};\n`);
};
