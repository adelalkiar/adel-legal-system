// قاعدة بيانات نظام العادل للخدمات القانونية
// برمجة: عادل العراقي
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'adel.db');
const dbExists = fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ================= الجداول =================
db.exec(`
CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  panel_slug TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key TEXT UNIQUE NOT NULL,
  duration_type TEXT NOT NULL,           -- days | week | month | year | lifetime
  duration_value INTEGER,                -- عدد الايام في حالة days
  created_at TEXT NOT NULL,
  activated_at TEXT,
  expires_at TEXT,                       -- NULL = مؤبد
  status TEXT NOT NULL DEFAULT 'active', -- active | revoked | expired
  note TEXT,
  device_info TEXT
);

CREATE TABLE IF NOT EXISTS company_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name_ar TEXT DEFAULT '',
  name_en TEXT DEFAULT '',
  tagline_ar TEXT DEFAULT '',
  tagline_en TEXT DEFAULT '',
  logo_path TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  website TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS static_texts (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS field_config (
  field_key TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'free',      -- free | dropdown
  multi_select INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  currency TEXT DEFAULT 'USD',
  client_name TEXT,
  subject TEXT,
  lawyers TEXT,              -- JSON array من اسماء المحامين المختارين
  file_ref TEXT,
  court TEXT,
  client_address TEXT,
  items_json TEXT,           -- JSON لصفوف الجدول
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  fees_expenses REAL DEFAULT 0,
  total_due REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  remaining REAL DEFAULT 0,
  payment_method TEXT,
  transfer_details TEXT,
  invoice_status TEXT DEFAULT 'غير مسددة',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
`);

// ================= بيانات ابتدائية =================
function seedAdmin() {
  const row = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
  if (!row) {
    const defaultPass = process.env.ADEL_ADMIN_PASSWORD || 'Adel07800780';
    const hash = bcrypt.hashSync(defaultPass, 10);
    const slug = 'adel-control-9247';
    db.prepare('INSERT INTO admin_settings (id, password_hash, panel_slug) VALUES (1, ?, ?)').run(hash, slug);
    console.log('تم إنشاء حساب لوحة التحكم الافتراضي. المسار السري:', slug);
  }
}

