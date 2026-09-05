/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { db, toDollars } = require('../db');
const { requireAuth } = require('../middleware');
const { ASSET_TYPES, cleanStr, isValidDate, parseAmountCents, bad } = require('../helpers');
const { currentAssets, currentNetWorth, netWorthSeries } = require('../analytics');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const uid = req.session.userId;
  const assets = currentAssets(uid);
  const allocation = [];
  for (const a of assets) {
    const existing = allocation.find((x) => x.type === a.type);
    if (existing) existing.value += a.value;
    else allocation.push({ type: a.type, value: a.value });
  }
  allocation.sort((a, b) => b.value - a.value);
  return res.json({
    netWorth: currentNetWorth(uid),
    assets,
    allocation,
    netWorthSeries: netWorthSeries(uid, 12),
  });
});

router.post('/assets', (req, res) => {
  const name = cleanStr(req.body.name, 80);
  const type = ASSET_TYPES.includes(req.body.type) ? req.body.type : null;
  const value = parseAmountCents(req.body.value);
  const date = typeof req.body.date === 'string' ? req.body.date : '';
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 200) : '';

  if (!name) return bad(res, 'Please enter an asset name (2–80 characters).');
  if (!type) return bad(res, 'Please choose a valid asset type.');
  if (!value) return bad(res, 'Please enter a valid value (greater than 0).');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');
  if (date > new Date().toISOString().slice(0, 10)) return bad(res, 'Date cannot be in the future.');

  const res2 = db.prepare('INSERT INTO assets (user_id, name, type, value_cents, date, note, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(req.session.userId, name, type, value, date, note, new Date().toISOString());
  return res.status(201).json({ ok: true, id: Number(res2.lastInsertRowid), message: 'Asset recorded.' });
});

router.put('/assets/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM assets WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Asset not found.', 404);

  const name = cleanStr(req.body.name, 80);
  const type = ASSET_TYPES.includes(req.body.type) ? req.body.type : null;
  const value = parseAmountCents(req.body.value);
  const date = typeof req.body.date === 'string' ? req.body.date : '';
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 200) : '';

  if (!name) return bad(res, 'Please enter an asset name (2–80 characters).');
  if (!type) return bad(res, 'Please choose a valid asset type.');
  if (!value) return bad(res, 'Please enter a valid value (greater than 0).');
  if (!isValidDate(date)) return bad(res, 'Please enter a valid date.');

  db.prepare('UPDATE assets SET name = ?, type = ?, value_cents = ?, date = ?, note = ? WHERE id = ?')
    .run(name, type, value, date, note, id);
  return res.json({ ok: true, message: 'Asset updated.' });
});

router.delete('/assets/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM assets WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) return bad(res, 'Asset not found.', 404);
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  return res.json({ ok: true, message: 'Asset removed.' });
});

module.exports = router;