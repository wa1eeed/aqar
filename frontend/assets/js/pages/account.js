(function (MZ) {
  MZ.boot().then(function () {
    var ui = MZ.ui, me = MZ.me;
    ui.mount('');
    var el = document.querySelector('[data-account]');
    if (!el) return;
    var page = el.getAttribute('data-account');

    function fmt(h) { return new Intl.NumberFormat('en-US').format((h || 0) / 100) + ' ر.س'; }
    var B_STATUS = { pending_payment: 'بانتظار الدفع', awaiting_transfer_review: 'مراجعة تحويل', confirmed: 'مؤكّد', completed: 'مكتمل', cancelled: 'ملغى', expired: 'منتهٍ', refunded: 'مسترد' };
    var V_STATUS = { requested: 'بانتظار التأكيد', confirmed: 'مؤكّدة', completed: 'تمّت', no_show: 'لم يحضر', cancelled: 'ملغاة' };

    if (!me.isLoggedIn()) {
      el.innerHTML = '<div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h2>سجّل الدخول للوصول إلى حسابك</h2><button class="btn btn--primary" data-login>تسجيل الدخول</button></div>';
      ui.loginModal(function () { location.reload(); });
      return;
    }

    if (page === 'index') renderIndex();
    else if (page === 'bookings') renderBookings();
    else if (page === 'viewings') renderViewings();
    else if (page === 'notifications') renderNotifications();
    else if (page === 'booking') renderBookingDetail();

    function renderIndex() {
      el.innerHTML = '<div class="card">جارِ التحميل…</div>';
      Promise.all([me.bookings(), me.viewings(), me.notifications(), me.favorites()]).then(function (r) {
        var cards = [
          { n: r[0].length, l: 'الحجوزات', href: '/account/bookings.html' },
          { n: r[1].length, l: 'المعاينات', href: '/account/viewings.html' },
          { n: (r[2].unread || 0), l: 'إشعارات غير مقروءة', href: '/account/notifications.html' },
          { n: r[3].length, l: 'المفضلة', href: '/favorites' }
        ];
        el.innerHTML = '<h1 style="margin:0 0 16px">مرحباً ' + ui.esc((MZ.auth.customer && MZ.auth.customer.name) || '') + '</h1>' +
          '<div class="grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">' +
          cards.map(function (c) { return '<a class="card" href="' + c.href + '" style="text-decoration:none"><div style="font-size:28px;font-weight:700;color:var(--green)">' + c.n + '</div><div class="muted">' + c.l + '</div></a>'; }).join('') + '</div>';
      }).catch(err);
    }

    function renderBookings() {
      el.innerHTML = '<div class="card">جارِ التحميل…</div>';
      me.bookings().then(function (list) {
        el.innerHTML = '<div class="card"><h1>حجوزاتي</h1>' + (list.length ? table(
          ['الرقم', 'العقار', 'المستحق', 'الحالة', ''],
          list.map(function (b) { return ['<span class="muted">' + ui.esc(b.number) + '</span>', ui.esc(b.property ? b.property.title : ''), fmt(b.amountDue), '<span class="pill">' + (B_STATUS[b.status] || b.status) + '</span>', '<a href="/account/booking.html#b-' + b.id + '">التفاصيل</a>']; })
        ) : '<div class="empty">لا توجد حجوزات.</div>') + '</div>';
      }).catch(err);
    }

    function renderViewings() {
      el.innerHTML = '<div class="card">جارِ التحميل…</div>';
      me.viewings().then(function (list) {
        el.innerHTML = '<div class="card"><h1>معايناتي</h1>' + (list.length ? table(
          ['العقار', 'الموعد', 'الحالة'],
          list.map(function (v) { return [ui.esc(v.property ? v.property.title : ''), new Date(v.scheduledAt).toLocaleString('en-GB'), '<span class="pill">' + (V_STATUS[v.status] || v.status) + '</span>']; })
        ) : '<div class="empty">لا توجد معاينات.</div>') + '</div>';
      }).catch(err);
    }

    function renderNotifications() {
      el.innerHTML = '<div class="card">جارِ التحميل…</div>';
      me.notifications().then(function (r) {
        el.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h1>الإشعارات</h1>' +
          (r.items.length ? '<button class="btn btn--ghost btn--sm" data-readall>تعليم الكل مقروء</button>' : '') + '</div>' +
          (r.items.length ? r.items.map(function (n) { return '<div class="card" style="box-shadow:none;' + (n.readAt ? '' : 'border-inline-start:3px solid var(--green)') + '"><b>' + ui.esc(n.title) + '</b><div class="muted" style="font-size:12px">' + new Date(n.createdAt).toLocaleString('en-GB') + '</div></div>'; }).join('') : '<div class="empty">لا توجد إشعارات.</div>') + '</div>';
        var r2 = el.querySelector('[data-readall]');
        if (r2) r2.addEventListener('click', function () { me.readNotifications().then(renderNotifications); });
      }).catch(err);
    }

    var subBooking = false;
    function renderBookingDetail() {
      var m = (location.hash || '').match(/b-([a-z0-9]+)/i);
      if (!m) { el.innerHTML = '<div class="card">الحجز غير محدّد.</div>'; return; }
      if (MZ.rt && !subBooking) { subBooking = true; MZ.rt.on('booking.updated', function () { renderBookingDetail(); }); }
      el.innerHTML = '<div class="card">جارِ التحميل…</div>';
      me.booking(m[1]).then(function (b) {
        var pay = (b.payments || [])[0];
        var html = '<div class="card"><h1>الحجز ' + ui.esc(b.number) + '</h1>' +
          '<p>العقار: <b>' + ui.esc(b.property ? b.property.title : '') + '</b></p>' +
          '<p>الحالة: <span class="pill">' + (B_STATUS[b.status] || b.status) + '</span></p>' +
          '<p>المستحق: <b>' + fmt(b.amountDue) + '</b> — المدفوع: <b>' + fmt(b.amountPaid) + '</b></p>';
        if (pay && b.status === 'pending_payment' && pay.method === 'moyasar') {
          html += '<button class="btn btn--primary" data-verify>تحقّق من الدفع</button>';
        }
        if (pay && pay.method === 'bank_transfer' && (b.status === 'pending_payment' || b.status === 'awaiting_transfer_review')) {
          html += transferForm();
        }
        html += '<p class="auth-err" data-err hidden></p></div>';
        el.innerHTML = html;
        bindDetail(b, pay);
      }).catch(err);
    }

    function transferForm() {
      return '<form data-transfer style="margin-top:14px;display:flex;flex-direction:column;gap:10px">' +
        '<h3>رفع إيصال التحويل</h3>' +
        '<input name="bankAccountId" placeholder="معرّف الحساب البنكي" required>' +
        '<input name="senderName" placeholder="اسم المُرسِل" required>' +
        '<input name="senderBank" placeholder="بنك المُرسِل" required>' +
        '<input name="amount" type="number" step="0.01" placeholder="المبلغ (ر.س)" required>' +
        '<input name="transferredAt" type="date" required>' +
        '<input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" required>' +
        '<button class="btn btn--primary" type="submit">إرسال الإيصال</button></form>';
    }

    function bindDetail(b, pay) {
      var v = el.querySelector('[data-verify]');
      if (v) v.addEventListener('click', function () { me.verifyPayment(pay.id).then(renderBookingDetail).catch(function (e) { showErr(e.message); }); });
      var f = el.querySelector('[data-transfer]');
      if (f) f.addEventListener('submit', function (e) {
        e.preventDefault();
        var file = f.receipt.files[0]; if (!file) return;
        me.presignTransfer(pay.id, file.type).then(function (pr) {
          return me.uploadFile(pr.uploadUrl, pr.headers, file).then(function () {
            return me.submitTransfer(pay.id, { bankAccountId: f.bankAccountId.value, senderName: f.senderName.value, senderBank: f.senderBank.value, amount: +f.amount.value, transferredAt: f.transferredAt.value, receiptKey: pr.key });
          });
        }).then(function () { ui.toast('تم إرسال الإيصال'); renderBookingDetail(); }).catch(function (e) { showErr(e.message); });
      });
    }

    function table(head, rows) {
      return '<table class="tbl" style="width:100%;border-collapse:collapse;margin-top:12px"><thead><tr>' + head.map(function (h) { return '<th style="text-align:start;padding:10px;border-bottom:1px solid var(--line)">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td style="padding:10px;border-bottom:1px solid var(--line)">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    function showErr(m) { var e = el.querySelector('[data-err]'); if (e) { e.hidden = false; e.textContent = m; } }
    function err(e) { el.innerHTML = '<div class="card">تعذّر التحميل: ' + (e && e.message ? e.message : '') + '</div>'; }
  });
})(window.MZ);
