/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 *
 * Vercel lambda: serves /config.js (via the rewrite in public/vercel.json).
 * It always reports an EMPTY API base: vercel.json proxies every /api/*
 * request to the Render API, so the SPA and API share one origin and the
 * session cookie stays first-party (works on every phone/browser).
 */
'use strict';

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send('window.APP_API_BASE = "";\n');
};
