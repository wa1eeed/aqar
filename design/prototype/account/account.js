/* حسابي — customer account prototype (mock). Hash routes. */
(function (MZ) {
  var S = MZ.schema, ui = MZ.ui, I = ui.icon;
  var P = MZ.MOCK_PROPERTIES.map(function (p) { return Object.assign({}, p, { code: 'MZ-' + p.id }); });
  var BELL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  var A = 'account/index.html#';
  function panel(t, b, act) { return '<section class="panel2">' + (t ? '<div class="ph"><h3>' + t + '</h3>' + (act || '') + '</div>' : '') + '<div class="pb">' + b + '</div></section>'; }
  function field(l, inner) { return '<div class="field"><label>' + l + '</label>' + inner + '</div>'; }
  function inp(v, ltr) { return '<input class="input" value="' + v + '"' + (ltr ? ' dir="ltr"' : '') + '>'; }
  function sw(on) { return '<span class="switch' + (on ? ' on' : '') + '"></span>'; }

  var NAV = [['home', 'grid', 'نظرة عامة'], ['bookings', 'key', 'حجوزاتي'], ['requests', 'mail', 'طلباتي ومعايناتي'], ['notifications', null, 'الإشعارات', 2], ['favorites', 'heart', 'المفضلة والبحوث'], ['settings', 'user', 'الملف والإعدادات']];
  function shell(on, html) {
    return '<div class="acc"><div class="container"><div class="acc-grid"><aside class="acc-side"><div class="who"><span class="avatar" style="width:48px;height:48px">م</span><div><b>محمد الدوسري</b><small dir="ltr">m.d@mail.com</small></div></div><nav>' +
      NAV.map(function (n) { return '<a href="' + A + n[0] + '" class="' + (on.indexOf(n[0]) === 0 || (on === 'booking' && n[0] === 'bookings') ? 'on' : '') + '">' + (n[1] ? I(n[1]) : BELL) + n[2] + (n[3] ? '<span class="cnt">' + n[3] + '</span>' : '') + '</a>'; }).join('') +
      '<a href="' + A + 'login">' + I('arrowL') + 'تسجيل الخروج</a></nav></aside><div class="acc-main">' + html + '</div></div></div></div>';
  }
  function bkCard(b) {
    var p = P[b.i];
    return '<div class="bk-card"><img src="' + ui.img(p.images[0]) + '" alt=""><div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill ' + b.pc + '">' + b.st + '</span><span class="muted" style="font-size:13px" dir="ltr">' + b.id + '</span></div><b style="display:block;font-size:17px;margin-top:6px">' + p.title + '</b><div class="m"><span>' + I('pin') + p.district + '</span><span>' + b.kind + ': <b style="color:var(--ink)">' + b.amt + ' ر.س</b></span><span>' + b.method + '</span></div></div><div>' + b.act + '</div></div>';
  }
  var BK = [
    { i: 1, id: 'B-2026-000040', st: 'بانتظار مراجعة التحويل', pc: 'p-amber', kind: 'دفع كامل', amt: '75,000', method: 'تحويل بنكي', act: '<a class="btn btn--primary btn--sm" href="' + A + 'booking">التفاصيل</a>' },
    { i: 0, id: 'B-2026-000041', st: 'مؤكد', pc: 'p-green', kind: 'عربون', amt: '50,000', method: 'ميسر · مدى', act: '<a class="btn btn--ghost btn--sm" href="' + A + 'booking-paid">الإيصال</a>' },
    { i: 19, id: 'B-2026-000037', st: 'منتهي — لم يكتمل الدفع', pc: 'p-gray', kind: 'عربون', amt: '30,000', method: 'ميسر', act: '<a class="btn btn--ghost btn--sm">إعادة المحاولة</a>' }
  ];

  var V = {};
  V.home = function () {
    return '<div><h1>أهلاً محمد</h1><p class="muted">تابع حجوزاتك وطلباتك ومواعيد معايناتك من مكان واحد.</p></div>' +
      '<div class="kpis2" style="grid-template-columns:repeat(4,1fr)">' + [['حجوزات نشطة', '2'], ['معاينات قادمة', '1'], ['عقارات محفوظة', '6'], ['إشعارات جديدة', '2']].map(function (k) { return '<div class="kpi2"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>'; }).join('') + '</div>' +
      '<div style="background:var(--gold-50);border:1px solid #EAD9B6;border-radius:16px;padding:16px;display:flex;gap:14px;align-items:center"><span class="av" style="background:var(--gold);color:var(--green-900)">!</span><div style="flex:1"><b>إيصال تحويلك قيد المراجعة</b><div class="muted" style="font-size:14px">الحجز B-2026-000040 · نراجعه خلال 24 ساعة عمل وسنبلغك فوراً.</div></div><a class="btn btn--primary btn--sm" href="' + A + 'booking">عرض الحجز</a></div>' +
      panel('آخر الحجوزات', BK.slice(0, 2).map(bkCard).join('<div style="height:10px"></div>'), '<a class="link" href="' + A + 'bookings" style="font-size:14px">كل الحجوزات</a>') +
      panel('المعاينة القادمة', '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div style="background:var(--green);color:#fff;border-radius:14px;padding:10px 16px;text-align:center"><small>نوفمبر</small><b style="display:block;font-size:26px">19</b><small>الخميس</small></div><div style="flex:1"><b>' + P[0].title + '</b><div class="muted" style="font-size:14px">4:00 م · مع فهد العتيبي · حي الملقا</div></div><a class="btn btn--ghost btn--sm">' + I('map') + 'الاتجاهات</a><a class="btn btn--ghost btn--sm">إعادة جدولة</a></div>');
  };
  V.bookings = function () { return '<div><h1>حجوزاتي</h1></div><div class="seg" style="align-self:flex-start"><button aria-pressed="true">الكل</button><button>نشطة</button><button>مكتملة</button><button>منتهية</button></div>' + BK.map(bkCard).join(''); };
  V.booking = function () {
    var p = P[1];
    return '<div><div class="crumb muted" style="font-size:13px"><a href="' + A + 'bookings">حجوزاتي</a> / B-2026-000040</div><h1>إتمام الدفع بالتحويل البنكي</h1></div>' +
      '<div class="g2"><div style="display:flex;flex-direction:column;gap:18px">' +
      panel('', '<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap"><div><span class="muted">المبلغ المستحق</span><b style="display:block;font:700 32px var(--f-display);color:var(--green)">75,000 <small style="font-size:16px">ر.س</small></b><span class="muted">اكتب هذا المرجع في ملاحظات التحويل: </span><b dir="ltr">B-2026-000040</b> <a class="link" style="font-size:13px">' + I('copy') + 'نسخ</a></div><div style="text-align:center"><span class="muted" style="font-size:13px">المهلة المتبقية لرفع الإيصال</span><div class="countdown" style="margin-top:6px"><span>41</span><span>:</span><span>12</span><span>:</span><span>09</span></div></div></div>') +
      panel('حوّل إلى أحد الحسابات التالية', '<p class="muted" style="margin-bottom:12px">حوّل المبلغ المستحق إلى أحد الحسابات أدناه، واكتب رقم الحجز في خانة الملاحظات، ثم ارفع صورة الإيصال من هذه الصفحة.</p><div class="g2e">' + [['مصرف الراجحي', 'SA03 8000 0000 6080 1016 4519'], ['البنك الأهلي السعودي', 'SA44 1000 0000 1234 5678 9012']].map(function (b) { return '<div class="bank"><b>' + b[0] + '</b><span class="muted" style="font-size:13px">اسم المستفيد: شركة عقار أونلاين</span><div class="iban"><span>' + b[1] + '</span><a class="link" style="font-size:13px">' + I('copy') + '</a></div></div>'; }).join('') + '</div>') +
      panel('ارفع إيصال التحويل', '<div class="dropzone">' + I('doc') + '<br>اسحب الإيصال هنا أو <b class="link">اختر ملفاً</b><br><small>PDF أو JPG أو PNG · حتى 10 ميجا</small></div><div class="form2" style="margin-top:14px">' + field('اسم المحوّل', inp('ريم القحطاني')) + field('البنك المحوَّل منه', '<select class="select"><option>البنك الأهلي السعودي</option></select>') + field('المبلغ المحوّل', inp('75,000')) + field('تاريخ التحويل', inp('2026-11-15', 1)) + '</div><a class="btn btn--primary" style="margin-top:14px">' + I('check') + 'إرسال الإيصال للمراجعة</a>') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:18px">' + panel('العقار', '<img src="' + ui.img(p.images[0]) + '" style="width:100%;height:150px;object-fit:cover;border-radius:12px"><b style="display:block;margin-top:10px">' + p.title + '</b><div class="muted" style="font-size:13px">MZ-' + p.id + ' · ' + p.district + '</div><div class="cmp" style="margin-top:10px"><div class="k">نوع الدفع</div><div>دفع كامل</div><div class="k">الطريقة</div><div>تحويل بنكي</div></div>') +
      panel('ماذا يحدث بعد التحويل؟', '<div class="steps2">' + ['نراجع الإيصال خلال 24 ساعة عمل', 'نؤكد الحجز ويصلك إشعار وبريد', 'يتواصل معك المستشار لإكمال الإجراءات'].map(function (s, i, a) { return '<div class="s"><div class="ln"><i>' + (i + 1) + '</i>' + (i < a.length - 1 ? '<span></span>' : '') + '</div><div class="tx"><b>' + s + '</b></div></div>'; }).join('') + '</div>') + '</div></div>';
  };
  V['booking-paid'] = function () {
    var p = P[0];
    return '<div><div class="crumb muted" style="font-size:13px"><a href="' + A + 'bookings">حجوزاتي</a> / B-2026-000041</div><h1>تم تأكيد حجزك</h1></div>' +
      '<div class="g2"><section class="panel2"><div class="pb" style="text-align:center;padding:34px"><div style="width:72px;height:72px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;margin:0 auto">' + I('check') + '</div><h2 style="margin-top:14px">تم دفع العربون بنجاح</h2><p class="muted">تم حجز «' + p.title + '» باسمك، وسيتواصل معك فهد العتيبي خلال ساعات العمل.</p><div class="receipt" style="margin-top:20px"><div class="paper" style="width:100%;max-width:380px"><b style="text-align:center">إيصال دفع</b><div class="l"><span>رقم الإيصال</span><b dir="ltr">R-2026-000088</b></div><div class="l"><span>الحجز</span><span dir="ltr">B-2026-000041</span></div><div class="l"><span>المبلغ</span><b>50,000.00 ر.س</b></div><div class="l"><span>الطريقة</span><span>ميسر · مدى ••4821</span></div><div class="l"><span>التاريخ</span><span>14/11/2026 9:44 م</span></div></div></div><div style="display:flex;gap:10px;justify-content:center;margin-top:16px"><a class="btn btn--primary btn--sm">' + I('doc') + 'تنزيل الإيصال PDF</a><a class="btn btn--ghost btn--sm">' + I('whatsapp') + 'تواصل مع المستشار</a></div></div></section>' +
      panel('الخطوات التالية', '<div class="steps2">' + [['الحجز', 'مؤكد', 1], ['الدفع', '50,000 ر.س عربون', 1], ['توقيع العقد', 'سيتواصل معك المستشار', 0], ['الإفراغ', 'بعد سداد المتبقي', 0]].map(function (s, i, a) { return '<div class="s"><div class="ln"><i class="' + (s[2] ? '' : 'o') + '">' + (s[2] ? '✓' : i + 1) + '</i>' + (i < a.length - 1 ? '<span></span>' : '') + '</div><div class="tx"><b>' + s[0] + '</b><small>' + s[1] + '</small></div></div>'; }).join('') + '</div>') + '</div>';
  };
  V.requests = function () {
    var r = [['L-000231', 'طلب معاينة', P[0].title, 'p-purple', 'موعد مؤكد · الخميس 4 م'], ['L-000198', 'استفسار', P[5].title, 'p-blue', 'تم الرد'], ['L-000175', 'طلب عقار', 'فيلا في شمال الرياض حتى 5 مليون', 'p-gold', 'قيد البحث']];
    return '<div><h1>طلباتي ومعايناتي</h1></div>' + panel('', '<table class="tbl"><thead><tr><th>الرقم</th><th>النوع</th><th>العقار</th><th>الحالة</th></tr></thead><tbody>' + r.map(function (x) { return '<tr><td dir="ltr" style="text-align:right">' + x[0] + '</td><td>' + x[1] + '</td><td class="t">' + x[2] + '</td><td><span class="pill ' + x[3] + '">' + x[4] + '</span></td></tr>'; }).join('') + '</tbody></table>');
  };
  V.notifications = function () {
    var n = [['p-amber', 'clock', 'استلمنا إيصال تحويلك', 'الحجز B-2026-000040 قيد المراجعة خلال 24 ساعة عمل', 'قبل 5 ساعات', 1], ['p-green', 'calendar', 'تم تأكيد موعد المعاينة', 'الخميس 19 نوفمبر 4:00 م مع فهد العتيبي', 'قبل 6 ساعات', 1], ['p-green', 'check', 'تم تأكيد حجزك', 'فيلا مودرن بدرج داخلي · عربون 50,000 ر.س', 'أمس', 0], ['p-gold', 'heart', 'انخفض سعر عقار في مفضلتك', 'شقة في حي النرجس — 5% أقل', 'قبل 3 أيام', 0], ['p-blue', 'search', '3 عقارات جديدة تطابق بحثك المحفوظ', '«فلل للبيع في شمال الرياض»', 'قبل أسبوع', 0]];
    return '<div style="display:flex;justify-content:space-between;align-items:center"><h1>الإشعارات</h1><a class="btn btn--ghost btn--sm">' + I('check') + 'تعليم الكل كمقروء</a></div><section class="panel2"><div class="notifs">' + n.map(function (x) { return '<div class="n' + (x[5] ? ' unread' : '') + '"><span class="pill ' + x[0] + '" style="width:40px;height:40px;padding:0;justify-content:center">' + I(x[1]) + '</span><div style="flex:1"><b>' + x[2] + '</b><p>' + x[3] + '</p><small>' + x[4] + '</small></div>' + (x[5] ? '<span class="u"></span>' : '') + '</div>'; }).join('') + '</div></section>';
  };
  V.favorites = function () {
    return '<div><h1>المفضلة والبحوث المحفوظة</h1></div>' + panel('البحوث المحفوظة', '<div class="trow"><div><b>فلل للبيع في شمال الرياض</b><small>حتى 5,000,000 ر.س · 4 غرف+ · تنبيه يومي بالبريد</small></div>' + sw(1) + '</div><div class="trow"><div><b>شقق للإيجار في جدة</b><small>تنبيه فوري داخل المنصة</small></div>' + sw(1) + '</div>') +
      '<div class="grid-cards" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">' + [0, 5, 8].map(function (i) { return ui.card(P[i]); }).join('') + '</div>';
  };
  V.settings = function () {
    return '<div><h1>الملف والإعدادات</h1></div><div class="g2e">' + panel('بياناتي', '<div class="form2">' + field('الاسم الكامل', inp('محمد الدوسري')) + field('الجوال', inp('+966 55 123 4567', 1)) + field('البريد الإلكتروني', inp('m.d@mail.com', 1)) + field('المدينة', '<select class="select"><option>الرياض</option></select>') + '</div><div style="margin-top:14px;display:flex;gap:10px;align-items:center"><span class="pill p-green">✓ البريد موثّق</span><a class="btn btn--ghost btn--sm">' + I('shield') + 'التحقق عبر النفاذ الوطني</a></div>') +
      panel('تفضيلات الإشعارات', [['حالة الحجز والمدفوعات', 'داخل المنصة + البريد', 1], ['مواعيد المعاينة', 'داخل المنصة + البريد', 1], ['عقارات جديدة تطابق بحوثي', 'البريد', 1], ['تغيّر أسعار المفضلة', 'داخل المنصة', 1], ['عروض وأخبار المكتب', 'البريد', 0]].map(function (x) { return '<div class="trow"><div><b>' + x[0] + '</b><small>' + x[1] + '</small></div>' + sw(x[2]) + '</div>'; }).join('')) + '</div>' +
      panel('الخصوصية', '<div class="trow"><div><b>تنزيل بياناتي</b><small>وفق نظام حماية البيانات الشخصية</small></div><a class="btn btn--ghost btn--sm">طلب نسخة</a></div><div class="trow"><div><b>حذف الحساب</b><small>تُحذف بياناتك خلال 30 يوماً عدا ما يلزم نظاماً</small></div><a class="btn btn--ghost btn--sm" style="color:var(--st-sold)">حذف الحساب</a></div>');
  };
  V.login = function () {
    return '<div class="acc"><div class="container" style="max-width:520px"><section class="panel2"><div class="pb" style="padding:34px;display:flex;flex-direction:column;gap:16px;text-align:center"><div style="width:64px;height:64px;border-radius:18px;background:var(--green-50);color:var(--green);display:grid;place-items:center;margin:0 auto">' + I('user') + '</div><h1 style="font-size:28px">الدخول إلى حسابك</h1><p class="muted">بدون كلمة مرور — نرسل لك رمز تحقق على بريدك.</p>' + field('البريد الإلكتروني', inp('m.d@mail.com', 1)) + '<a class="btn btn--primary btn--block" href="' + A + 'otp">إرسال رمز التحقق</a><small class="muted">بالمتابعة توافق على الشروط وسياسة الخصوصية</small></div></section></div></div>';
  };
  V.otp = function () {
    return '<div class="acc"><div class="container" style="max-width:520px"><section class="panel2"><div class="pb" style="padding:34px;display:flex;flex-direction:column;gap:16px;text-align:center"><div style="width:64px;height:64px;border-radius:18px;background:var(--green-50);color:var(--green);display:grid;place-items:center;margin:0 auto">' + I('mail') + '</div><h1 style="font-size:28px">أدخل رمز التحقق</h1><p class="muted">أرسلنا رمزاً من 6 أرقام إلى <b dir="ltr">m.d@mail.com</b></p><div class="otp"><span>7</span><span>3</span><span>9</span><span>1</span><span class="f">|</span><span></span></div><a class="btn btn--primary btn--block" href="' + A + 'home">تحقق ودخول</a><small class="muted">لم يصلك؟ إعادة الإرسال بعد 00:42</small></div></section></div></div>';
  };

  function render() {
    var r = (location.hash || '#home').slice(1); if (!V[r]) r = 'home';
    var html = V[r]();
    document.getElementById('app').innerHTML = (r === 'login' || r === 'otp') ? html : shell(r, html);
    document.querySelectorAll('.proto-switch').forEach(function (e) { e.remove(); });
    document.body.insertAdjacentHTML('beforeend', '<div class="proto-switch"><a href="admin/index.html#dashboard">لوحة التحكم</a><a class="on" href="account/index.html#home">حساب العميل</a><a href="index.html">الموقع</a><a href="screens.html">كل الشاشات</a></div>');
    window.scrollTo(0, 0);
  }
  ui.mount('');
  window.addEventListener('hashchange', render);
  render();
})(window.MZ);
