const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { checkAndSyncStatus } = require('../middleware/licenseAuth');

// تفعيل مفتاح لأول مرة أو تسجيل دخول به
router.post('/activate', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'الرجاء إدخال مفتاح التفعيل.' });

  let lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key.trim().toUpperCase());
  lic = checkAndSyncStatus(lic);

  if (!lic) return res.status(404).json({ error: 'مفتاح التفعيل غير صحيح أو غير موجود.' });
  if (lic.status === 'revoked') return res.status(403).json({ error: 'تم إيقاف هذا المفتاح من قبل الإدارة.' });
  if (lic.status === 'expired') return res.status(403).json({ error: 'انتهت صلاحية هذا المفتاح.' });

  if (!lic.activated_at) {
    db.prepare('UPDATE licenses SET activated_at = ? WHERE id = ?').run(new Date().toISOString(), lic.id);
    lic.activated_at = new Date().toISOString();
  }

  res.json({
    ok: true,
    key: lic.license_key,
    duration_type: lic.duration_type,
    expires_at: lic.expires_at,
    activated_at: lic.activated_at
  });
});

// التحقق الدوري من صلاحية المفتاح
router.post('/verify', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: 'مفتاح مفقود.' });

  let lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key.trim().toUpperCase());
  lic = checkAndSyncStatus(lic);

  if (!lic) return res.json({ ok: false, error: 'مفتاح التفعيل غير صحيح.' });
  if (lic.status === 'revoked') return res.json({ ok: false, error: 'تم إيقاف هذا التفعيل من قبل الإدارة.' });
  if (lic.status === 'expired') return res.json({ ok: false, error: 'انتهت صلاحية هذا التفعيل.' });

  res.json({ ok: true, expires_at: lic.expires_at, duration_type: lic.duration_type });
});

module.exports = router;
