/* booking.html — checkout prototype. ?id=&step=1|2|3 (#rize / #bank variants via hash) */
(function (MZ) {
  var ui = MZ.ui, I = ui.icon, S = MZ.schema;
  var q = new URLSearchParams(location.search);
  var P = MZ.MOCK_PROPERTIES, p = P.filter(function (x) { return String(x.id) === q.get('id'); })[0] || P[0];
  var isRent = p.offer === 'rent';
  var dep = isRent ? 5000 : 50000;
  function render() {
    var h = (location.hash || '#pay').slice(1);
    var method = h === 'bank' ? 'bank' : h === 'rize' ? 'rize' : 'moyasar';
    var full = h === 'full' || h === 'rize';
    var amount = full ? p.price : dep;
    function opt(on, title, sub, amt, href, extra) { return '<a class="opt' + (on ? ' on' : '') + '" href="' + href + '"><span class="r"></span><div style="flex:1"><b>' + title + '</b><small>' + sub + '</small>' + (extra || '') + '</div>' + (amt ? '<span class="amt">' + amt + '</span>' : '') + '</a>'; }
    var html = '<div class="acc"><div class="container"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:22px"><h1 style="font-size:32px">إتمام الحجز</h1><div class="chk-steps"><span class="on"><i>✓</i>تسجيل الدخول</span><span class="ln"></span><span class="on"><i>2</i>الدفع</span><span class="ln"></span><span><i>3</i>التأكيد</span></div></div>' +
      '<div class="chk"><div style="display:flex;flex-direction:column;gap:18px">' +
      '<section class="panel2"><div class="ph"><h3>1. ماذا تريد أن تدفع الآن؟</h3></div><div class="pb" style="display:flex;flex-direction:column;gap:12px">' +
      opt(!full, 'عربون لحجز العقار', 'يُخصم من قيمة العقار عند إتمام الصفقة · يُسترد كاملاً إن لم تكتمل الإجراءات من طرفنا', ui.num(dep) + ' ر.س', '#pay') +
      opt(full, isRent ? 'دفع الإيجار السنوي كاملاً' : 'دفع المبلغ كاملاً', 'يتأكد الحجز فوراً ويبدأ المستشار إجراءات ' + (isRent ? 'العقد في منصة إيجار' : 'الإفراغ'), ui.num(p.price) + ' ر.س', '#full') + '</div></section>' +
      '<section class="panel2"><div class="ph"><h3>2. طريقة الدفع</h3></div><div class="pb" style="display:flex;flex-direction:column;gap:12px">' +
      opt(method === 'moyasar', 'الدفع الإلكتروني', 'ادفع بأمان عبر ميسر — يتأكد الحجز فوراً', '', full ? '#full' : '#pay', '<div class="pm-logos"><span>mada</span><span>VISA</span><span>Mastercard</span><span> Pay</span><span>STC Pay</span></div>') +
      opt(method === 'bank', 'تحويل بنكي', 'حوّل المبلغ ثم ارفع الإيصال خلال 48 ساعة · يتأكد الحجز بعد المراجعة', '', '#bank') +
      (isRent ? opt(method === 'rize', 'قسّط إيجارك مع رايز', 'ادفع الإيجار على 12 دفعة شهرية · موافقة فورية', ui.num(Math.round(p.price / 12)) + ' ر.س/شهر', '#rize') : '<div class="opt" style="opacity:.55;cursor:not-allowed"><span class="r"></span><div><b>قسّط مع رايز</b><small>متاح لعقارات الإيجار فقط</small></div></div>') + '</div></section>' +
      (method === 'bank' ? '<section class="panel2"><div class="ph"><h3>بيانات التحويل</h3></div><div class="pb"><p class="muted" style="margin-bottom:12px">بعد تأكيد الحجز ستظهر لك صفحة فيها الحسابات البنكية والمرجع وخانة رفع الإيصال، وتصلك نفس البيانات على بريدك.</p><div class="bank"><b>مصرف الراجحي</b><span class="muted" style="font-size:13px">اسم المستفيد: شركة منزلة العقارية</span><div class="iban"><span>SA03 8000 0000 6080 1016 4519</span>' + I('copy') + '</div></div></div></section>' : '') +
      '<label class="check" style="font-size:14px"><input type="checkbox" checked>قرأت وأوافق على <a class="link">شروط الحجز والاسترداد</a></label></div>' +
      '<aside class="sum"><section class="panel2"><div class="pb" style="display:flex;flex-direction:column;gap:14px"><img src="' + ui.img(p.images[0]) + '" style="width:100%;height:170px;object-fit:cover;border-radius:14px"><div><b style="font-size:17px">' + p.title + '</b><div class="muted" style="font-size:13px">MZ-' + p.id + ' · ' + p.district + '</div></div>' +
      '<div class="cmp"><div class="k">' + (isRent ? 'الإيجار السنوي' : 'سعر العقار') + '</div><div>' + ui.num(p.price) + ' ر.س</div><div class="k">نوع الدفع</div><div>' + (full ? 'كامل' : 'عربون') + '</div><div class="k">الطريقة</div><div>' + { moyasar: 'ميسر', bank: 'تحويل بنكي', rize: 'رايز' }[method] + '</div><div class="k">مهلة الحجز</div><div>' + (method === 'bank' ? '48 ساعة لرفع الإيصال' : '30 دقيقة') + '</div></div>' +
      '<div style="border-top:1px dashed var(--line);padding-top:12px;display:flex;justify-content:space-between;align-items:baseline"><span class="muted">المطلوب الآن</span><b style="font:700 28px var(--f-display);color:var(--green)">' + (method === 'rize' ? ui.num(Math.round(p.price / 12)) : ui.num(amount)) + ' <small style="font-size:14px">ر.س</small></b></div>' +
      '<a class="btn btn--primary btn--block" href="' + (method === 'bank' ? 'account/index.html#booking' : 'account/index.html#booking-paid') + '">' + (method === 'bank' ? 'تأكيد الحجز وعرض بيانات التحويل' : method === 'rize' ? 'المتابعة إلى رايز' : 'ادفع الآن') + '</a>' +
      '<div class="lic-badges" style="margin-top:0"><span class="lic-badge" style="padding:6px 10px"><img src="assets/img/brands/rega.png" style="height:28px" alt=""><span><small>رخصة فال</small><b style="font-size:13px">1100012345</b></span></span></div>' +
      '<small class="muted" style="display:flex;gap:6px;align-items:center">' + I('shield') + 'دفع آمن ومشفّر — لا نحتفظ ببيانات بطاقتك</small></div></section></aside></div></div></div>';
    document.getElementById('app').innerHTML = html;
    document.querySelectorAll('.proto-switch').forEach(function (e) { e.remove(); });
    document.body.insertAdjacentHTML('beforeend', '<div class="proto-switch"><a href="admin/index.html#dashboard">لوحة التحكم</a><a class="on" href="account/index.html#home">حساب العميل</a><a href="index.html">الموقع</a><a href="screens.html">كل الشاشات</a></div>');
  }
  ui.mount('');
  window.addEventListener('hashchange', render);
  render();
})(window.MZ);
