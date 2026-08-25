// نظام العادل للخدمات القانونية
// برمجة: عادل العراقي
const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./db/database');
const requireLicense = require('./middleware/licenseAuth');

const activationRoutes = require('./routes/activation');
const adminRoutes = require('./routes/admin');
const companyRoutes = require('./routes/company');
const fieldsRoutes = require('./routes/fields');
const staticTextsRoutes = require('./routes/staticTexts');
const invoicesRoutes = require('./routes/invoices');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'adel-legal-system-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8 ساعات
}));

// ============ الملفات الثابتة ============
app.use(express.static(path.join(__dirname, 'public')));

// ============ مسار لوحة التحكم السرية ============
const settingsRow = db.prepare('SELECT panel_slug FROM admin_settings WHERE id = 1').get();
const ADMIN_SLUG = settingsRow ? settingsRow.panel_slug : 'adel-control-9247';

app.get('/' + ADMIN_SLUG, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'admin.html'));
});

// ============ API: التفعيل (عام، بدون حماية) ============
app.use('/api', activationRoutes);

// ============ API: لوحة التحكم (محمي بجلسة أدمن) ============
app.use('/api/admin', adminRoutes);

// ============ API: التطبيق الرئيسي (يتطلب مفتاح تفعيل صالح) ============
app.use('/api/company', requireLicense, companyRoutes);
app.use('/api/fields', requireLicense, fieldsRoutes);
app.use('/api/static-texts', requireLicense, staticTextsRoutes);
app.use('/api/invoices', requireLicense, invoicesRoutes);

// ============ الصفحة الرئيسية ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالجة الأخطاء العامة
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم.' });
});

app.listen(PORT, () => {
  console.log('===================================================');
  console.log('  نظام العادل للخدمات القانونية — برمجة عادل العراقي');
  console.log('===================================================');
  console.log(`  الخادم يعمل على: http://localhost:${PORT}`);
  console.log(`  لوحة التحكم السرية: http://localhost:${PORT}/${ADMIN_SLUG}`);
  console.log('===================================================');
});
