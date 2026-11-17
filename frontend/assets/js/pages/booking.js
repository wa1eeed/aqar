/* =========================================================
   إتمام الحجز — /booking#p-{id} (docs/04 §3، docs/08 §6، design c-checkout-*.png)
   الخادم هو المرجع للمبالغ وطرق الدفع: كل ما يظهر هنا من POST /me/bookings/quote.
   ========================================================= */
window.MZ.boot().then(function () {
(function (MZ) {
  var ui = MZ.ui, I = ui.icon, esc = ui.esc, auth = MZ.auth, S = MZ.schema;
  var root = document.querySelector('[data-checkout]');
  ui.mount('');

  var hash = /^#p-(\d+)$/.exec(location.hash || '');
  var id = hash ? hash[1] : new URLSearchParams(location.search).get('id');
  var NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  var st = { pub: null, q: null, method: null, terms: false, busy: false, key: null };
  function sar(h) { return NF.format((+h || 0) / 100) + ' ر.س'; }
  function ibanFmt(v) { return String(v || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim(); }
  function newKey() {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function panel(title, body) { return '<section class="panel2">' + (title ? '<div class="ph"><h3>' + title + '</h3></div>' : '') + '<div class="pb" style="display:flex;flex-direction:column;gap:12px">' + body + '</div></section>'; }
  function frame(step, inner) {
    var s = function (n, label) { var done = n < step, on = n <= step; return '<span class="' + (on ? 'on' : '') + '"><i>' + (done ? '✓' : n) + '</i>' + label + '</span>'; };
    root.innerHTML = '<div class="acc"><div class="container"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:22px"><h1 style="font-size:32px">إتمام الحجز</h1>' +
      '<div class="chk-steps" aria-label="مراحل الحجز">' + s(1, 'تسجيل الدخول') + '<span class="ln"></span>' + s(2, 'الدفع') + '<span class="ln"></span>' + s(3, 'التأكيد') + '</div></div>' + inner + '</div></div>';
  }
  function message(title, text, cta) {
    frame(2, '<section class="panel2"><div class="pb"><div class="empty" style="padding:34px 10px">' + I('key') + '<h3>' + title + '</h3>' + (text ? '<p>' + text + '</p>' : '') + (cta || '') + '</div></div></section>');
  }
  function propertyUrl() { return (st.pub && st.pub.url) || ('/property/' + id); }

  /* ---------- server quote ---------- */
  function quote(type) {
    return auth.request('/me/bookings/quote', { body: type ? { propertyId: +id, paymentType: type } : { propertyId: +id } }).then(function (q) {
      st.q = q; st.key = newKey();
      var ms = q.methods.map(function (m) { return m.method; });
      if (ms.indexOf(st.method) === -1) st.method = ms[0] || null;
      return q;
    });
  }
  function unavailable(e) {
    var busy = e && e.code === 'BOOKING_PROPERTY_UNAVAILABLE';
    message(busy ? 'العقار قيد الحجز حالياً' : 'الحجز غير متاح', esc((e && e.message) || ''),
      '<a class="btn btn--primary btn--sm" href="' + esc(propertyUrl()) + '">العودة إلى العقار</a>');
  }

  /* ---------- page ---------- */
  function opt(on, attrs, title, sub, amount, extra, disabled) {
    return '<button type="button" class="opt' + (on ? ' on' : '') + '" role="radio" aria-checked="' + !!on + '" ' + attrs + (disabled ? ' disabled' : '') +
      ' style="text-align:inherit;width:100%;font:inherit;color:inherit' + (disabled ? ';opacity:.55;cursor:not-allowed' : '') + '"><span class="r"></span><div style="flex:1"><b>' + title + '</b><small>' + sub + '</small>' + (extra || '') + '</div>' +
      (amount ? '<span class="amt">' + amount + '</span>' : '') + '</button>';
  }
  function draw() {
    var q = st.q, p = st.pub || {}, rent = q.property.offer === 'rent', m = st.method;
    var meth = q.methods.filter(function (x) { return x.method === m; })[0];
    var holdText = !meth ? '' : meth.method === 'bank_transfer' ? Math.round(meth.holdMinutes / 60) + ' ساعة لرفع الإيصال' : meth.holdMinutes + ' دقيقة';
    var types = q.paymentTypes.map(function (t) {
      return t === 'deposit'
        ? opt(q.paymentType === 'deposit', 'data-type="deposit"', 'عربون لحجز العقار', 'يُخصم من قيمة العقار عند إتمام الصفقة · يُسترد كاملاً إن لم تكتمل الإجراءات من طرفنا', sar(q.options.deposit))
        : opt(q.paymentType === 'full', 'data-type="full"', rent ? 'دفع الإيجار كاملاً' : 'دفع المبلغ كاملاً', 'يتأكد الحجز فوراً ويبدأ المستشار إجراءات ' + (rent ? 'العقد في منصة إيجار' : 'الإفراغ'), sar(q.options.full));
    }).join('');
    var methods = q.methods.map(function (x) {
      if (x.method === 'moyasar') return opt(m === 'moyasar', 'data-method="moyasar"', 'الدفع الإلكتروني', 'ادفع بأمان عبر ميسر — يتأكد الحجز فوراً', '', '<div class="pm-logos"><span>mada</span><span>VISA</span><span>Mastercard</span><span>Apple Pay</span><span>STC Pay</span></div>');
      if (x.method === 'bank_transfer') return opt(m === 'bank_transfer', 'data-method="bank_transfer"', 'تحويل بنكي', 'حوّل المبلغ ثم ارفع الإيصال خلال ' + Math.round(x.holdMinutes / 60) + ' ساعة · يتأكد الحجز بعد المراجعة', '');
      if (x.method === 'rize') return opt(m === 'rize', 'data-method="rize"', esc(x.labelAr || 'قسّط مع رايز'), 'قسّط إيجارك على 12 دفعة شهرية', '');
      return '';
    }).join('');
    var bank = m === 'bank_transfer' && q.bankAccounts && q.bankAccounts.length ? panel('بيانات التحويل', '<p class="muted" style="margin:0">بعد تأكيد الحجز ستظهر لك صفحة فيها الحسابات البنكية والمرجع وخانة رفع الإيصال، وتصلك نفس البيانات على بريدك.</p>' +
      q.bankAccounts.map(function (a) { return '<div class="bank"><b>' + esc(a.bankName) + '</b><span class="muted" style="font-size:13px">اسم المستفيد: ' + esc(a.beneficiaryName) + '</span><div class="iban"><span>' + esc(ibanFmt(a.iban)) + '</span>' + I('copy') + '</div></div>'; }).join('')) : '';
    var cta = m === 'bank_transfer' ? 'تأكيد الحجز وعرض بيانات التحويل' : m === 'rize' ? 'المتابعة إلى رايز' : 'ادفع الآن';
    var img = ui.img(p.images && p.images[0]);
    frame(2, '<div class="chk"><div style="display:flex;flex-direction:column;gap:18px">' +
      panel('1. ماذا تريد أن تدفع الآن؟', '<div role="radiogroup" aria-label="نوع الدفع" style="display:flex;flex-direction:column;gap:12px">' + types + '</div>') +
      panel('2. طريقة الدفع', '<div role="radiogroup" aria-label="طريقة الدفع" style="display:flex;flex-direction:column;gap:12px">' + methods + '</div>') + bank +
      '<div data-moyasar-host></div>' +
      '<label class="check" style="font-size:14px"><input type="checkbox" data-terms' + (st.terms ? ' checked' : '') + '>قرأت وأوافق على <button type="button" class="link" data-terms-open style="font-weight:700">شروط الحجز والاسترداد</button></label><span class="field-err" data-terms-err></span>' +
      (q.nafathRequired ? '<div class="closed-note" style="margin:0">' + I('shield') + '<span>يتطلب هذا الحجز التحقق من الهوية عبر النفاذ الوطني.</span></div>' : '') +
      '</div><aside class="sum"><section class="panel2"><div class="pb" style="display:flex;flex-direction:column;gap:14px">' +
        '<img src="' + esc(img) + '" alt="" style="width:100%;height:170px;object-fit:cover;border-radius:14px"><div><b style="font-size:17px">' + esc(q.property.title) + '</b><div class="muted" style="font-size:13px">' + esc(q.property.code) + (p.district ? ' · ' + esc(p.district) : '') + '</div></div>' +
        '<div class="cmp"><div class="k">' + (rent ? 'الإيجار' : 'سعر العقار') + '</div><div>' + sar(q.priceHalalas) + '</div><div class="k">نوع الدفع</div><div>' + (q.paymentType === 'deposit' ? 'عربون' : 'كامل') + '</div>' +
          '<div class="k">الطريقة</div><div>' + esc(S.paymentMethods[m] || '—') + '</div><div class="k">مهلة الحجز</div><div>' + holdText + '</div></div>' +
        '<div style="border-top:1px dashed var(--line);padding-top:12px;display:flex;justify-content:space-between;align-items:baseline;gap:10px"><span class="muted">المطلوب الآن</span><b style="font:700 28px var(--f-display);color:var(--green);white-space:nowrap">' + NF.format(q.amountDue / 100) + ' <small style="font-size:14px">ر.س</small></b></div>' +
        (q.vatNoteAr ? '<small class="muted">' + esc(q.vatNoteAr) + '</small>' : '') +
        '<button class="btn btn--primary btn--block" type="button" data-submit' + (m ? '' : ' disabled') + '>' + cta + '</button><span class="field-err" data-submit-err role="alert"></span>' +
        '<small class="muted" style="display:flex;gap:6px;align-items:center">' + I('shield') + 'دفع آمن ومشفّر — لا نحتفظ ببيانات بطاقتك</small></div></section></aside></div>');
  }
  function termsModal() {
    var q = st.q;
    ui.openModal('<div style="max-height:70vh;overflow:auto;line-height:1.9"><h2 style="font-size:22px;margin-bottom:10px">شروط الحجز والاسترداد</h2>' +
      '<div>' + (q.termsHtml || '') + '</div><h3 style="font-size:17px;margin:14px 0 6px">سياسة الإلغاء</h3><div>' + (q.cancellationPolicyHtml || '') + '</div>' +
      '<small class="muted">الإصدار ' + esc(q.termsVersion) + '</small></div>', { label: 'شروط الحجز والاسترداد' });
  }

  function submit(btn) {
    var err = root.querySelector('[data-submit-err]');
    err.textContent = '';
    if (!st.terms) { root.querySelector('[data-terms-err]').textContent = 'يلزم الموافقة على شروط الحجز والاسترداد'; return; }
    btn.disabled = true; st.busy = true;
    auth.request('/me/bookings', {
      body: { propertyId: +id, paymentType: st.q.paymentType, paymentMethod: st.method, termsVersion: st.q.termsVersion },
      headers: { 'Idempotency-Key': st.key }
    }).then(function (r) {
      var na = r.nextAction, bid = r.booking.id;
      if (na && na.type === 'redirect' && /^https:\/\//.test(na.url)) { location.href = na.url; return; }
      if (na && na.type === 'moyasar_form') {
        // Booking created and held: show the card form in place of the method choice.
        frame(2, '<div class="chk"><div style="display:flex;flex-direction:column;gap:18px">' + panel('بيانات البطاقة', '<p class="muted" style="margin:0">الحجز <b dir="ltr">' + esc(r.booking.number) + '</b> محجوز لك مؤقتاً. أكمل الدفع خلال المهلة.</p><div data-mysr></div>') +
          '<a class="link" href="/account/booking?b=' + encodeURIComponent(bid) + '">عرض الحجز</a></div><aside class="sum"><section class="panel2"><div class="pb"><span class="muted">المطلوب الآن</span><b style="display:block;font:700 28px var(--f-display);color:var(--green)">' + sar(na.amount) + '</b></div></section></aside></div>');
        MZ.payments.moyasarForm(root.querySelector('[data-mysr]'), na);
        return;
      }
      if (r.paymentError) ui.toast(esc(r.paymentError));
      location.href = '/account/booking?b=' + encodeURIComponent(bid);
    }).catch(function (e) {
      btn.disabled = false; st.busy = false;
      if (e.code === 'BOOKING_PROPERTY_UNAVAILABLE' || e.code === 'BOOKING_NOT_AVAILABLE') return unavailable(e);
      if (e.code === 'TERMS_OUTDATED') { st.terms = false; ui.toast(esc(e.message)); return quote(st.q.paymentType).then(draw); }
      err.textContent = e.message;
    });
  }

  root.addEventListener('click', function (e) {
    if (st.busy) return;
    var t = e.target.closest('[data-type]');
    if (t && st.q && t.dataset.type !== st.q.paymentType) { quote(t.dataset.type).then(draw).catch(unavailable); return; }
    var m = e.target.closest('[data-method]');
    if (m && !m.disabled) { st.method = m.dataset.method; draw(); return; }
    if (e.target.closest('[data-terms-open]')) { e.preventDefault(); termsModal(); return; }
    var b = e.target.closest('[data-submit]');
    if (b) submit(b);
  });
  root.addEventListener('change', function (e) {
    if (e.target.matches('[data-terms]')) { st.terms = e.target.checked; var x = root.querySelector('[data-terms-err]'); if (x) x.textContent = ''; }
  });

  function start() {
    frame(2, '<p class="muted">جارٍ التحميل…</p>');
    MZ.api.getProperty(id).then(function (p) { st.pub = p; }).catch(function () {}).then(function () {
      return quote();
    }).then(draw).catch(unavailable);
  }
  function loginStep() {
    frame(1, '<div style="max-width:520px;margin:0 auto"><section class="panel2"><div class="pb" style="padding:34px"><p class="muted" style="text-align:center;margin-bottom:12px">سجّل دخولك بالبريد الإلكتروني لإكمال الحجز.</p><div class="auth-card" data-auth-host></div></div></section></div>');
    auth.mountLogin(root.querySelector('[data-auth-host]'), start);
  }

  if (!id) { message('لم يتم تحديد العقار', '', '<a class="btn btn--primary btn--sm" href="/properties">تصفّح العقارات</a>'); return; }
  if (!auth.enabled()) { message('الحجز غير متاح حالياً', 'تواصل معنا لإكمال الحجز.', '<a class="btn btn--primary btn--sm" href="/contact">تواصل معنا</a>'); return; }
  auth.init().then(function (u) { if (u) start(); else loginStep(); });
  auth.onChange(function (u) { if (!u) loginStep(); });
})(window.MZ);
});
