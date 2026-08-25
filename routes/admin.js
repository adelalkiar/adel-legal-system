const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db/database');
const requireAdmin = require('../middleware/adminAuth');
const { checkAndSyncStatus } = require('../middleware/licenseAuth');

// حماية بسيطة ضد محاولات تخمين كلمة المرور المتكررة
const loginAttempts = new Map();
function isLocked(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (rec.count >= 6 && Date.now() - rec.last < 10 * 60 * 1000) return true;
  return false;
}
function recordFail(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, last: 0 };
  rec.count += 1;
  rec.last = Date.now();
  loginAttempts.set(ip, rec);
}
function recordSuccess(ip) {
  loginAttempts.delete(ip);
}

// ---------- تسجيل الدخول ----------
router.post('/login', (req, res) => {
  const ip = req.ip;
  if (isLocked(ip)) {
    return res.status(429).json({ error: 'محاولات كثيرة فاشلة. الرجاء الانتظار 10 دقائق.' });
  }
  const { password } = req.body;
  const settings = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
  if (!settings || !bcrypt.compareSync(password || '', settings.password_hash)) {
    recordFail(ip);
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
  }
  recordSuccess(ip);
  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// كل ما بعد هذا يتطلب جلسة أدمن فعالة
router.use(requireAdmin);

// تغيير كلمة مرور لوحة التحكم
router.post('/change-password', (req, res) => {
  const { current_password, new_password } = req.body;
  const settings = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
  if (!bcrypt.compareSync(current_password || '', settings.password_hash)) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف.' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admin_settings SET password_hash = ? WHERE id = 1').run(hash);
  res.json({ ok: true });
});

// ---------- توليد مفاتيح التفعيل ----------
function generateHexKey() {
  const raw = crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 hex chars
  return raw.match(/.{1,4}/g).join('-'); // XXXX-XXXX-XXXX-XXXX
}

function computeExpiry(duration_type, duration_value) {
  const now = new Date();
  switch (duration_type) {
    case 'days': {
      const d = new Date(now);
      d.setDate(d.getDate() + (parseInt(duration_value, 10) || 1));
      return d.toISOString();
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    }
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString();
    }
    case 'lifetime':
      return null;
    default:
      throw new Error('نوع مدة غير معروف');
  }
}

router.post('/licenses/generate', (req, res) => {
  const { duration_type, duration_value, note, count } = req.body;
  const validTypes = ['days', 'week', 'month', 'year', 'lifetime'];
  if (!validTypes.includes(duration_type)) {
    return res.status(400).json({ error: 'نوع مدة غير صحيح.' });
  }
  if (duration_type === 'days' && (!duration_value || duration_value < 1)) {
    return res.status(400).json({ error: 'الرجاء تحديد عدد الأيام.' });
  }

  const howMany = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50);
  const created = [];
  const insert = db.prepare(`INSERT INTO licenses (license_key, duration_type, duration_value, created_at, expires_at, status, note)
    VALUES (?, ?, ?, ?, ?, 'active', ?)`);

  for (let i = 0; i < howMany; i++) {
    let key;
    do { key = generateHexKey(); } while (db.prepare('SELECT 1 FROM licenses WHERE license_key = ?').get(key));
    const expires_at = computeExpiry(duration_type, duration_value);
    const created_at = new Date().toISOString();
    insert.run(key, duration_type, duration_value || null, created_at, expires_at, note || null);
    created.push({ license_key: key, duration_type, expires_at, created_at });
  }

  res.json({ ok: true, licenses: created });
});

router.get('/licenses', (req, res) => {
  const rows = db.prepare('SELECT * FROM licenses ORDER BY id DESC').all();
  rows.forEach(checkAndSyncStatus);
  res.json(rows);
});

router.post('/licenses/:id/revoke', (req, res) => {
  const result = db.prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'المفتاح غير موجود.' });
  res.json({ ok: true });
});

router.post('/licenses/:id/reactivate', (req, res) => {
  const lic = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
  if (!lic) return res.status(404).json({ error: 'المفتاح غير موجود.' });
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
    return res.status(400).json({ error: 'لا يمكن إعادة تفعيل مفتاح منتهي الصلاحية. الرجاء توليد مفتاح جديد.' });
  }
  db.prepare("UPDATE licenses SET status = 'active' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete('/licenses/:id', (req, res) => {
  db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
