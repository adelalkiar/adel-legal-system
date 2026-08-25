// لوحة تحكم العادل — إدارة مفاتيح التفعيل — برمجة عادل العراقي
(function () {
  'use strict';
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  function toast(msg, type) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => { t.className = 'toast'; }, 2800);
  }

  async function api(url, options = {}) {
    options.headers = Object.assign({}, options.headers, { 'Content-Type': 'application/json' });
    if (options.body && typeof options.body !== 'string') options.body = JSON.stringify(options.body);
    options.credentials = 'same-origin';
    const res = await fetch(url, options);
    return res;
  }

  async function checkSession() {
    const res = await api('/api/admin/session');
    const data = await res.json();
    if (data.isAdmin) showAdmin(); else showLogin();
  }

  function showLogin() {
    $('#loginWrap').style.display = 'flex';
    $('#adminShell').style.display = 'none';
  }
  function showAdmin() {
    $('#loginWrap').style.display = 'none';
    $('#adminShell').style.display = 'block';
    loadLicenses();
  }

  $('#adminLoginBtn').addEventListener('click', login);
  $('#adminPassInput').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  async function login() {
    const password = $('#adminPassInput').value;
    const err = $('#loginError');
    err.classList.remove('show');
    const res = await api('/api/admin/login', { method: 'POST', body: { password } });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.error || 'فشل تسجيل الدخول';
      err.classList.add('show');
      return;
    }
    showAdmin();
  }

  $('#adminLogoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
  });

  $('#durationType').addEventListener('change', () => {
    $('#daysGroup').style.display = $('#durationType').value === 'days' ? 'flex' : 'none';
  });

  $('#generateBtn').addEventListener('click', async () => {
    const duration_type = $('#durationType').value;
    const duration_value = $('#daysValue').value;
    const count = $('#countValue').value;
    const note = $('#noteValue').value;
    const res = await api('/api/admin/licenses/generate', {
      method: 'POST', body: { duration_type, duration_value, count, note }
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'تعذر التوليد', 'error'); return; }
    const box = $('#generatedBox');
    box.classList.remove('hidden');
    box.innerHTML = '<strong>تم توليد المفاتيح التالية:</strong>' +
      data.licenses.map(l => `<div class="key-generated-box">${l.license_key}</div>`).join('');
    toast('تم توليد ' + data.licenses.length + ' مفتاح بنجاح', 'success');
    loadLicenses();
  });

  async function loadLicenses() {
    const res = await api('/api/admin/licenses');
    const rows = await res.json();
    $('#statTotal').textContent = rows.length;
    $('#statActive').textContent = rows.filter(r => r.status === 'active').length;
    $('#statRevoked').textContent = rows.filter(r => r.status === 'revoked').length;
    $('#statExpired').textContent = rows.filter(r => r.status === 'expired').length;

    const durLabels = { days: 'أيام', week: 'أسبوع', month: 'شهر', year: 'سنة', lifetime: 'مؤبد' };
    const statusLabels = { active: 'فعّال', revoked: 'موقوف', expired: 'منتهي' };

    const tbody = $('#licensesTbody');
    tbody.innerHTML = '';
    rows.forEach(r => {
      const durText = r.duration_type === 'days' ? (r.duration_value + ' يوم') : durLabels[r.duration_type];
      const expText = r.expires_at ? new Date(r.expires_at).toLocaleDateString('ar-EG') : 'بدون انتهاء';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace;direction:ltr;">${r.license_key}</td>
        <td>${durText}</td>
        <td>${new Date(r.created_at).toLocaleDateString('ar-EG')}</td>
        <td>${expText}</td>
        <td><span class="status-pill ${r.status}">${statusLabels[r.status]}</span></td>
        <td>${r.note ? escapeHtml(r.note) : '—'}</td>
        <td>
          ${r.status === 'active' ? `<button class="btn btn-danger btn-sm" data-revoke="${r.id}">إيقاف</button>` : ''}
          ${r.status === 'revoked' ? `<button class="btn btn-outline btn-sm" data-reactivate="${r.id}">تفعيل مجدداً</button>` : ''}
          <button class="btn btn-outline btn-sm" data-del="${r.id}">حذف</button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('هل أنت متأكد من إيقاف هذا التفعيل؟ سيتوقف عمل البرنامج لدى المستخدم فوراً.')) return;
      await api('/api/admin/licenses/' + b.dataset.revoke + '/revoke', { method: 'POST' });
      toast('تم إيقاف المفتاح', 'success');
      loadLicenses();
    }));
    tbody.querySelectorAll('[data-reactivate]').forEach(b => b.addEventListener('click', async () => {
      const res = await api('/api/admin/licenses/' + b.dataset.reactivate + '/reactivate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast(data.error, 'error'); return; }
      toast('تمت إعادة التفعيل', 'success');
      loadLicenses();
    }));
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('حذف المفتاح نهائياً؟ لا يمكن التراجع.')) return;
      await api('/api/admin/licenses/' + b.dataset.del, { method: 'DELETE' });
      loadLicenses();
    }));
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  $('#changePassBtn').addEventListener('click', async () => {
    const current_password = $('#curPass').value;
    const new_password = $('#newPass').value;
    const res = await api('/api/admin/change-password', { method: 'POST', body: { current_password, new_password } });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'تعذر التحديث', 'error'); return; }
    toast('تم تحديث كلمة المرور بنجاح', 'success');
    $('#curPass').value = ''; $('#newPass').value = '';
  });

  checkSession();
})();
