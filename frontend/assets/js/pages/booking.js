(function (MZ) {
  MZ.boot().then(function () {
    var ui = MZ.ui, api = MZ.api, me = MZ.me;
    var el = document.querySelector('[data-booking]');
    MZ.ui.mount('');

    function pid() {
      var h = (location.hash || '').match(/p-?(\d+)/);
      if (h) return +h[1];
      var q = new URLSearchParams(location.search).get('id');
      return q ? +q : null;
    }
    function fmt(h) { return new Intl.NumberFormat('en-US').format((h || 0) / 100) + ' ر.س'; }
    function showErr(m) { var e = el.querySelector('[data-err]'); if (e) { e.hidden = false; e.textContent = m; } }

    if (!me.isLoggedIn()) {
      el.innerHTML = '<div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h2>سجّل الدخول لإتمام الحجز</h2><p class="muted">تحتاج حساباً لمتابعة الحجز.</p><button class="btn btn--primary" data-login>تسجيل الدخول</button></div>';
      ui.loginModal(start);
      return;
    }
    start();

    function start() {
      var id = pid();
      if (!id) { el.innerHTML = '<div class="card">رقم العقار غير محدّد.</div>'; return; }
      el.innerHTML = '<div class="card">جارِ التحميل…</div>';
      Promise.all([api.getProperty(id), me.quote(id, 'deposit')])
        .then(function (res) { render(res[0], res[1]); })
        .catch(function (e) { el.innerHTML = '<div class="card">تعذّر: ' + e.message + '</div>'; });
    }

    function render(p, quote) {
      var ML = { moyasar: 'الدفع الإلكتروني', bank_transfer: 'تحويل بنكي', rize: 'تقسيط رايز' };
      var methods = quote.methods || [];
      el.innerHTML =
        '<div class="booking-grid" style="display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:start">' +
          '<div class="card"><h2>طريقة الدفع</h2>' +
            '<div style="display:flex;gap:10px;margin:12px 0;flex-wrap:wrap">' +
              '<label class="chip"><input type="radio" name="pt" value="deposit" checked> عربون ' + fmt(quote.depositAmount) + '</label>' +
              (quote.paymentTypes.indexOf('full') !== -1 ? '<label class="chip"><input type="radio" name="pt" value="full"> دفع كامل ' + fmt(quote.fullAmount) + '</label>' : '') +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px">' +
              methods.map(function (m, i) { return '<label class="method-card"><input type="radio" name="pm" value="' + m + '"' + (i === 0 ? ' checked' : '') + '> ' + (ML[m] || m) + '</label>'; }).join('') +
            '</div>' +
            (methods.length ? '' : '<p class="muted">لا توجد طرق دفع مفعّلة حالياً.</p>') +
            '<label style="display:flex;gap:8px;margin-top:14px"><input type="checkbox" data-terms> أوافق على شروط الحجز وسياسة الإلغاء</label>' +
            '<button class="btn btn--primary btn--block" data-confirm' + (methods.length ? '' : ' disabled') + ' style="margin-top:14px">تأكيد الحجز</button>' +
            '<p class="auth-err" data-err hidden></p>' +
          '</div>' +
          '<aside class="card"><h3>' + ui.esc(p.title) + '</h3><p class="muted">' + ui.esc((p.cityLabel || '') + ' · ' + (p.district || '')) + '</p>' +
            '<div style="font-size:22px;font-weight:700;color:var(--green);margin:8px 0">' + new Intl.NumberFormat('en-US').format(p.price || 0) + ' ر.س</div>' +
            '<div class="muted" data-due>المستحق الآن: ' + fmt(quote.amountDue) + '</div></aside>' +
        '</div>';

      var due = el.querySelector('[data-due]');
      el.querySelectorAll('[name=pt]').forEach(function (r) {
        r.addEventListener('change', function () { due.textContent = 'المستحق الآن: ' + fmt(r.value === 'full' ? quote.fullAmount : quote.depositAmount); });
      });
      var btn = el.querySelector('[data-confirm]');
      if (btn) btn.addEventListener('click', function () {
        if (!el.querySelector('[data-terms]').checked) { showErr('يجب الموافقة على الشروط'); return; }
        var pt = el.querySelector('[name=pt]:checked').value;
        var pm = (el.querySelector('[name=pm]:checked') || {}).value;
        if (!pm) { showErr('اختر طريقة دفع'); return; }
        btn.disabled = true;
        me.createBooking({ propertyId: p.id, paymentType: pt, paymentMethod: pm, termsVersion: quote.termsVersion, notes: '' })
          .then(function (r) { handleNext(r.nextAction, r.booking); })
          .catch(function (e) { btn.disabled = false; showErr(e.message); });
      });
    }

    function handleNext(next, booking) {
      if (!next) { location.href = '/account/booking.html#b-' + booking.id; return; }
      if (next.type === 'redirect') { location.href = next.url; return; }
      if (next.type === 'bank_transfer') { renderTransfer(next, booking); return; }
      el.innerHTML = '<div class="card">تم إنشاء الحجز ' + ui.esc(booking.number) + '. <a href="/account/booking.html#b-' + booking.id + '">متابعة</a></div>';
    }

    function renderTransfer(next, booking) {
      var accts = (next.accounts || []).map(function (a) {
        return '<div class="card" style="box-shadow:none"><b>' + ui.esc(a.bankName) + '</b><div class="muted">المستفيد: ' + ui.esc(a.beneficiaryName) + '</div><div dir="ltr">' + ui.esc(a.iban) + '</div></div>';
      }).join('');
      el.innerHTML = '<div class="card"><h2>تعليمات التحويل البنكي</h2>' +
        '<p>المبلغ: <b>' + fmt(next.amount) + '</b></p>' +
        '<p>مرجع التحويل (رقم الحجز): <b>' + ui.esc(next.reference) + '</b></p>' + accts +
        '<div>' + (next.instructionsHtml || '') + '</div>' +
        '<p class="muted">بعد التحويل، ارفع الإيصال من صفحة الحجز.</p>' +
        '<a class="btn btn--primary" href="/account/booking.html#b-' + booking.id + '">متابعة الحجز</a></div>';
    }
  });
})(window.MZ);
