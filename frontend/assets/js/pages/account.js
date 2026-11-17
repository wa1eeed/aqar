/* =========================================================
   صفحات «حسابي» (docs/08 §5، design/screenshots/c-*.png)
   الصفحة تُحدَّد من <body data-account="...">؛ تتطلب الدخول وإلا يظهر نموذج الدخول.
   ========================================================= */
window.MZ.boot().then(function () {
(function (MZ) {
  var S = MZ.schema, ui = MZ.ui, I = ui.icon, esc = ui.esc, auth = MZ.auth, api = MZ.api;
  var page = document.body.getAttribute('data-account');
  var root = document.querySelector('[data-account-root]');
  ui.mount('');

  var LEAD_TYPES = { viewing: 'طلب معاينة', waitlist: 'قائمة انتظار', buy: 'طلب شراء', rent: 'طلب إيجار', list: 'عرض عقار', invest: 'استثمار', manage: 'إدارة أملاك', contact: 'استفسار' };
  var LEAD_STAGES = { new: ['تم الاستلام', 'p-gold'], contacted: ['قيد المتابعة', 'p-blue'], viewing: ['معاينة', 'p-purple'], negotiation: ['قيد التفاوض', 'p-amber'], won: ['مكتمل', 'p-green'], lost: ['مغلق', 'p-gray'] };
  var VIEWING = { requested: ['بانتظار التأكيد', 'p-blue'], confirmed: ['مؤكد', 'p-green'], completed: ['تمت', 'p-gray'], no_show: ['لم يتم الحضور', 'p-red'], cancelled: ['ملغي', 'p-gray'] };
  var BELL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  var NAV = [
    ['index', '/account', 'grid', 'نظرة عامة'],
    ['viewings', '/account/viewings', 'mail', 'طلباتي ومعايناتي'],
    ['notifications', '/account/notifications', null, 'الإشعارات'],
    ['saved-searches', '/account/saved-searches', 'heart', 'المفضلة والبحوث'],
    ['settings', '/account/settings', 'user', 'الملف والإعدادات']
  ];

  /* ---------- formatting (Gregorian, Latin digits, Riyadh time) ---------- */
  var DAY = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' });
  var TIME = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' });
  var MONTH = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', timeZone: 'Asia/Riyadh' });
  var WD = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', timeZone: 'Asia/Riyadh' });
  var DNUM = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'Asia/Riyadh' });
  function day(iso) { return DAY.format(new Date(iso)); }
  function time(iso) { return TIME.format(new Date(iso)); }
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'الآن';
    if (s < 3600) return 'قبل ' + Math.round(s / 60) + ' دقيقة';
    if (s < 86400) return 'قبل ' + Math.round(s / 3600) + ' ساعة';
    return 'قبل ' + Math.round(s / 86400) + ' يوم';
  }
  function phone(e) { var m = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e || ''); return m ? '+966 ' + m[1] + ' ' + m[2] + ' ' + m[3] : (e || ''); }
  function pill(pair) { return '<span class="pill ' + pair[1] + '">' + pair[0] + '</span>'; }
  function panel(title, body, act) {
    return '<section class="panel2">' + (title ? '<div class="ph"><h3>' + title + '</h3>' + (act || '') + '</div>' : '') + '<div class="pb">' + body + '</div></section>';
  }
  function empty(icon, title, text, cta) {
    return '<div class="empty" style="padding:28px 10px">' + I(icon) + '<h3>' + title + '</h3>' + (text ? '<p>' + text + '</p>' : '') + (cta || '') + '</div>';
  }
  function sw(on, attrs, label) {
    return '<button type="button" class="switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '" ' + attrs + '></button>';
  }
  function fail(e) { ui.toast(esc((e && e.message) || 'تعذّر تنفيذ الطلب')); }

  /* ---------- shell (design c-home: side nav + main) ---------- */
  function shell(html) {
    var u = auth.user(), unread = auth.unread();
    root.innerHTML = '<div class="acc"><div class="container"><div class="acc-grid">' +
      '<aside class="acc-side"><div class="who"><span class="avatar" style="width:48px;height:48px">' + esc((u.name || '؟').charAt(0)) + '</span><div><b>' + esc(u.name) + '</b><small dir="ltr">' + esc(u.email || phone(u.phone)) + '</small></div></div>' +
      '<nav aria-label="حسابي">' + NAV.map(function (n) {
        return '<a href="' + n[1] + '"' + (n[0] === page ? ' class="on" aria-current="page"' : '') + '>' + (n[2] ? I(n[2]) : BELL) + n[3] +
          (n[0] === 'notifications' ? '<span class="cnt" data-unread-side' + (unread ? '' : ' hidden') + '>' + unread + '</span>' : '') + '</a>';
      }).join('') + '<a href="#" data-logout>' + I('arrowL') + 'تسجيل الخروج</a></nav></aside>' +
      '<div class="acc-main" data-main>' + html + '</div></div></div></div>';
    document.title = (NAV.filter(function (n) { return n[0] === page; })[0] || NAV[0])[3] + ' — ' + (MZ.config.brand.fullName || '');
  }
  document.addEventListener('mz:unread', function (e) {
    var el = document.querySelector('[data-unread-side]');
    if (el) { el.textContent = e.detail; el.hidden = !e.detail; }
  });
  function main() { return document.querySelector('[data-main]'); }

  /* ---------- login gate (design c-login / c-otp) ---------- */
  function loginGate() {
    root.innerHTML = '<div class="acc"><div class="container" style="max-width:520px"><section class="panel2"><div class="pb" style="padding:34px"><div class="auth-card" data-auth-host></div></div></section></div></div>';
    auth.mountLogin(root.querySelector('[data-auth-host]'), function () { render(); });
  }

  /* ---------- pages ---------- */
  var V = {};

  V.index = function () {
    var u = auth.user();
    shell('<div><h1>أهلاً ' + esc(String(u.name || '').split(' ')[0]) + '</h1><p class="muted">تابع طلباتك ومواعيد معايناتك من مكان واحد.</p></div><div data-home><p class="muted">جارٍ التحميل…</p></div>');
    Promise.all([auth.request('/me/viewings'), auth.request('/me/favorites'), auth.request('/me/notifications?pageSize=1')]).then(function (r) {
      var v = r[0], favs = r[1].ids, now = Date.now();
      var upcoming = v.viewings.filter(function (x) { return (x.status === 'confirmed' || x.status === 'requested') && new Date(x.scheduledAt).getTime() > now; })
        .sort(function (a, b) { return new Date(a.scheduledAt) - new Date(b.scheduledAt); });
      var open = v.requests.filter(function (l) { return l.stage !== 'won' && l.stage !== 'lost'; });
      var kpis = [['معاينات قادمة', upcoming.length], ['طلبات مفتوحة', open.length], ['عقارات محفوظة', favs.length], ['إشعارات جديدة', r[2].unread]];
      var html = '<div class="kpis2" style="grid-template-columns:repeat(4,1fr)">' + kpis.map(function (k) { return '<div class="kpi2"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>'; }).join('') + '</div>';
      var next = upcoming[0];
      html += panel('المعاينة القادمة', next ? viewingRow(next, true) : empty('calendar', 'لا توجد معاينات قادمة', 'اطلب معاينة من صفحة أي عقار وسنؤكد لك الموعد.', '<a class="btn btn--primary btn--sm" href="/properties">تصفّح العقارات</a>'));
      html += panel('آخر الطلبات', v.requests.length ? requestsTable(v.requests.slice(0, 5)) : empty('mail', 'لا توجد طلبات بعد', ''), '<a class="link" href="/account/viewings" style="font-size:14px">كل الطلبات</a>');
      document.querySelector('[data-home]').outerHTML = html;
    }).catch(fail);
  };

  function viewingRow(x, big) {
    var d = new Date(x.scheduledAt), p = x.property, active = (x.status === 'confirmed' || x.status === 'requested') && d.getTime() > Date.now();
    return '<div class="acc-viewing">' +
      '<div class="acc-date"><small>' + MONTH.format(d) + '</small><b>' + DNUM.format(d) + '</b><small>' + WD.format(d) + '</small></div>' +
      '<div style="flex:1;min-width:0"><a href="' + esc(p.url) + '"><b>' + esc(p.title) + '</b></a>' +
        '<div class="muted" style="font-size:14px">' + time(x.scheduledAt) + ' · مع ' + esc(x.agent.name) + (p.district ? ' · حي ' + esc(p.district.nameAr) : '') + '</div>' +
        '<div style="margin-top:6px">' + pill(VIEWING[x.status] || [x.status, 'p-gray']) + '</div></div>' +
      '<div class="acc-viewing__acts">' +
        '<a class="btn btn--ghost btn--sm" href="' + esc(p.url) + '#location">' + I('map') + 'الاتجاهات</a>' +
        (x.agent.whatsapp ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(x.agent.whatsapp) + '?text=' + encodeURIComponent('بخصوص موعد معاينة ' + p.title) + '">' + I('whatsapp') + (big ? 'إعادة جدولة' : '') + '</a>' : '') +
        (active ? '<button class="btn btn--ghost btn--sm" type="button" data-cancel-viewing="' + esc(x.id) + '">إلغاء</button>' : '') +
      '</div></div>';
  }
  function requestsTable(rows) {
    return '<div class="acc-table"><table class="tbl"><thead><tr><th>الرقم</th><th>النوع</th><th>العقار</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>' +
      rows.map(function (l) {
        return '<tr><td dir="ltr" style="text-align:right">' + esc(l.number) + '</td><td>' + (LEAD_TYPES[l.type] || l.type) + '</td><td class="t">' +
          (l.property ? '<a href="' + esc(l.property.url) + '">' + esc(l.property.title) + '</a>' : '—') + '</td><td>' + pill(LEAD_STAGES[l.stage] || [l.stage, 'p-gray']) + '</td><td class="s">' + ago(l.createdAt) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  V.viewings = function () {
    shell('<div><h1>طلباتي ومعايناتي</h1></div><div data-list><p class="muted">جارٍ التحميل…</p></div>');
    auth.request('/me/viewings').then(drawViewings).catch(fail);
  };
  function drawViewings(v) {
    var now = Date.now();
    var up = v.viewings.filter(function (x) { return new Date(x.scheduledAt).getTime() > now && x.status !== 'cancelled'; }).reverse();
    var past = v.viewings.filter(function (x) { return up.indexOf(x) === -1; });
    var html = panel('المعاينات القادمة', up.length ? up.map(function (x) { return viewingRow(x); }).join('<hr class="acc-hr">') : empty('calendar', 'لا توجد معاينات قادمة', ''));
    if (past.length) html += panel('معاينات سابقة', past.map(function (x) { return viewingRow(x); }).join('<hr class="acc-hr">'));
    html += panel('طلباتي', v.requests.length ? requestsTable(v.requests) : empty('mail', 'لا توجد طلبات', 'أرسل طلب معاينة أو استفساراً وسيظهر هنا.'));
    var box = document.querySelector('[data-list]');
    if (box) box.outerHTML = '<div data-list style="display:flex;flex-direction:column;gap:18px">' + html + '</div>';
    else main().querySelector('[data-list]').innerHTML = html;
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cancel-viewing]');
    if (!b) return;
    if (!window.confirm('إلغاء موعد المعاينة؟')) return;
    b.disabled = true;
    auth.request('/me/viewings/' + encodeURIComponent(b.dataset.cancelViewing) + '/cancel', { body: {} }).then(function (v) {
      ui.toast('تم إلغاء الموعد');
      if (page === 'viewings') { var l = document.querySelector('[data-list]'); l.outerHTML = '<div data-list></div>'; drawViewings(v); } else render();
    }).catch(function (err) { b.disabled = false; fail(err); });
  });

  /* ---------- notifications (design c-notifications) ---------- */
  function look(k) {
    if (/^viewing\./.test(k)) return ['p-green', 'calendar'];
    if (/^booking\./.test(k)) return ['p-green', 'check'];
    if (/^payment\./.test(k)) return ['p-amber', 'clock'];
    if (k === 'property.price_dropped' || k === 'property.status_changed') return ['p-gold', 'heart'];
    if (k === 'property.matched_saved_search') return ['p-blue', 'search'];
    return ['p-gray', 'info'];
  }
  var nPage = 1;
  V.notifications = function () {
    shell('<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h1>الإشعارات</h1><button class="btn btn--ghost btn--sm" type="button" data-read-all-page>' + I('check') + 'تعليم الكل كمقروء</button></div><section class="panel2"><div class="notifs" data-notifs><p class="muted" style="padding:18px">جارٍ التحميل…</p></div></section><div data-more></div>');
    loadNotifs(true);
    main().querySelector('[data-read-all-page]').addEventListener('click', function () {
      auth.request('/me/notifications/read', { body: { all: true } }).then(function (r) { auth.setUnread(r.unread); nPage = 1; loadNotifs(true); }).catch(fail);
    });
  };
  function loadNotifs(reset) {
    if (reset) nPage = 1;
    auth.request('/me/notifications?pageSize=20&page=' + nPage).then(function (r) {
      var box = main().querySelector('[data-notifs]');
      var html = r.items.map(function (n) {
        var l = look(n.eventKey);
        var link = typeof n.link === 'string' && /^\/(?!\/)/.test(n.link) ? n.link : null;
        return '<div class="n' + (n.readAt ? '' : ' unread') + '"><span class="pill ' + l[0] + '" style="width:40px;height:40px;padding:0;justify-content:center">' + I(l[1]) + '</span>' +
          '<div style="flex:1;min-width:0">' + (link ? '<a href="' + esc(link) + '" data-open-notif="' + esc(n.id) + '"><b>' + esc(n.title) + '</b></a>' : '<b>' + esc(n.title) + '</b>') +
          (n.body ? '<p>' + esc(n.body) + '</p>' : '') + '<small>' + ago(n.createdAt) + '</small></div>' + (n.readAt ? '' : '<span class="u" aria-label="غير مقروء"></span>') + '</div>';
      }).join('');
      if (reset) box.innerHTML = html || empty('info', 'لا توجد إشعارات', 'ستصلك هنا تحديثات طلباتك ومعايناتك وأسعار المفضلة.');
      else box.insertAdjacentHTML('beforeend', html);
      main().querySelector('[data-more]').innerHTML = r.page < r.pages ? '<button class="btn btn--ghost btn--sm" type="button" data-more-btn>عرض المزيد</button>' : '';
      var more = main().querySelector('[data-more-btn]');
      if (more) more.addEventListener('click', function () { nPage++; loadNotifs(false); });
    }).catch(fail);
  }
  root.addEventListener('click', function (e) {
    var a = e.target.closest('[data-open-notif]');
    if (a) auth.request('/me/notifications/read', { body: { ids: [a.dataset.openNotif] } }).catch(function () {});
  });
  document.addEventListener('mz:notification', function () { if (page === 'notifications') loadNotifs(true); });

  /* ---------- favorites + saved searches (design c-favorites) ---------- */
  function searchSummary(q) {
    var parts = [];
    if (q.offer && S.offers[q.offer]) parts.push(S.offers[q.offer].label);
    if (q.types) parts.push(q.types.split(',').map(function (t) { return S.types[t] ? S.types[t].plural : t; }).join('، '));
    if (q.city) { var c = S.city(q.city); parts.push(c ? c.label : q.city); }
    if (q.district) parts.push('حي ' + q.district);
    if (q.priceMax) parts.push('حتى ' + ui.num(+q.priceMax) + ' ر.س');
    if (q.bedrooms) parts.push(q.bedrooms + ' غرف+');
    if (q.q) parts.push('«' + q.q + '»');
    return parts.join(' · ') || 'كل العقارات';
  }
  V['saved-searches'] = function () {
    shell('<div><h1>المفضلة والبحوث المحفوظة</h1></div><div data-saved><p class="muted">جارٍ التحميل…</p></div><div class="grid-cards" data-favs style="grid-template-columns:repeat(3,1fr)"></div>');
    var feature = !(MZ.config.features && MZ.config.features.savedSearches === false);
    (feature ? auth.request('/me/saved-searches') : Promise.resolve({ items: [] })).then(function (r) {
      var box = main().querySelector('[data-saved]');
      if (!feature) { box.remove(); return; }
      box.outerHTML = panel('البحوث المحفوظة', r.items.length ? r.items.map(function (s) {
        var qs = new URLSearchParams(s.query).toString();
        return '<div class="trow" data-search="' + esc(s.id) + '"><div style="min-width:0"><b><a href="/properties' + (qs ? '?' + esc(qs) : '') + '">' + esc(s.name) + '</a></b><small>' + esc(searchSummary(s.query)) + ' · ' + (s.alertEnabled ? 'تنبيه يومي بالعقارات الجديدة' : 'التنبيه متوقف') + '</small></div>' +
          '<div style="display:flex;gap:10px;align-items:center">' + sw(s.alertEnabled, 'data-alert="' + esc(s.id) + '"', 'تنبيه ' + s.name) +
          '<button class="icon-btn" type="button" data-del-search="' + esc(s.id) + '" aria-label="حذف البحث">' + I('close') + '</button></div></div>';
      }).join('') : empty('search', 'لا توجد بحوث محفوظة', 'من صفحة العقارات اضغط «حفظ هذا البحث» لتصلك العقارات الجديدة المطابقة.', '<a class="btn btn--primary btn--sm" href="/properties">ابحث الآن</a>'));
    }).catch(fail);
    drawFavs();
  };
  function drawFavs() {
    var grid = main().querySelector('[data-favs]');
    auth.request('/me/favorites').then(function (r) {
      if (!r.ids.length) { grid.outerHTML = '<div data-favs>' + panel('العقارات المحفوظة', empty('heart', 'لا توجد عقارات محفوظة', 'اضغط على ♡ في أي عقار لحفظه هنا.')) + '</div>'; return null; }
      return api.listProperties({ ids: r.ids, pageSize: 100 }).then(function (list) {
        var byId = {}; list.items.forEach(function (p) { byId[p.id] = p; });
        grid.innerHTML = r.ids.map(function (id) { return byId[id] ? ui.card(byId[id]) : ''; }).join('');
      });
    }).catch(fail);
  }
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-alert]');
    if (t) {
      var on = t.getAttribute('aria-checked') !== 'true';
      t.classList.toggle('on', on); t.setAttribute('aria-checked', on);
      auth.request('/me/saved-searches/' + encodeURIComponent(t.dataset.alert), { method: 'PATCH', body: { alertEnabled: on } })
        .then(function () { ui.toast(on ? 'تم تفعيل التنبيه' : 'تم إيقاف التنبيه'); })
        .catch(function (err) { t.classList.toggle('on', !on); t.setAttribute('aria-checked', !on); fail(err); });
      return;
    }
    var d = e.target.closest('[data-del-search]');
    if (d && window.confirm('حذف البحث المحفوظ؟')) {
      auth.request('/me/saved-searches/' + encodeURIComponent(d.dataset.delSearch), { method: 'DELETE' })
        .then(function () { var row = d.closest('[data-search]'); if (row) row.remove(); ui.toast('تم حذف البحث'); })
        .catch(fail);
    }
  });
  document.addEventListener('mz:fav', function () { if (page === 'saved-searches') setTimeout(drawFavs, 300); });

  /* ---------- settings (design c-settings) ---------- */
  var PREF_GROUPS = [
    ['حالة الحجز والمدفوعات', ['booking.created', 'booking.confirmed', 'booking.expired', 'booking.cancelled', 'booking.completed', 'payment.paid', 'payment.failed', 'payment.transfer_approved', 'payment.transfer_rejected', 'payment.refunded']],
    ['مواعيد المعاينة', ['viewing.confirmed', 'viewing.reminder']],
    ['عقارات جديدة تطابق بحوثي', ['property.matched_saved_search']],
    ['تغيّر أسعار المفضلة وحالتها', ['property.price_dropped', 'property.status_changed']],
    ['تسجيل دخول جديد', ['security.new_login']]
  ];
  var prefs = [];
  V.settings = function () {
    shell('<div><h1>الملف والإعدادات</h1></div><div class="g2e" data-row1><p class="muted">جارٍ التحميل…</p></div><div data-row2></div>');
    Promise.all([auth.request('/me/profile'), auth.request('/me/notification-preferences')]).then(function (r) {
      prefs = r[1].items;
      drawSettings(r[0]);
    }).catch(fail);
  };
  function prefRow(g) {
    var items = prefs.filter(function (p) { return g[1].indexOf(p.eventKey) !== -1; });
    if (!items.length) return '';
    var locked = items.every(function (p) { return p.locked; });
    var inApp = items.some(function (p) { return p.inApp; }), email = items.some(function (p) { return p.email; });
    var chans = [inApp ? 'داخل المنصة' : '', email ? 'البريد' : ''].filter(Boolean).join(' + ') || 'متوقف';
    return '<div class="trow"><div><b>' + g[0] + '</b><small>' + (locked ? 'إشعار أساسي لا يمكن إيقافه' : chans) + '</small></div>' +
      '<div class="pref-sw">' +
        '<label>المنصة ' + sw(inApp, 'data-pref="' + esc(g[0]) + '" data-ch="inApp"' + (locked ? ' disabled' : ''), g[0] + ' داخل المنصة') + '</label>' +
        '<label>البريد ' + sw(email, 'data-pref="' + esc(g[0]) + '" data-ch="email"' + (locked ? ' disabled' : ''), g[0] + ' بالبريد') + '</label>' +
      '</div></div>';
  }
  function drawSettings(p) {
    var badges = (p.emailVerified ? '<span class="pill p-green">✓ البريد موثّق</span>' : '') + (p.phoneVerified ? ' <span class="pill p-green">✓ الجوال موثّق</span>' : '') + (p.nafathVerified ? ' <span class="pill p-green">✓ نفاذ</span>' : '');
    var profile = '<form data-profile novalidate><div class="form2">' +
      '<div class="field"><label for="p-name">الاسم الكامل</label><input id="p-name" class="input" maxlength="80" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label for="p-phone">الجوال</label><input id="p-phone" class="input" dir="ltr" inputmode="tel" value="' + esc(phone(p.phone)) + '"></div>' +
      '<div class="field" style="grid-column:1/-1"><label for="p-email">البريد الإلكتروني</label><input id="p-email" class="input" dir="ltr" type="email" value="' + esc(p.email || '') + '"><small class="muted">تغيير البريد يتطلب رمز تحقق يُرسل إلى البريد الجديد.</small></div>' +
      '</div><label class="check" style="margin-top:12px"><input type="checkbox" id="p-mkt"' + (p.marketingConsent ? ' checked' : '') + '>أرغب في استلام عروض وأخبار المكتب بالبريد</label>' +
      '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + badges + '<span style="flex:1"></span><button class="btn btn--primary btn--sm" type="submit">حفظ التغييرات</button></div>' +
      '<span class="field-err" data-p-err></span></form>';
    main().querySelector('[data-row1]').innerHTML = panel('بياناتي', profile) + panel('تفضيلات الإشعارات', PREF_GROUPS.map(prefRow).join(''));
    main().querySelector('[data-row2]').outerHTML =
      panel('الأمان', '<div class="trow"><div><b>' + (p.hasPassword ? 'تغيير كلمة المرور' : 'تعيين كلمة مرور') + '</b><small>اختياري — الدخول برمز البريد يبقى متاحاً دائماً</small></div><button class="btn btn--ghost btn--sm" type="button" data-set-pass>' + (p.hasPassword ? 'تغيير' : 'تعيين') + '</button></div>' +
        '<div class="trow"><div><b>تسجيل الخروج من جميع الأجهزة</b><small>ينهي كل الجلسات المفتوحة لحسابك</small></div><button class="btn btn--ghost btn--sm" type="button" data-revoke-all>إنهاء الجلسات</button></div>') +
      panel('الخصوصية', '<div class="trow"><div><b>تنزيل بياناتي</b><small>وفق نظام حماية البيانات الشخصية</small></div><button class="btn btn--ghost btn--sm" type="button" data-export>طلب نسخة</button></div>' +
        '<div class="trow"><div><b>حذف الحساب</b><small>تُحذف بياناتك خلال 30 يوماً عدا ما يلزم نظاماً</small></div><button class="btn btn--ghost btn--sm" type="button" style="color:var(--st-sold)" data-delete-account>حذف الحساب</button></div>');
    main().querySelector('[data-profile]').addEventListener('submit', function (e) { e.preventDefault(); saveProfile(p, e.target); });
  }
  function saveProfile(p, form) {
    var err = form.querySelector('[data-p-err]'); err.textContent = '';
    var name = form.querySelector('#p-name').value.trim(), ph = form.querySelector('#p-phone').value.replace(/\s/g, ''), email = form.querySelector('#p-email').value.trim().toLowerCase();
    var body = { name: name, marketingConsent: form.querySelector('#p-mkt').checked };
    if (name.length < 2) { err.textContent = 'أدخل اسمك'; return; }
    if (ph.replace(/\D/g, '') !== String(p.phone || '').replace(/\D/g, '')) {
      if (ph && !ui.validPhone(ph)) { err.textContent = 'رقم الجوال غير صحيح (05XXXXXXXX)'; return; }
      body.phone = ph;
    }
    if (email && email !== p.email) body.email = email;
    auth.request('/me/profile', { method: 'PATCH', body: body }).then(function (r) {
      if (r.pendingEmail) verifyEmail(r.pendingEmail); else ui.toast('تم حفظ التغييرات');
      drawSettings(r.customer);
    }).catch(function (e2) {
      err.textContent = e2.fields && e2.fields.phone ? 'رقم الجوال غير صحيح' : e2.fields && e2.fields.email ? 'البريد الإلكتروني غير صحيح' : e2.message;
    });
  }
  function verifyEmail(email) {
    var m = ui.openModal('<div class="auth-card"><div class="auth-ic">' + I('mail') + '</div><h2 class="auth-title">تأكيد البريد الجديد</h2><p class="muted">أرسلنا رمزاً من 6 أرقام إلى <b dir="ltr">' + esc(email) + '</b></p>' +
      '<form class="auth-form" data-verify novalidate><div class="field"><label for="v-code">رمز التحقق</label><input id="v-code" class="input" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div><span class="field-err" data-err></span>' +
      '<button class="btn btn--primary btn--block" type="submit">تأكيد</button></form></div>', { label: 'تأكيد البريد' });
    m.querySelector('[data-verify]').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = m.querySelector('#v-code').value.replace(/\D/g, '');
      auth.request('/me/profile/verify-email', { body: { email: email, code: code } }).then(function (p) {
        ui.closeModal(); ui.toast('تم تحديث البريد الإلكتروني'); drawSettings(p);
      }).catch(function (e2) { m.querySelector('[data-err]').textContent = e2.message; });
    });
  }
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-pref]');
    if (t && !t.disabled) {
      var g = PREF_GROUPS.filter(function (x) { return x[0] === t.dataset.pref; })[0], ch = t.dataset.ch;
      var on = t.getAttribute('aria-checked') !== 'true';
      var items = prefs.filter(function (p) { return g[1].indexOf(p.eventKey) !== -1 && !p.locked; }).map(function (p) {
        var x = { eventKey: p.eventKey, inApp: p.inApp, email: p.email, sms: p.sms }; x[ch] = on; return x;
      });
      if (!items.length) return;
      auth.request('/me/notification-preferences', { method: 'PUT', body: { items: items } }).then(function (r) {
        prefs = r.items; ui.toast('تم حفظ التفضيلات');
        var row = t.closest('.trow'); row.outerHTML = prefRow(g);
      }).catch(fail);
      return;
    }
    if (e.target.closest('[data-export]')) {
      auth.request('/me/export').then(function (data) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = 'my-data.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        ui.toast('تم تنزيل نسخة من بياناتك');
      }).catch(fail);
      return;
    }
    if (e.target.closest('[data-revoke-all]')) {
      if (!window.confirm('تسجيل الخروج من جميع الأجهزة، بما فيها هذا الجهاز؟')) return;
      auth.request('/me/sessions/revoke-all', { body: {} }).then(function () { auth.logout(); }).catch(fail);
      return;
    }
    if (e.target.closest('[data-delete-account]')) {
      if (!window.confirm('حذف حسابك نهائياً؟ سيُسجَّل خروجك فوراً، وتُحذف بياناتك خلال 30 يوماً عدا ما يلزم نظاماً.')) return;
      auth.request('/me', { method: 'DELETE' }).then(function () { ui.toast('تم استلام طلب حذف الحساب'); auth.logout(); }).catch(fail);
      return;
    }
    if (e.target.closest('[data-set-pass]')) setPassword();
  });
  function setPassword() {
    var m = ui.openModal('<div class="auth-card"><div class="auth-ic">' + I('shield') + '</div><h2 class="auth-title">كلمة المرور</h2><p class="muted">12 حرفاً على الأقل. يمكنك دائماً الدخول برمز البريد.</p>' +
      '<form class="auth-form" data-pass novalidate><div class="field"><label for="np1">كلمة المرور الجديدة</label><input id="np1" class="input" type="password" dir="ltr" autocomplete="new-password" minlength="12" maxlength="128"></div>' +
      '<div class="field"><label for="np2">تأكيد كلمة المرور</label><input id="np2" class="input" type="password" dir="ltr" autocomplete="new-password"></div><span class="field-err" data-err></span>' +
      '<button class="btn btn--primary btn--block" type="submit">حفظ</button></form></div>', { label: 'كلمة المرور' });
    m.querySelector('[data-pass]').addEventListener('submit', function (e) {
      e.preventDefault();
      var a = m.querySelector('#np1').value, b = m.querySelector('#np2').value, er = m.querySelector('[data-err]');
      if (a.length < 12) { er.textContent = 'كلمة المرور يجب ألا تقل عن 12 حرفاً'; return; }
      if (a !== b) { er.textContent = 'كلمتا المرور غير متطابقتين'; return; }
      auth.request('/auth/customer/password/set', { body: { newPassword: a } }).then(function () { ui.closeModal(); ui.toast('تم حفظ كلمة المرور'); })
        .catch(function (e2) { er.textContent = e2.message; });
    });
  }

  /* ---------- render ---------- */
  function render() {
    if (!auth.enabled()) {
      root.innerHTML = '<div class="acc"><div class="container">' + empty('user', 'حساب العميل غير متاح حالياً', '', '<a class="btn btn--primary" href="/">الرئيسية</a>') + '</div></div>';
      return;
    }
    if (!auth.user()) return loginGate();
    (V[page] || V.index)();
  }
  auth.init().then(render);
  auth.onChange(function (u) { if (!u) loginGate(); });
})(window.MZ);
});
