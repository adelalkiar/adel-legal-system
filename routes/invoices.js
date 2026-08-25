const express = require('express');
const router = express.Router();
const db = require('../db/database');

function todayISODate() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function nextInvoiceNumber() {
  const last = db.prepare('SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1').get();
  if (!last) return 'INV-001';
  const m = last.invoice_number.match(/(\d+)\s*$/);
  if (!m) return 'INV-001';
  const nextNum = (parseInt(m[1], 10) + 1).toString().padStart(m[1].length, '0');
  return last.invoice_number.slice(0, m.index) + nextNum;
}

// القيم الافتراضية عند فتح فاتورة جديدة (رقم الفاتورة + التاريخ)
router.get('/defaults/new', (req, res) => {
  res.json({ invoice_number: nextInvoiceNumber(), issue_date: todayISODate() });
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, invoice_number, issue_date, client_name, total_due, remaining, invoice_status, currency FROM invoices ORDER BY id DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'الفاتورة غير موجودة.' });
  row.items_json = row.items_json ? JSON.parse(row.items_json) : [];
  row.lawyers = row.lawyers ? JSON.parse(row.lawyers) : [];
  res.json(row);
});

function computeTotals(items, discount, feesExpensesManual) {
  let subtotal = 0;
  (items || []).forEach(it => {
    const qty = parseFloat(it.qty) || 0;
    const unit = parseFloat(it.unit_price) || 0;
    const amount = it.amount !== undefined && it.amount !== '' ? parseFloat(it.amount) : qty * unit;
    subtotal += isNaN(amount) ? 0 : amount;
  });
  const disc = parseFloat(discount) || 0;
  const totalDue = Math.max(subtotal - disc, 0);
  return { subtotal, totalDue };
}

router.post('/', (req, res) => {
  const b = req.body;
  const invoice_number = b.invoice_number && b.invoice_number.trim() ? b.invoice_number.trim() : nextInvoiceNumber();

  const exists = db.prepare('SELECT 1 FROM invoices WHERE invoice_number = ?').get(invoice_number);
  if (exists) return res.status(409).json({ error: 'رقم الفاتورة مستخدم مسبقاً.' });

  const { subtotal, totalDue } = computeTotals(b.items, b.discount);
  const paid = parseFloat(b.paid_amount) || 0;
  const remaining = Math.max(totalDue - paid, 0);
  const status = remaining <= 0 && totalDue > 0 ? 'مسددة' : (paid > 0 ? 'مسددة جزئياً' : 'غير مسددة');
  const now = new Date().toISOString();

  const info = db.prepare(`INSERT INTO invoices
    (invoice_number, issue_date, due_date, currency, client_name, subject, lawyers, file_ref, court, client_address,
     items_json, subtotal, discount, fees_expenses, total_due, paid_amount, remaining, payment_method, transfer_details,
     invoice_status, notes, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    invoice_number,
    b.issue_date || todayISODate(),
    b.due_date || null,
    b.currency || 'USD',
    b.client_name || '',
    b.subject || '',
    JSON.stringify(b.lawyers || []),
    b.file_ref || '',
    b.court || '',
    b.client_address || '',
    JSON.stringify(b.items || []),
    subtotal,
    parseFloat(b.discount) || 0,
    parseFloat(b.fees_expenses) || 0,
    totalDue,
    paid,
    remaining,
    b.payment_method || '',
    b.transfer_details || '',
    b.invoice_status || status,
    b.notes || '',
    now, now
  );

  res.json({ ok: true, id: info.lastInsertRowid, invoice_number });
});

router.put('/:id', (req, res) => {
  const b = req.body;
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'الفاتورة غير موجودة.' });

  const { subtotal, totalDue } = computeTotals(b.items, b.discount);
  const paid = parseFloat(b.paid_amount) || 0;
  const remaining = Math.max(totalDue - paid, 0);
  const status = remaining <= 0 && totalDue > 0 ? 'مسددة' : (paid > 0 ? 'مسددة جزئياً' : 'غير مسددة');

  db.prepare(`UPDATE invoices SET
    issue_date=?, due_date=?, currency=?, client_name=?, subject=?, lawyers=?, file_ref=?, court=?, client_address=?,
    items_json=?, subtotal=?, discount=?, fees_expenses=?, total_due=?, paid_amount=?, remaining=?, payment_method=?,
    transfer_details=?, invoice_status=?, notes=?, updated_at=?
    WHERE id=?`).run(
    b.issue_date, b.due_date || null, b.currency || 'USD', b.client_name || '', b.subject || '',
    JSON.stringify(b.lawyers || []), b.file_ref || '', b.court || '', b.client_address || '',
    JSON.stringify(b.items || []), subtotal, parseFloat(b.discount) || 0, parseFloat(b.fees_expenses) || 0,
    totalDue, paid, remaining, b.payment_method || '', b.transfer_details || '',
    b.invoice_status || status, b.notes || '', new Date().toISOString(), req.params.id
  );

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
