/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const express = require('express');
const { col, oid, toDollars } = require('../db');
const { requireAuth, wrap } = require('../middleware');
const { ASSET_TYPES, cleanStr, isValidDate, parseAmountCents, bad } = require('../helpers');
const { currentAssets, currentNetWorth, netWorthSeries } = require('../analytics');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const uid = req.session.userId;
  const assets = await currentAssets(uid);
  const allocation = [];
  for (const a of assets) {
    const existing = allocation.find((x) => x.type === a.type);
    if (existing) existing.value += a.value;
    else allocation.push({ type: a.type, value: a.value });
  }
  allocation.sort((a, b) => b.value - a.value);
  return res.json({
    netWorth: await currentNetWorth(uid),
    assets,
    allocation,
    netWorthSeries: await netWorthSeries(uid, 12),
  });
}));

router.post('/assets', wrap(async (req, res) => {
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

  const res2 = await col('assets').insertOne({
    user_id: oid(req.session.userId), name, type, value_cents: value, date, note,
    created_at: new Date().toISOString(),
  });
  return res.status(201).json({ ok: true, id: String(res2.insertedId), message: 'Asset recorded.' });
}));

router.put('/assets/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('assets').findOne({ _id: id, user_id: oid(req.session.userId) });
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

  await col('assets').updateOne({ _id: id }, { $set: { name, type, value_cents: value, date, note } });
  return res.json({ ok: true, message: 'Asset updated.' });
}));

router.delete('/assets/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const existing = id && await col('assets').findOne({ _id: id, user_id: oid(req.session.userId) });
  if (!existing) return bad(res, 'Asset not found.', 404);
  await col('assets').deleteOne({ _id: id });
  return res.json({ ok: true, message: 'Asset removed.' });
}));

module.exports = router;
