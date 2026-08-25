const db = require('../db/database');

function checkAndSyncStatus(lic) {
  if (!lic) return null;
  if (lic.status === 'revoked') return lic;
  if (lic.expires_at) {
    const now = new Date();
    const exp = new Date(lic.expires_at);
    if (now > exp && lic.status !== 'expired') {
      db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('expired', lic.id);
      lic.status = 'expired';
    }
  }
  return lic;
}

module.exports = function requireLicense(req, res, next) {
  const key = req.header('x-license-key');
  if (!key) return res.status(401).json({ error: 'مفتاح التفعيل مفقود.', code: 'NO_KEY' });

  let lic = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
  lic = checkAndSyncStatus(lic);

  if (!lic) return res.status(403).json({ error: 'مفتاح التفعيل غير صحيح.', code: 'INVALID_KEY' });
  if (lic.status === 'revoked') return res.status(403).json({ error: 'تم إيقاف هذا التفعيل من قبل الإدارة.', code: 'REVOKED' });
  if (lic.status === 'expired') return res.status(403).json({ error: 'انتهت صلاحية هذا التفعيل.', code: 'EXPIRED' });

  req.license = lic;
  next();
};

module.exports.checkAndSyncStatus = checkAndSyncStatus;