function seedCompany() {
  const row = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
  if (!row) {
    db.prepare(`INSERT INTO company_profile (id, name_ar, name_en, tagline_ar, tagline_en, logo_path, phone, email, address, website)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'اسم الشركة', 'COMPANY NAME',
      'للمحاماة والاستشارات والخدمات القانونية', 'Law Firm and Legal Consultancy',
      '', '', '', '', ''
    );
  }
}

function seedStaticTexts() {
  const defaults = {
    doc_title_ar: 'فاتورة أتعاب وخدمات قانونية',
    doc_title_en: 'LEGAL FEES INVOICE',
    section_client: 'بيانات العميل',
    section_items: 'تفاصيل الخدمات والأتعاب',
    section_payment_status: 'حالة السداد',
    section_summary: 'الملخص المالي',
    section_notes: 'ملاحظات وشروط السداد',

    label_invoice_number: 'رقم الفاتورة',
    label_issue_date: 'تاريخ الإصدار',
    label_due_date: 'تاريخ الاستحقاق',
    label_currency: 'العملة',

    label_client_name: 'اسم العميل',
    label_subject: 'موضوع التكليف',
    label_lawyer: 'المحامي المسؤول',
    label_file_ref: 'الملف / المرجع',
    label_court: 'المحكمة / الجهة',
    label_address: 'العنوان',

    table_no: 'ت',
    table_service: 'بيان الخدمة',
    table_unit_price: 'سعر الوحدة',
    table_qty: 'الكمية',
    table_amount: 'المبلغ',
    table_note: 'ملاحظات',
    table_subtotal_label: 'الإجمالي الفرعي للأتعاب والرسوم',
    continue_label: 'تتمة الفاتورة',
    continue_ref_label: 'الرقم المرجعي',
    continue_file_label: 'الملف / المرجع',
    continue_client_label: 'العميل',

    label_invoice_status: 'حالة الفاتورة',
    label_total_due: 'إجمالي المستحق',
    label_paid_amount: 'المبلغ المدفوع',
    label_remaining: 'المبلغ المتبقي',
    label_payment_method: 'طريقة الدفع',
    label_transfer_details: 'بيانات التحويل',

    summary_fees_total: 'إجمالي الأتعاب المهنية',
    summary_fees_expenses: 'الرسوم والمصاريف',
    summary_discount: 'الخصم',
    summary_total_due: 'الإجمالي المستحق',
    summary_paid: 'المبلغ المدفوع',
    summary_remaining: 'المبلغ المتبقي',
    summary_due_date: 'تاريخ الاستحقاق',

    notes_default: 'تستحق الأتعاب وفق نطاق الخدمات القانونية والتكليف المهني المتفق عليه مع العميل.\nلا تشمل الأتعاب الرسوم القضائية والرسمية وأجور سفر وسكن والترجمة والتصديقات والنتقل وأية نفقات للغير، ما لم يُنص على خلاف ذلك.\nأي أعمال أو مصاريف إضافية خارج نطاق هذه الفاتورة تستلزم موافقة العميل قبل تنفيذها.\nيرجى تسديد المبلغ المستحق قبل تاريخ الاستحقاق لتجنب أي تأخير في الإجراءات.',

    footer_client_signature: 'توقيع العميل',
    footer_on_behalf: 'عن الشركة',
    footer_manager: 'المدير المفوض'
  };
  const insert = db.prepare('INSERT OR IGNORE INTO static_texts (key, value, locked) VALUES (?, ?, 1)');
  const tx = db.transaction((items) => {
    for (const [k, v] of Object.entries(items)) insert.run(k, v);
  });
  tx(defaults);

  const insertMissing = db.prepare('INSERT OR IGNORE INTO static_texts (key, value, locked) VALUES (?, ?, 1)');
  insertMissing.run('continue_label', defaults.continue_label);
  insertMissing.run('continue_ref_label', defaults.continue_ref_label);
  insertMissing.run('continue_file_label', defaults.continue_file_label);
  insertMissing.run('continue_client_label', defaults.continue_client_label);

  const unit = db.prepare("SELECT value FROM static_texts WHERE key='table_unit_price'").get();
  if (unit && unit.value === 'سعر الوحدة (USD)') {
    db.prepare("UPDATE static_texts SET value=? WHERE key='table_unit_price'").run('سعر الوحدة');
  }
  const amt = db.prepare("SELECT value FROM static_texts WHERE key='table_amount'").get();
  if (amt && amt.value === 'المبلغ (USD)') {
    db.prepare("UPDATE static_texts SET value=? WHERE key='table_amount'").run('المبلغ');
  }
}

function seedFieldConfig() {
  const fields = ['subject', 'court', 'payment_method', 'currency'];
  const insert = db.prepare("INSERT OR IGNORE INTO field_config (field_key, mode, multi_select) VALUES (?, 'free', 0)");
  fields.forEach(f => insert.run(f));
  db.prepare("INSERT OR IGNORE INTO field_config (field_key, mode, multi_select) VALUES ('lawyer', 'dropdown', 1)").run();

  // قيم افتراضية لبعض القوائم
  const li = db.prepare('INSERT INTO list_items (field_key, value, sort_order) VALUES (?, ?, ?)');
  const existingCurrency = db.prepare("SELECT COUNT(*) c FROM list_items WHERE field_key='currency'").get();
  if (existingCurrency.c === 0) {
    ['USD - دولار أمريكي', 'IQD - دينار عراقي', 'EUR - يورو'].forEach((v, i) => li.run('currency', v, i));
  }
  const existingPM = db.prepare("SELECT COUNT(*) c FROM list_items WHERE field_key='payment_method'").get();
  if (existingPM.c === 0) {
    ['تحويل مصرفي', 'نقداً', 'شيك', 'بطاقة ائتمانية'].forEach((v, i) => li.run('payment_method', v, i));
  }
}

seedAdmin();
seedCompany();
seedStaticTexts();
seedFieldConfig();

module.exports = db;
