/*
 * WealthHabit — Habit-Driven Wealth Builder
 * © 2026 sambitsahoo089 · github.com/sambitsahoo089
 */
'use strict';

const { Store } = require('express-session');

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, mirrors the cookie maxAge

function expiresAt(sess) {
  const maxAge = sess && sess.cookie && typeof sess.cookie.originalMaxAge === 'number'
    ? sess.cookie.originalMaxAge
    : DEFAULT_TTL_MS;
  return new Date(Date.now() + maxAge);
}

/**
 * Minimal persistent session store backed by the `sessions` MongoDB
 * collection. Documents are purged automatically by the TTL index created
 * in src/db.js (expireAfterSeconds: 0 on the `expires` field).
 */
class MongoSessionStore extends Store {
  constructor(col) {
    super();
    this.col = col;
  }

  get(sid, cb) {
    this.col.findOne({ _id: sid })
      .then((doc) => {
        if (!doc) return cb();
        let sess;
        try { sess = JSON.parse(doc.session); } catch { return cb(); }
        cb(null, sess);
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, cb) {
    this.col.updateOne(
      { _id: sid },
      { $set: { session: JSON.stringify(sess), expires: expiresAt(sess) } },
      { upsert: true },
    ).then(() => cb(null)).catch((err) => cb(err));
  }

  touch(sid, sess, cb) {
    this.col.updateOne({ _id: sid }, { $set: { expires: expiresAt(sess) } })
      .then(() => cb(null)).catch((err) => cb(err));
  }

  destroy(sid, cb) {
    this.col.deleteOne({ _id: sid })
      .then(() => cb(null)).catch((err) => cb(err));
  }
}

module.exports = MongoSessionStore;
