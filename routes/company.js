const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db/database');

const uploadDir = path.join(__dirname, '..', 'public', 'assets', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, 'logo_' + Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
      return cb(new Error('صيغة الصورة غير مدعومة.'));
    }
    cb(null, true);
  }
});

router.get('/', (req, res) => {
  const profile = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
  res.json(profile);
});

router.put('/', (req, res) => {
  const { name_ar, name_en, tagline_ar, tagline_en, phone, email, address, website } = req.body;
  db.prepare(`UPDATE company_profile SET name_ar=?, name_en=?, tagline_ar=?, tagline_en=?, phone=?, email=?, address=?, website=? WHERE id=1`)
    .run(name_ar || '', name_en || '', tagline_ar || '', tagline_en || '', phone || '', email || '', address || '', website || '');
  res.json({ ok: true });
});

router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق صورة.' });
  const relPath = '/assets/uploads/' + req.file.filename;
  db.prepare('UPDATE company_profile SET logo_path = ? WHERE id = 1').run(relPath);
  res.json({ ok: true, logo_path: relPath });
});

module.exports = router;
