const express = require('express');
const router = express.Router();
const db = require('../db/database');

// إرجاع كل إعدادات الحقول مع عناصر قوائمها دفعة واحدة
router.get('/', (req, res) => {
  const configs = db.prepare('SELECT * FROM field_config').all();
  const items = db.prepare('SELECT * FROM list_items ORDER BY sort_order ASC, id ASC').all();
  const grouped = {};
  configs.forEach(c => { grouped[c.field_key] = { mode: c.mode, multi_select: !!c.multi_select, items: [] }; });
  items.forEach(it => {
    if (!grouped[it.field_key]) grouped[it.field_key] = { mode: 'dropdown', multi_select: false, items: [] };
    grouped[it.field_key].items.push({ id: it.id, value: it.value });
  });
  res.json(grouped);
});

router.put('/:key/mode', (req, res) => {
  const { key } = req.params;
  const { mode, multi_select } = req.body;
  if (!['free', 'dropdown'].includes(mode)) return res.status(400).json({ error: 'نوع غير صحيح.' });
  db.prepare(`INSERT INTO field_config (field_key, mode, multi_select) VALUES (?, ?, ?)
    ON CONFLICT(field_key) DO UPDATE SET mode=excluded.mode, multi_select=excluded.multi_select`)
    .run(key, mode, multi_select ? 1 : 0);
  res.json({ ok: true });
});

router.post('/:key/items', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (!value || !value.trim()) return res.status(400).json({ error: 'القيمة فارغة.' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM list_items WHERE field_key = ?').get(key).m;
  const info = db.prepare('INSERT INTO list_items (field_key, value, sort_order) VALUES (?, ?, ?)').run(key, value.trim(), maxOrder + 1);
  // فعّل وضع القائمة تلقائياً عند إضافة أول عنصر
  db.prepare(`INSERT INTO field_config (field_key, mode, multi_select) VALUES (?, 'dropdown', 0)
    ON CONFLICT(field_key) DO UPDATE SET mode='dropdown'`).run(key);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/:key/items/:id', (req, res) => {
  db.prepare('DELETE FROM list_items WHERE id = ? AND field_key = ?').run(req.params.id, req.params.key);
  res.json({ ok: true });
});

module.exports = router;
