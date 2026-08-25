// نظام العادل للخدمات القانونية — برمجة عادل العراقي
(function () {
  'use strict';

  const LS_KEY = 'adel_license_key';
  let state = {
    licenseKey: localStorage.getItem(LS_KEY) || '',
    staticTexts: {},
    fields: {},          // إعدادات الحقول القابلة للتحويل لقائمة
    company: {},
    unlocked: false,
    editingInvoiceId: null,
    items: [],
    selectedLawyers: [],
    multiModalField: null
  };

  // ============ أدوات مساعدة ============
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  function toast(msg, type) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => { t.className = 'toast'; }, 2800);
  }

  function getSelectedCurrency() {
    const el = document.getElementById('f_currency');
    return el ? el.value : 'USD';
  }

  function parseCurrencyMeta(raw) {
    const text = String(raw || 'USD');
    let code = (text.match(/\b([A-Z]{3})\b/) || [])[1] || '';
    if (!code && /دينار|iqd|idq/i.test(text)) code = 'IQD';
    if (!code && /يورو|euro/i.test(text)) code = 'EUR';
    if (!code && /دولار|usd|dollar/i.test(text)) code = 'USD';
    if (!code) code = 'USD';
    if (code === 'IDQ') code = 'IQD';
    const table = {
      USD: { code: 'USD', symbol: '$', spaced: false, decimals: 2 },
      EUR: { code: 'EUR', symbol: '€', spaced: false, decimals: 2 },
      GBP: { code: 'GBP', symbol: '£', spaced: false, decimals: 2 },
      IQD: { code: 'IQD', symbol: 'IQD', spaced: true, decimals: 0 }
    };
    return table[code] || { code: code, symbol: code, spaced: true, decimals: 2 };
  }

  function fmtMoney(n, currencyRaw) {
    const meta = parseCurrencyMeta(currencyRaw || getSelectedCurrency());
    const num = parseFloat(n);
    const value = isNaN(num) ? 0 : num;
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals
    });
    return meta.spaced ? (formatted + ' ' + meta.symbol) : (formatted + meta.symbol);
  }

  function currencyHeaderLabel() {
    const meta = parseCurrencyMeta(getSelectedCurrency());
    return meta.symbol === meta.code ? meta.code : meta.symbol;
  }

  function applyCurrencyToHeaders() {
    if (state.unlocked) return;
    const unitEl = document.querySelector('[data-locktext="table_unit_price"]');
    const amtEl = document.querySelector('[data-locktext="table_amount"]');
    const tag = currencyHeaderLabel();
    if (unitEl) {
      const base = (state.staticTexts.table_unit_price || unitEl.textContent || 'سعر الوحدة').replace(/\s*\([^)]*\)\s*$/, '').trim();
      unitEl.textContent = base + ' (' + tag + ')';
    }
    if (amtEl) {
      const base = (state.staticTexts.table_amount || amtEl.textContent || 'المبلغ').replace(/\s*\([^)]*\)\s*$/, '').trim();
      amtEl.textContent = base + ' (' + tag + ')';
    }
  }

  async function apiFetch(url, options = {}) {
    options.headers = Object.assign({}, options.headers, {
      'Content-Type': 'application/json',
      'x-license-key': state.licenseKey
    });
    if (options.body && typeof options.body !== 'string') options.body = JSON.stringify(options.body);
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      showSplash(data.error || 'انتهت صلاحية الجلسة. الرجاء إعادة التفعيل.');
      throw new Error(data.error || 'unauthorized');
    }
    return res;
  }

  // ============ شاشة التفعيل ============
  function showSplash(msg) {
    $('#appShell').classList.add('hidden');
    $('#splashScreen').classList.remove('hidden');
    localStorage.removeItem(LS_KEY);
    state.licenseKey = '';
    if (msg) {
      const err = $('#actError');
      err.textContent = msg;
      err.classList.add('show');
    }
  }

  function showApp() {
    $('#splashScreen').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
  }

  async function tryAutoLogin() {
    if (!state.licenseKey) return;
    try {
      const res = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: state.licenseKey })
      });
      const data = await res.json();
      if (data.ok) {
        showApp();
        setLicenseChip(data.expires_at, data.duration_type);
        await loadAllAppData();
      } else {
        showSplash(data.error);
      }
    } catch (e) {
      showSplash('تعذر الاتصال بالخادم.');
    }
  }

  function setLicenseChip(expires_at, duration_type) {
    if (!expires_at) {
      $('#licenseChip').textContent = 'ترخيص مؤبد ✓';
    } else {
      const d = new Date(expires_at);
      $('#licenseChip').textContent = 'صالح حتى: ' + d.toLocaleDateString('ar-EG');
    }
  }

  $('#activateBtn').addEventListener('click', activate);
  $('#licenseKeyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });

  async function activate() {
    const key = $('#licenseKeyInput').value.trim();
    const err = $('#actError'), ok = $('#actSuccess');
    err.classList.remove('show'); ok.classList.remove('show');
    if (!key) { err.textContent = 'الرجاء إدخال مفتاح التفعيل.'; err.classList.add('show'); return; }
    $('#activateBtn').disabled = true;
    try {
      const res = await fetch('/api/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        err.textContent = data.error || 'تعذر التفعيل.';
        err.classList.add('show');
        return;
      }
      state.licenseKey = data.key;
      localStorage.setItem(LS_KEY, data.key);
      ok.textContent = 'تم التفعيل بنجاح، جاري الدخول...';
      ok.classList.add('show');
      setTimeout(async () => {
        showApp();
        setLicenseChip(data.expires_at, data.duration_type);
        await loadAllAppData();
      }, 500);
    } catch (e) {
      err.textContent = 'تعذر الاتصال بالخادم.';
      err.classList.add('show');
    } finally {
      $('#activateBtn').disabled = false;
    }
  }

  $('#logoutBtn').addEventListener('click', () => {
    showSplash();
    $('#actError').classList.remove('show');
  });

  // إعادة التحقق الدوري (كل 5 دقائق) لتفعيل الإيقاف الفوري من الإدارة
  setInterval(async () => {
    if (!state.licenseKey) return;
    try {
      const res = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: state.licenseKey })
      });
      const data = await res.json();
      if (!data.ok) showSplash(data.error);
    } catch (e) { /* تجاهل أخطاء الشبكة المؤقتة */ }
  }, 5 * 60 * 1000);

  // ============ التبويبات ============
  $all('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $all('.tab-btn').forEach(b => b.classList.remove('active'));
      $all('.page').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      $('#' + btn.dataset.tab).classList.remove('hidden');
      if (btn.dataset.tab === 'recordsTab') loadRecords();
      if (btn.dataset.tab === 'lawyersTab') loadLawyersAndLists();
      if (btn.dataset.tab === 'companyTab') loadCompanyForm();
    });
  });

  // ============ تحميل بيانات التطبيق ============
  async function loadAllAppData() {
    await Promise.all([loadStaticTexts(), loadCompany(), loadFields()]);
    await startNewInvoice();
  }

  async function loadStaticTexts() {
    const res = await apiFetch('/api/static-texts');
    state.staticTexts = await res.json();
    $all('[data-locktext]').forEach(el => {
      const key = el.dataset.locktext;
      if (state.staticTexts[key] !== undefined) el.textContent = state.staticTexts[key];
    });
    renderNotes();
    applyCurrencyToHeaders();
  }

  function renderNotes() {
    const raw = state.staticTexts['notes_default'] || '';
    const list = $('#notesList');
    list.innerHTML = '';
    raw.split('\n').filter(l => l.trim()).forEach(line => {
      const li = document.createElement('li');
      li.textContent = line.trim();
      list.appendChild(li);
    });
  }

  async function loadCompany() {
    const res = await apiFetch('/api/company');
    state.company = await res.json();
    renderCompanyInHeader();
  }

  function renderCompanyInHeader() {
    const c = state.company;
    $('#companyNameAr').textContent = c.name_ar || 'اسم الشركة';
    $('#companyNameCenter').textContent = c.name_ar || 'اسم الشركة';
    $('#companyNameEn').textContent = c.name_en || '';
    $('#companyTaglineEn').textContent = c.tagline_en || '';
    $('#companyTaglineAr').textContent = c.tagline_ar || '';
    $('#companyTaglineCenter').textContent = c.tagline_ar || '';
    const logo = c.logo_path ? c.logo_path : '/assets/logo.png';
    $('#companyLogoImg').src = logo;
    $('#footerPhone').textContent = c.phone || '—';
    $('#footerEmail').textContent = c.email || '—';
    $('#footerAddress').textContent = c.address || '—';
  }

  function companyEditableEls() {
    return $all('[data-company]').filter(el => el.id !== 'companyNameCenter' && el.id !== 'companyTaglineCenter');
  }

  async function loadFields() {
    const res = await apiFetch('/api/fields');
    state.fields = await res.json();
    renderDynamicField('subject', $('#subjectFieldWrap'), 'f_subject');
    renderDynamicField('court', $('#courtFieldWrap'), 'f_court');
    renderDynamicField('payment_method', $('#paymentMethodWrap'), 'f_payment_method');
    renderCurrencyField();
    renderLawyerField();
  }

  // ============ حقل ديناميكي عام (إدخال حر / قائمة) ============
  function renderDynamicField(fieldKey, wrapEl, inputId, currentValue) {
    const cfg = state.fields[fieldKey] || { mode: 'free', items: [] };
    wrapEl.innerHTML = '';
    let inputEl;
    if (cfg.mode === 'dropdown') {
      inputEl = document.createElement('select');
      inputEl.className = 'field-input';
      inputEl.id = inputId;
      const blank = document.createElement('option');
      blank.value = ''; blank.textContent = '— اختر —';
      inputEl.appendChild(blank);
      (cfg.items || []).forEach(it => {
        const o = document.createElement('option');
        o.value = it.value; o.textContent = it.value;
        inputEl.appendChild(o);
      });
      if (currentValue) inputEl.value = currentValue;
    } else {
      inputEl = document.createElement('input');
      inputEl.className = 'field-input';
      inputEl.id = inputId;
      inputEl.placeholder = '—';
      if (currentValue) inputEl.value = currentValue;
    }
    wrapEl.appendChild(inputEl);

    const addBtn = document.createElement('button');
    addBtn.className = 'list-btn';
    addBtn.type = 'button';
    addBtn.title = 'إضافة عنصر جديد للقائمة';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', async () => {
      const val = prompt('أدخل القيمة الجديدة لتُضاف إلى قائمة هذا الحقل:');
      if (!val || !val.trim()) return;
      await apiFetch('/api/fields/' + fieldKey + '/items', { method: 'POST', body: { value: val.trim() } });
      await loadFields();
      toast('تمت الإضافة إلى القائمة', 'success');
    });
    wrapEl.appendChild(addBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-mode-btn';
    toggleBtn.type = 'button';
    toggleBtn.textContent = cfg.mode === 'dropdown' ? 'إدخال حر' : 'اختيار من قائمة';
    toggleBtn.addEventListener('click', async () => {
      const newMode = cfg.mode === 'dropdown' ? 'free' : 'dropdown';
      const keepVal = inputEl.value;
      await apiFetch('/api/fields/' + fieldKey + '/mode', { method: 'PUT', body: { mode: newMode, multi_select: false } });
      await loadFields();
      const el = document.getElementById(inputId);
      if (el) el.value = keepVal;
    });
    wrapEl.appendChild(toggleBtn);
  }

  function renderCurrencyField(currentValue) {
    const wrap = $('#currencyFieldWrap');
    wrap.innerHTML = '';
    const cfg = state.fields['currency'] || { items: [] };
    const sel = document.createElement('select');
    sel.className = 'field-input';
    sel.id = 'f_currency';
    (cfg.items && cfg.items.length ? cfg.items : [{ value: 'USD - دولار أمريكي' }]).forEach(it => {
      const o = document.createElement('option');
      o.value = it.value; o.textContent = it.value;
      sel.appendChild(o);
    });
    if (currentValue) sel.value = currentValue;
    sel.addEventListener('change', () => {
      applyCurrencyToHeaders();
      recalcTotals();
    });
    wrap.appendChild(sel);
    applyCurrencyToHeaders();
  }

  // ============ حقل المحامي المسؤول (اختيار من متعدد) ============
  function renderLawyerField() {
    const wrap = $('#lawyerFieldWrap');
    wrap.innerHTML = '';
    const display = document.createElement('input');
    display.className = 'field-input';
    display.id = 'f_lawyer_display';
    display.readOnly = true;
    display.placeholder = 'اضغط لاختيار محامٍ / أكثر';
    display.style.cursor = 'pointer';
    display.value = state.selectedLawyers.join('، ');
    display.addEventListener('click', () => openLawyerModal());
    wrap.appendChild(display);

    const addBtn = document.createElement('button');
    addBtn.className = 'list-btn';
    addBtn.type = 'button';
    addBtn.title = 'إضافة محامٍ جديد';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', async () => {
      const val = prompt('أدخل اسم المحامي الجديد:');
      if (!val || !val.trim()) return;
      await apiFetch('/api/fields/lawyer/items', { method: 'POST', body: { value: val.trim() } });
      await loadFields();
      toast('تمت إضافة المحامي', 'success');
    });
    wrap.appendChild(addBtn);
  }

  function openLawyerModal() {
    const cfg = state.fields['lawyer'] || { items: [] };
    if (!cfg.items || cfg.items.length === 0) {
      toast('لا توجد أسماء محامين مضافة بعد. استخدم زر (+) للإضافة.', 'error');
      return;
    }
    state.multiModalField = 'lawyer';
    $('#multiSelectTitle').textContent = 'اختيار المحامي / المحامين المسؤولين';
    const list = $('#multiSelectList');
    list.innerHTML = '';
    cfg.items.forEach(it => {
      const row = document.createElement('label');
      row.className = 'modal-list-item';
      row.innerHTML = `<span>${it.value}</span>`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = it.value;
      cb.checked = state.selectedLawyers.includes(it.value);
      row.prepend(cb);
      list.appendChild(row);
    });
    $('#multiSelectModal').classList.remove('hidden');
  }

  $('#multiSelectCancel').addEventListener('click', () => $('#multiSelectModal').classList.add('hidden'));
  $('#multiSelectConfirm').addEventListener('click', () => {
    const checked = $all('#multiSelectList input[type=checkbox]:checked').map(cb => cb.value);
    state.selectedLawyers = checked;
    $('#f_lawyer_display').value = checked.join('، ');
    $('#multiSelectModal').classList.add('hidden');
  });

  // ============ قفل / فتح تحرير جميع نصوص الفاتورة ============
  function setSheetEditable(on) {
    $all('[data-locktext]').forEach(el => { el.contentEditable = on ? 'true' : 'false'; });
    companyEditableEls().forEach(el => { el.contentEditable = on ? 'true' : 'false'; });
    const notes = $('#notesList');
    if (notes) notes.contentEditable = on ? 'true' : 'false';
  }

  $('#lockToggle').addEventListener('click', async () => {
    const sheet = $('#invoiceSheet');
    if (!state.unlocked) {
      state.unlocked = true;
      sheet.classList.add('unlock-mode');
      setSheetEditable(true);
      $('#lockToggle').classList.add('unlocked');
      $('#lockLabel').textContent = 'وضع التحرير مفتوح — اضغط للحفظ والقفل';
      toast('تم فتح قفل التحرير، يمكنك الآن تعديل جميع نصوص الفاتورة', 'success');
    } else {
      const updates = {};
      $all('[data-locktext]').forEach(el => {
        updates[el.dataset.locktext] = el.textContent.trim();
      });
      if (updates.table_unit_price) updates.table_unit_price = updates.table_unit_price.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (updates.table_amount) updates.table_amount = updates.table_amount.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const notesText = ($('#notesList').innerText || '').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
      updates.notes_default = notesText;
      const companyPayload = {
        name_ar: $('#companyNameAr').textContent.trim(),
        name_en: $('#companyNameEn').textContent.trim(),
        tagline_ar: $('#companyTaglineAr').textContent.trim(),
        tagline_en: $('#companyTaglineEn').textContent.trim(),
        phone: $('#footerPhone').textContent.trim() === '—' ? '' : $('#footerPhone').textContent.trim(),
        email: $('#footerEmail').textContent.trim() === '—' ? '' : $('#footerEmail').textContent.trim(),
        address: $('#footerAddress').textContent.trim() === '—' ? '' : $('#footerAddress').textContent.trim(),
        website: state.company.website || ''
      };
      try {
        await apiFetch('/api/static-texts', { method: 'PUT', body: updates });
        await apiFetch('/api/company', { method: 'PUT', body: companyPayload });
        state.staticTexts = Object.assign({}, state.staticTexts, updates);
        setSheetEditable(false);
        await loadCompany();
        renderNotes();
        applyCurrencyToHeaders();
        toast('تم حفظ التعديلات وإغلاق القفل', 'success');
      } catch (e) { toast('تعذر حفظ التعديلات', 'error'); }
      state.unlocked = false;
      sheet.classList.remove('unlock-mode');
      $('#lockToggle').classList.remove('unlocked');
      $('#lockLabel').textContent = 'النصوص مقفلة';
    }
  });

  // ============ جدول بنود الفاتورة ============
  function addItemRow(item) {
    item = item || { service: '', unit_price: '', qty: 1, amount: '', note: '' };
    const id = 'row_' + Math.random().toString(36).slice(2, 9);
    state.items.push(Object.assign({ id }, item));
    renderItemsTable();
  }

  function renderItemsTable() {
    const tbody = $('#itemsTbody');
    tbody.innerHTML = '';
    state.items.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td class="service-col"><input data-field="service" value="${escapeHtml(row.service)}" placeholder="بيان الخدمة"></td>
        <td><input data-field="unit_price" value="${escapeHtml(row.unit_price)}" placeholder="السعر أو مشمول"></td>
        <td><input data-field="qty" value="${escapeHtml(row.qty)}" style="text-align:center;"></td>
        <td><input data-field="amount" value="${escapeHtml(row.amount)}" placeholder="—"></td>
        <td><input data-field="note" value="${escapeHtml(row.note)}" placeholder="—"></td>
        <td><button class="row-remove" title="حذف البند">✕</button></td>
      `;
      tr.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => {
          row[inp.dataset.field] = inp.value;
          if (inp.dataset.field === 'qty' || inp.dataset.field === 'unit_price') maybeAutoAmount(row);
          recalcTotals();
        });
        inp.addEventListener('blur', () => renderItemsTable());
      });
      tr.querySelector('.row-remove').addEventListener('click', () => {
        state.items.splice(idx, 1);
        renderItemsTable();
        recalcTotals();
      });
      tbody.appendChild(tr);
    });
  }

  function maybeAutoAmount(row) {
    const qty = parseFloat(row.qty);
    const unit = parseFloat(row.unit_price);
    if (!isNaN(qty) && !isNaN(unit) && (row.amount === '' || row.amount === undefined)) {
      row.amount = (qty * unit).toString();
    }
  }

  function escapeHtml(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  $('#addRowBtn').addEventListener('click', () => addItemRow());

  function recalcTotals() {
    let subtotal = 0;
    state.items.forEach(r => {
      const amt = parseFloat(r.amount);
      if (!isNaN(amt)) subtotal += amt;
    });
    const feesExp = parseFloat($('#f_fees_expenses').value) || 0;
    const discount = parseFloat($('#f_discount').value) || 0;
    const totalDue = Math.max(subtotal + feesExp - discount, 0);
    const paid = parseFloat($('#f_paid_amount').value) || 0;
    const remaining = Math.max(totalDue - paid, 0);

    $('#subtotalAmount').textContent = fmtMoney(subtotal);
    $('#sumFeesTotal').textContent = fmtMoney(subtotal);
    $('#sumTotalDue').textContent = fmtMoney(totalDue);
    $('#sumPaid').textContent = fmtMoney(paid);
    $('#sumRemaining').textContent = fmtMoney(remaining);
    $('#statusTotalDue').textContent = fmtMoney(totalDue);
    $('#statusRemaining').textContent = fmtMoney(remaining);
    $('#statusDueDate').textContent = $('#f_due_date').value || '—';

    let statusText = 'غير مسددة', cls = 'unpaid';
    if (totalDue > 0 && remaining <= 0) { statusText = 'مسددة'; cls = 'paid'; }
    else if (paid > 0) { statusText = 'مسددة جزئياً'; cls = 'partial'; }
    $('#statusDisplay').innerHTML = `<span class="status-badge ${cls}">${statusText}</span>`;
  }

  ['f_fees_expenses', 'f_discount', 'f_paid_amount', 'f_due_date'].forEach(id => {
    document.addEventListener('input', (e) => { if (e.target && e.target.id === id) recalcTotals(); });
  });

  // ============ فاتورة جديدة / حفظ ============
  async function startNewInvoice() {
    state.editingInvoiceId = null;
    $('#editingBadge').classList.add('hidden');
    const res = await apiFetch('/api/invoices/defaults/new');
    const def = await res.json();
    $('#f_invoice_number').value = def.invoice_number;
    $('#f_issue_date').value = def.issue_date;
    const due = new Date(def.issue_date);
    due.setDate(due.getDate() + 30);
    $('#f_due_date').value = due.toISOString().slice(0, 10);
    $('#f_client_name').value = '';
    $('#f_file_ref').value = '';
    $('#f_address').value = '';
    $('#f_paid_amount').value = '0';
    $('#f_fees_expenses').value = '0';
    $('#f_discount').value = '0';
    $('#f_transfer_details').value = '';
    state.selectedLawyers = [];
    renderDynamicField('subject', $('#subjectFieldWrap'), 'f_subject', '');
    renderDynamicField('court', $('#courtFieldWrap'), 'f_court', '');
    renderDynamicField('payment_method', $('#paymentMethodWrap'), 'f_payment_method', '');
    renderCurrencyField();
    renderLawyerField();
    state.items = [];
    addItemRow({ service: '', unit_price: '', qty: 1, amount: '', note: '' });
    recalcTotals();
  }

  $('#newInvoiceBtn').addEventListener('click', startNewInvoice);

  function gatherInvoicePayload() {
    return {
      invoice_number: $('#f_invoice_number').value.trim(),
      issue_date: $('#f_issue_date').value,
      due_date: $('#f_due_date').value,
      currency: document.getElementById('f_currency') ? document.getElementById('f_currency').value : 'USD',
      client_name: $('#f_client_name').value,
      subject: document.getElementById('f_subject') ? document.getElementById('f_subject').value : '',
      lawyers: state.selectedLawyers,
      file_ref: $('#f_file_ref').value,
      court: document.getElementById('f_court') ? document.getElementById('f_court').value : '',
      client_address: $('#f_address').value,
      items: state.items,
      discount: $('#f_discount').value,
      fees_expenses: $('#f_fees_expenses').value,
      paid_amount: $('#f_paid_amount').value,
      payment_method: document.getElementById('f_payment_method') ? document.getElementById('f_payment_method').value : '',
      transfer_details: $('#f_transfer_details').value,
      notes: state.staticTexts['notes_default'] || ''
    };
  }

  $('#saveInvoiceBtn').addEventListener('click', async () => {
    const payload = gatherInvoicePayload();
    if (!payload.invoice_number) { toast('الرجاء إدخال رقم الفاتورة', 'error'); return; }
    if (!payload.client_name.trim()) { toast('الرجاء إدخال اسم العميل', 'error'); return; }
    try {
      let res;
      if (state.editingInvoiceId) {
        res = await apiFetch('/api/invoices/' + state.editingInvoiceId, { method: 'PUT', body: payload });
      } else {
        res = await apiFetch('/api/invoices', { method: 'POST', body: payload });
      }
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'تعذر الحفظ', 'error'); return; }
      if (!state.editingInvoiceId) state.editingInvoiceId = data.id;
      $('#editingBadge').textContent = 'تحرير: ' + payload.invoice_number;
      $('#editingBadge').classList.remove('hidden');
      toast('تم حفظ الفاتورة بنجاح', 'success');
    } catch (e) { /* تمت معالجتها في apiFetch */ }
  });

  // ============ سجل الفواتير ============
  async function loadRecords() {
    const res = await apiFetch('/api/invoices');
    const rows = await res.json();
    const tbody = $('#recordsTbody');
    tbody.innerHTML = '';
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:#a08a5c;">لا توجد فواتير محفوظة بعد.</td></tr>';
      return;
    }
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.invoice_number)}</td>
        <td>${escapeHtml(r.issue_date)}</td>
        <td>${escapeHtml(r.client_name)}</td>
        <td>${fmtMoney(r.total_due, r.currency)}</td>
        <td>${fmtMoney(r.remaining, r.currency)}</td>
        <td>${escapeHtml(r.invoice_status)}</td>
        <td>
          <button class="btn btn-outline btn-sm" data-open="${r.id}">فتح</button>
          <button class="btn btn-danger btn-sm" data-del="${r.id}">حذف</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openInvoice(b.dataset.open)));
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => deleteInvoice(b.dataset.del)));
  }

  async function openInvoice(id) {
    const res = await apiFetch('/api/invoices/' + id);
    const inv = await res.json();
    state.editingInvoiceId = inv.id;
    $('#editingBadge').textContent = 'تحرير: ' + inv.invoice_number;
    $('#editingBadge').classList.remove('hidden');
    $('#f_invoice_number').value = inv.invoice_number;
    $('#f_issue_date').value = inv.issue_date;
    $('#f_due_date').value = inv.due_date || '';
    $('#f_client_name').value = inv.client_name || '';
    $('#f_file_ref').value = inv.file_ref || '';
    $('#f_address').value = inv.client_address || '';
    $('#f_paid_amount').value = inv.paid_amount || 0;
    $('#f_fees_expenses').value = inv.fees_expenses || 0;
    $('#f_discount').value = inv.discount || 0;
    $('#f_transfer_details').value = inv.transfer_details || '';
    state.selectedLawyers = inv.lawyers || [];
    renderDynamicField('subject', $('#subjectFieldWrap'), 'f_subject', inv.subject);
    renderDynamicField('court', $('#courtFieldWrap'), 'f_court', inv.court);
    renderDynamicField('payment_method', $('#paymentMethodWrap'), 'f_payment_method', inv.payment_method);
    renderCurrencyField(inv.currency);
    renderLawyerField();
    state.items = (inv.items_json || []).map(it => Object.assign({ id: 'row_' + Math.random().toString(36).slice(2, 9) }, it));
    if (state.items.length === 0) state.items.push({ id: 'row_init', service: '', unit_price: '', qty: 1, amount: '', note: '' });
    renderItemsTable();
    recalcTotals();
    $all('.tab-btn').forEach(b => b.classList.remove('active'));
    $all('.page').forEach(p => p.classList.add('hidden'));
    document.querySelector('[data-tab=invoiceTab]').classList.add('active');
    $('#invoiceTab').classList.remove('hidden');
  }

  async function deleteInvoice(id) {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return;
    await apiFetch('/api/invoices/' + id, { method: 'DELETE' });
    toast('تم حذف الفاتورة', 'success');
    loadRecords();
  }

  // ============ المحامون والقوائم ============
  async function loadLawyersAndLists() {
    await loadFields();
    const cfg = state.fields['lawyer'] || { items: [] };
    const tbody = $('#lawyersTbody');
    tbody.innerHTML = '';
    (cfg.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(it.value)}</td><td><button class="btn btn-danger btn-sm" data-del="${it.id}">حذف</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      await apiFetch('/api/fields/lawyer/items/' + b.dataset.del, { method: 'DELETE' });
      loadLawyersAndLists();
    }));
    renderListItemsTable();
  }

  $('#addLawyerBtn').addEventListener('click', async () => {
    const val = $('#newLawyerInput').value.trim();
    if (!val) return;
    await apiFetch('/api/fields/lawyer/items', { method: 'POST', body: { value: val } });
    $('#newLawyerInput').value = '';
    loadLawyersAndLists();
    toast('تمت الإضافة', 'success');
  });

  function renderListItemsTable() {
    const key = $('#fieldSelector').value;
    const cfg = state.fields[key] || { items: [] };
    const tbody = $('#listItemsTbody');
    tbody.innerHTML = '';
    (cfg.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(it.value)}</td><td><button class="btn btn-danger btn-sm" data-del="${it.id}">حذف</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      await apiFetch('/api/fields/' + key + '/items/' + b.dataset.del, { method: 'DELETE' });
      await loadFields();
      renderListItemsTable();
    }));
  }
  $('#fieldSelector').addEventListener('change', renderListItemsTable);
  $('#addListItemBtn').addEventListener('click', async () => {
    const key = $('#fieldSelector').value;
    const val = $('#newListItemInput').value.trim();
    if (!val) return;
    await apiFetch('/api/fields/' + key + '/items', { method: 'POST', body: { value: val } });
    $('#newListItemInput').value = '';
    await loadFields();
    renderListItemsTable();
    toast('تمت الإضافة إلى القائمة', 'success');
  });

  // ============ إعدادات الشركة ============
  async function loadCompanyForm() {
    const res = await apiFetch('/api/company');
    const c = await res.json();
    $('#c_name_ar').value = c.name_ar || '';
    $('#c_name_en').value = c.name_en || '';
    $('#c_tagline_ar').value = c.tagline_ar || '';
    $('#c_tagline_en').value = c.tagline_en || '';
    $('#c_phone').value = c.phone || '';
    $('#c_email').value = c.email || '';
    $('#c_address').value = c.address || '';
    $('#c_website').value = c.website || '';
    $('#logoPreview').src = c.logo_path || '/assets/logo.png';
  }

  $('#saveCompanyBtn').addEventListener('click', async () => {
    const payload = {
      name_ar: $('#c_name_ar').value, name_en: $('#c_name_en').value,
      tagline_ar: $('#c_tagline_ar').value, tagline_en: $('#c_tagline_en').value,
      phone: $('#c_phone').value, email: $('#c_email').value,
      address: $('#c_address').value, website: $('#c_website').value
    };
    await apiFetch('/api/company', { method: 'PUT', body: payload });
    await loadCompany();
    toast('تم حفظ بيانات الشركة', 'success');
  });

  $('#logoUploadInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    const res = await fetch('/api/company/logo', {
      method: 'POST', headers: { 'x-license-key': state.licenseKey }, body: fd
    });
    const data = await res.json();
    if (data.ok) {
      $('#logoPreview').src = data.logo_path;
      await loadCompany();
      toast('تم تحديث الشعار', 'success');
    } else {
      toast(data.error || 'تعذر رفع الشعار', 'error');
    }
  });

  // ============ الطباعة ============
  function syncPrintMeta() {
    const logo = $('#companyLogoImg');
    const pchLogo = $('#pchLogo');
    if (logo && pchLogo) pchLogo.src = logo.src;
    $('#pchCompany').textContent = $('#companyNameAr').textContent || '';
    const titleEl = document.querySelector('[data-locktext="doc_title_ar"]');
    $('#pchTitle').textContent = titleEl ? titleEl.textContent : '';
    $('#pchRef').textContent = $('#f_invoice_number').value || '—';
    $('#pchFile').textContent = $('#f_file_ref').value || '—';
    $('#pchClient').textContent = $('#f_client_name').value || '—';

    const layer = $('#printPageNumbers');
    layer.innerHTML = '';
    const sheet = $('#invoiceSheet');
    const mm = 96 / 25.4;
    const pageContentMm = 273;
    const heightPx = Math.max(sheet.scrollHeight, sheet.offsetHeight);
    const pages = Math.max(1, Math.ceil(heightPx / (pageContentMm * mm)));
    const contEl = document.querySelector('[data-locktext="continue_label"]');
    const cont = (contEl && contEl.textContent.trim()) || state.staticTexts.continue_label || 'تتمة الفاتورة';
    document.body.classList.toggle('single-print-page', pages <= 1);
    document.body.classList.toggle('multi-print-page', pages > 1);
    const ref = $('#f_invoice_number').value || '—';
    for (let i = 1; i <= pages; i++) {
      const d = document.createElement('div');
      d.className = 'print-pn';
      const pageTxt = `صفحة ${i} من ${pages}`;
      if (i === 1) {
        d.innerHTML = `<span></span><span>${pageTxt}</span>`;
      } else {
        d.innerHTML = `<span>${escapeHtml(cont)} — الرقم المرجعي: ${escapeHtml(ref)}</span><span>${pageTxt}</span>`;
      }
      layer.appendChild(d);
    }
  }

  window.addEventListener('afterprint', () => {
    document.body.classList.remove('single-print-page', 'multi-print-page');
  });

  function handlePrint() {
    syncPrintMeta();
    window.print();
  }
  $('#printBtn').addEventListener('click', handlePrint);
  window.addEventListener('beforeprint', syncPrintMeta);

  // ============ بدء التشغيل ============
  tryAutoLogin();
})();
