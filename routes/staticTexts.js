const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM static_texts').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

router.put('/', (req, res) => {
  const updates = req.body || {};
  const stmt = db.prepare('UPDATE static_texts SET value = ? WHERE key = ?');
  const tx = db.transaction((items) => {
    for (const [k, v] of Object.entries(items)) stmt.run(v, k);
  });
  tx(updates);
  res.json({ ok: true });
});

module.exports = router;
