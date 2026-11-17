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
    ['bookings', '/account/bookings', 'key', 'حجوزاتي'],
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
        return '<a href="' + n[1] + '"' + (n[0] === page || (page === 'booking' && n[0] === 'bookings') ? ' class="on" aria-current="page"' : '') + '>' + (n[2] ? I(n[2]) : BELL) + n[3] +
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
    shell('<div><h1>أهلاً ' + esc(String(u.name || '').split(' ')[0]) + '</h1><p class="muted">تابع حجوزاتك وطلباتك ومواعيد معايناتك من مكان واحد.</p></div><div data-home><p class="muted">جارٍ التحميل…</p></div>');
    Promise.all([auth.request('/me/viewings'), auth.request('/me/favorites'), auth.request('/me/notifications?pageSize=1'), auth.request('/me/bookings')]).then(function (r) {
      var v = r[0], favs = r[1].ids, bookings = r[3].items, now = Date.now();
      var upcoming = v.viewings.filter(function (x) { return (x.status === 'confirmed' || x.status === 'requested') && new Date(x.scheduledAt).getTime() > now; })
        .sort(function (a, b) { return new Date(a.scheduledAt) - new Date(b.scheduledAt); });
      var active = bookings.filter(function (b) { return ACTIVE.indexOf(b.status) !== -1; });
      var review = bookings.filter(function (b) { return b.status === 'awaiting_transfer_review'; })[0];
      var kpis = [['حجوزات نشطة', active.length], ['معاينات قادمة', upcoming.length], ['عقارات محفوظة', favs.length], ['إشعارات جديدة', r[2].unread]];
      var html = '<div class="kpis2" style="grid-template-columns:repeat(4,1fr)">' + kpis.map(function (k) { return '<div class="kpi2"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>'; }).join('') + '</div>';
      if (review) {
        html += '<div style="background:var(--gold-50);border:1px solid #EAD9B6;border-radius:16px;padding:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span class="avatar" style="background:var(--gold);color:var(--green-900)">!</span><div style="flex:1;min-width:200px"><b>إيصال تحويلك قيد المراجعة</b><div class="muted" style="font-size:14px">الحجز <span dir="ltr">' + esc(review.number) + '</span> · سنبلغك فور اعتماده.</div></div><a class="btn btn--primary btn--sm" href="' + bkUrl(review) + '">عرض الحجز</a></div>';
      }
      var next = upcoming[0];
      return publicProps(bookings.slice(0, 2).map(function (b) { return b.property.id; })).then(function (pubs) {
        if (bookings.length) html += panel('آخر الحجوزات', bookings.slice(0, 2).map(function (b) { return bkCard(b, pubs[b.property.id]); }).join('<div style="height:10px"></div>'), '<a class="link" href="/account/bookings" style="font-size:14px">كل الحجوزات</a>');
        html += panel('المعاينة القادمة', next ? viewingRow(next, true) : empty('calendar', 'لا توجد معاينات قادمة', 'اطلب معاينة من صفحة أي عقار وسنؤكد لك الموعد.', '<a class="btn btn--primary btn--sm" href="/properties">تصفّح العقارات</a>'));
        html += panel('آخر الطلبات', v.requests.length ? requestsTable(v.requests.slice(0, 5)) : empty('mail', 'لا توجد طلبات بعد', ''), '<a class="link" href="/account/viewings" style="font-size:14px">كل الطلبات</a>');
        document.querySelector('[data-home]').outerHTML = html;
      });
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

  /* ---------- bookings (docs/04, design c-bookings / c-booking-bank / c-booking-paid) ---------- */
  var BS = S.bookingStatuses, PM = S.paymentMethods, PT = S.paymentTypes;
  var ACTIVE = ['pending_payment', 'awaiting_transfer_review', 'confirmed'];
  var ENDED = ['expired', 'cancelled', 'refunded'];
  var SAR_NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  var DMY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Riyadh' });
  var BANKS = ['مصرف الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'البنك السعودي الفرنسي', 'البنك السعودي البريطاني (ساب)', 'البنك العربي الوطني', 'بنك البلاد', 'بنك الجزيرة', 'مصرف الإنماء', 'بنك الاستثمار السعودي', 'بنك الخليج الدولي', 'بنك آخر'];
  var FILE_LABEL = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' };
  var FIELD_MSG = {
    amount_mismatch: 'المبلغ المحوّل يجب أن يساوي المبلغ المستحق', invalid_date: 'تاريخ التحويل غير صحيح',
    too_large: 'حجم الملف أكبر من المسموح', invalid_type: 'نوع الملف غير مقبول', Required: 'هذا الحقل مطلوب', invalid_account: 'اختر الحساب الذي حوّلت إليه'
  };
  function sar(h) { return SAR_NF.format((+h || 0) / 100) + ' ر.س'; }
  function sarBig(h) { return SAR_NF.format((+h || 0) / 100) + ' <small style="font-size:16px">ر.س</small>'; }
  function stamp(iso) { return DMY.format(new Date(iso)) + ' ' + time(iso); }
  function ibanFmt(v) { return String(v || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim(); }
  function bkPill(s) { var x = BS[s] || { label: s, pill: 'p-gray' }; return pill([x.label, x.pill]); }
  function bkUrl(b) { return '/account/booking?b=' + encodeURIComponent(b.id); }
  function cover(pub) { return ui.img(pub && pub.images && pub.images[0]); }
  function where(b, pub) {
    var d = (pub && pub.district) || (b.property.district && b.property.district.nameAr) || '';
    return esc(b.property.code) + (d ? ' · ' + esc(d) : '');
  }
  function paidPayment(b) { return b.payments.filter(function (p) { return p.receiptNumber; })[0] || null; }
  function openPayment(b) {
    for (var i = b.payments.length - 1; i >= 0; i--) {
      if (['initiated', 'pending', 'rejected', 'under_review', 'failed'].indexOf(b.payments[i].status) !== -1) return b.payments[i];
    }
    return null;
  }
  /** Public listing data (cover image, district, URL) for the booked properties, keyed by id. */
  function publicProps(ids) {
    return MZ.api.getMany(ids.map(String)).then(function (list) {
      var m = {}; (list || []).forEach(function (p) { m[p.id] = p; }); return m;
    }).catch(function () { return {}; });
  }

  function bkCard(b, pub) {
    var paid = paidPayment(b), act;
    if (b.status === 'pending_payment') act = '<a class="btn btn--primary btn--sm" href="' + bkUrl(b) + '">إكمال الدفع</a>';
    else if (paid && (b.status === 'confirmed' || b.status === 'completed')) act = '<a class="btn btn--ghost btn--sm" href="' + bkUrl(b) + '">الإيصال</a>';
    else act = '<a class="btn ' + (b.status === 'awaiting_transfer_review' ? 'btn--primary' : 'btn--ghost') + ' btn--sm" href="' + bkUrl(b) + '">التفاصيل</a>';
    var label = (BS[b.status] || {}).label || b.status;
    if (b.status === 'expired') label = 'منتهي — لم يكتمل الدفع';
    return '<div class="bk-card"><img src="' + esc(cover(pub)) + '" alt="" loading="lazy"><div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      pill([label, (BS[b.status] || {}).pill || 'p-gray']) + '<span class="muted" style="font-size:13px" dir="ltr">' + esc(b.number) + '</span></div>' +
      '<b style="display:block;font-size:17px;margin-top:6px">' + esc(b.property.title) + '</b><div class="m"><span>' + I('pin') + where(b, pub) + '</span><span>' +
      (b.paymentType === 'deposit' ? 'عربون' : 'دفع كامل') + ': <b style="color:var(--ink)">' + sar(b.amountDue) + '</b></span><span>' + esc(PM[b.paymentMethod] || '') + '</span></div></div><div>' + act + '</div></div>';
  }

  V.bookings = function () {
    shell('<div><h1>حجوزاتي</h1></div><div class="seg" role="group" aria-label="تصفية الحجوزات" style="align-self:flex-start" data-bk-filter>' +
      [['all', 'الكل'], ['active', 'نشطة'], ['completed', 'مكتملة'], ['ended', 'منتهية']].map(function (f, i) {
        return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (i === 0) + '">' + f[1] + '</button>';
      }).join('') + '</div><div data-bk-list style="display:flex;flex-direction:column;gap:12px"><p class="muted">جارٍ التحميل…</p></div>');
    auth.request('/me/bookings').then(function (r) {
      return publicProps(r.items.map(function (b) { return b.property.id; })).then(function (pubs) {
        var list = document.querySelector('[data-bk-list]'), filter = 'all';
        function draw() {
          var rows = r.items.filter(function (b) {
            return filter === 'all' || (filter === 'active' && ACTIVE.indexOf(b.status) !== -1) ||
              (filter === 'completed' && b.status === 'completed') || (filter === 'ended' && ENDED.indexOf(b.status) !== -1);
          });
          list.innerHTML = rows.length ? rows.map(function (b) { return bkCard(b, pubs[b.property.id]); }).join('') :
            panel('', empty('key', r.items.length ? 'لا توجد حجوزات بهذا التصنيف' : 'لا توجد حجوزات بعد', r.items.length ? '' : 'احجز عقارك من صفحة العقار مباشرة، بعربون أو بالدفع الكامل.', r.items.length ? '' : '<a class="btn btn--primary btn--sm" href="/properties">تصفّح العقارات</a>'));
        }
        document.querySelector('[data-bk-filter]').addEventListener('click', function (e) {
          var b = e.target.closest('[data-f]'); if (!b) return;
          filter = b.dataset.f;
          this.querySelectorAll('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          draw();
        });
        draw();
      });
    }).catch(fail);
  };

  /* ---------- one booking: /account/booking?b={id}[&p={payment}&id={moyasar id}] ---------- */
  var cdTimer = null;
  function countdown(deadline) {
    return '<div class="countdown" data-cd="' + esc(deadline) + '" role="timer" aria-label="الوقت المتبقي"><span>--</span><span>:</span><span>--</span><span>:</span><span>--</span></div>';
  }
  function tickCountdowns() {
    clearInterval(cdTimer);
    function tick() {
      var els = document.querySelectorAll('[data-cd]');
      if (!els.length) { clearInterval(cdTimer); return; }
      els.forEach(function (el) {
        var left = Math.max(0, Math.floor((new Date(el.dataset.cd).getTime() - Date.now()) / 1000));
        var parts = [Math.floor(left / 3600), Math.floor(left / 60) % 60, left % 60].map(function (n) { return n < 10 ? '0' + n : String(n); });
        var s = el.querySelectorAll('span'); s[0].textContent = parts[0]; s[2].textContent = parts[1]; s[4].textContent = parts[2];
        if (!left && !el.dataset.done) { el.dataset.done = '1'; setTimeout(function () { if (page === 'booking') loadBooking(); }, 3000); }
      });
    }
    tick(); cdTimer = setInterval(tick, 1000);
  }
  function copyBtn(text, label) {
    return '<button type="button" class="link" data-copy="' + esc(text) + '" style="font-size:13px;display:inline-flex;gap:4px;align-items:center" aria-label="نسخ ' + esc(label || text) + '">' + I('copy') + (label ? '' : 'نسخ') + '</button>';
  }
  function steps(list) {
    return '<div class="steps2">' + list.map(function (s, i, a) {
      return '<div class="s"><div class="ln"><i class="' + (s[2] ? '' : 'o') + '">' + (s[2] ? '✓' : i + 1) + '</i>' + (i < a.length - 1 ? '<span></span>' : '') + '</div><div class="tx"><b>' + s[0] + '</b>' + (s[1] ? '<small>' + s[1] + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function propertyPanel(b, pub) {
    var url = (pub && pub.url) || ('/property/' + b.property.id);
    return panel('العقار', '<img src="' + esc(cover(pub)) + '" alt="" style="width:100%;height:150px;object-fit:cover;border-radius:12px">' +
      '<a href="' + esc(url) + '"><b style="display:block;margin-top:10px">' + esc(b.property.title) + '</b></a><div class="muted" style="font-size:13px">' + where(b, pub) + '</div>' +
      '<div class="cmp" style="margin-top:10px"><div class="k">نوع الدفع</div><div>' + (b.paymentType === 'deposit' ? 'عربون' : 'دفع كامل') + '</div><div class="k">الطريقة</div><div>' + esc(PM[b.paymentMethod] || '') + '</div>' +
      '<div class="k">الحالة</div><div>' + bkPill(b.status) + '</div></div>');
  }
  function cancelLink(b) {
    return (b.status === 'pending_payment' || b.status === 'awaiting_transfer_review')
      ? '<button type="button" class="btn btn--ghost btn--sm" data-bk-cancel style="align-self:flex-start">' + I('close') + 'إلغاء الحجز</button>' : '';
  }
  function head(b, title) {
    return '<div><div class="crumb"><a href="/account/bookings">حجوزاتي</a> / <span dir="ltr">' + esc(b.number) + '</span></div><h1>' + title + '</h1></div>';
  }

  function transferForm(b, na, pay) {
    var types = (na.acceptedFileTypes || []).map(function (t) { return FILE_LABEL[t] || t; }).join(' أو ');
    var accounts = na.accounts || [];
    var accField = accounts.length > 1
      ? field2('bt-acc', 'الحساب المحوَّل إليه', '<select id="bt-acc" class="select" name="bankAccountId">' + accounts.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.bankName) + ' — ' + esc(ibanFmt(a.iban).slice(-9)) + '</option>'; }).join('') + '</select>', 'bankAccountId')
      : '<input type="hidden" name="bankAccountId" value="' + esc(accounts[0] ? accounts[0].id : '') + '">';
    var today = new Date().toISOString().slice(0, 10);
    var u = auth.user();
    return '<form data-transfer="' + esc(pay.id) + '" novalidate>' +
      '<label class="dropzone" data-drop style="display:block;cursor:pointer">' + I('doc') + '<br><span data-drop-label>اسحب الإيصال هنا أو <b class="link">اختر ملفاً</b></span><br><small>' + esc(types) + ' · حتى ' + (+na.maxFileMb || 10) + ' ميجا</small>' +
        '<input type="file" name="receipt" accept="' + esc((na.acceptedFileTypes || []).join(',')) + '" hidden></label><span class="field-err" data-err="receipt"></span>' +
      '<div class="form2" style="margin-top:14px">' + accField +
        field2('bt-name', 'اسم المحوّل', '<input id="bt-name" class="input" name="senderName" required minlength="2" maxlength="120" autocomplete="name" value="' + esc(u.name || '') + '">', 'senderName') +
        field2('bt-bank', 'البنك المحوَّل منه', '<select id="bt-bank" class="select" name="senderBank">' + BANKS.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select>', 'senderBank') +
        field2('bt-amount', 'المبلغ المحوّل (ر.س)', '<input id="bt-amount" class="input" name="amount" inputmode="decimal" dir="ltr" style="text-align:right" value="' + SAR_NF.format(na.amount / 100) + '">', 'amount') +
        field2('bt-date', 'تاريخ التحويل', '<input id="bt-date" class="input" type="date" name="transferredAt" dir="ltr" style="text-align:right" max="' + today + '" value="' + today + '">', 'transferredAt') +
        field2('bt-ref', 'رقم العملية (اختياري)', '<input id="bt-ref" class="input" name="transferReference" maxlength="60" dir="ltr" style="text-align:right">', 'transferReference') +
      '</div><span class="field-err" data-err="_"></span><button class="btn btn--primary" type="submit" style="margin-top:14px">' + I('check') + 'إرسال الإيصال للمراجعة</button></form>';
  }
  function field2(id, label, control, name) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' + control + '<span class="field-err" data-err="' + name + '"></span></div>';
  }

  function drawBooking(b, pub) {
    var na = b.nextAction, pay = openPayment(b), paid = paidPayment(b), html = '';
    var isBank = na && na.type === 'bank_transfer';
    var pendingSteps = isBank && na.nextSteps && na.nextSteps.length ? na.nextSteps : ['نراجع الإيصال خلال 24 ساعة عمل', 'نؤكد الحجز ويصلك إشعار وبريد', 'يتواصل معك المستشار لإكمال الإجراءات'];
    var side = propertyPanel(b, pub);

    if (b.status === 'pending_payment' && isBank) {
      var rejected = pay && pay.status === 'rejected' && pay.transfer ? '<div class="closed-note" role="alert" style="margin:0">' + I('info') + '<span><b>لم نتمكن من اعتماد الإيصال السابق</b> — ' + esc(pay.transfer.rejectionReason || '') + '. ارفع إيصالاً صحيحاً قبل انتهاء المهلة.</span></div>' : '';
      html = head(b, 'إتمام الدفع بالتحويل البنكي') + '<div class="g2"><div style="display:flex;flex-direction:column;gap:18px">' + rejected +
        panel('', '<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap"><div><span class="muted">المبلغ المستحق</span><b style="display:block;font:700 32px var(--f-display);color:var(--green)">' + sarBig(na.amount) + '</b>' +
          '<span class="muted">' + esc(na.referenceHintAr || 'اكتب هذا المرجع في ملاحظات التحويل') + ': </span><b dir="ltr">' + esc(na.reference) + '</b> ' + copyBtn(na.reference) + '</div>' +
          '<div style="text-align:center"><span class="muted" style="font-size:13px">المهلة المتبقية لرفع الإيصال</span><div style="margin-top:6px">' + countdown(na.deadline) + '</div></div></div>') +
        panel('حوّل إلى أحد الحسابات التالية', '<div class="muted" style="margin-bottom:12px">' + (na.instructionsHtml || '') + '</div><div class="g2e">' + (na.accounts || []).map(function (a) {
          return '<div class="bank"><b>' + esc(a.bankName) + '</b><span class="muted" style="font-size:13px">اسم المستفيد: ' + esc(a.beneficiaryName) + '</span><div class="iban"><span>' + esc(ibanFmt(a.iban)) + '</span>' + copyBtn(String(a.iban).replace(/\s+/g, ''), 'الآيبان') + '</div></div>';
        }).join('') + '</div>') +
        panel('ارفع إيصال التحويل', transferForm(b, na, pay)) + cancelLink(b) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:18px">' + side + panel('ماذا يحدث بعد التحويل؟', steps(pendingSteps.map(function (s) { return [esc(s), '', 0]; }))) + '</div></div>';
    } else if (b.status === 'pending_payment') {
      var failed = pay && pay.status === 'failed';
      html = head(b, 'إتمام الدفع') + '<div class="g2"><div style="display:flex;flex-direction:column;gap:18px">' +
        (failed ? '<div class="closed-note" role="alert" style="margin:0">' + I('info') + '<span>لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى قبل انتهاء المهلة.</span></div>' : '') +
        panel('', '<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap"><div><span class="muted">المبلغ المستحق</span><b style="display:block;font:700 32px var(--f-display);color:var(--green)">' + sarBig(b.amountDue - b.amountPaid) + '</b>' +
          '<span class="muted">الحجز: </span><b dir="ltr">' + esc(b.number) + '</b></div><div style="text-align:center"><span class="muted" style="font-size:13px">المهلة المتبقية للدفع</span><div style="margin-top:6px">' + countdown(b.holdExpiresAt) + '</div></div></div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' + (na && na.type === 'redirect' && !failed
            ? '<a class="btn btn--primary" href="' + esc(na.url) + '" data-pay-link>' + I('shield') + 'ادفع الآن</a>'
            : '<button class="btn btn--primary" type="button" data-pay="' + esc(b.paymentMethod) + '">' + I('shield') + (failed ? 'إعادة المحاولة' : 'ادفع الآن') + '</button>') +
          '</div><small class="muted" style="display:flex;gap:6px;align-items:center;margin-top:12px">' + I('shield') + 'دفع آمن ومشفّر — لا نحتفظ ببيانات بطاقتك</small>') +
        '<div data-moyasar-host></div>' + cancelLink(b) + '</div><div style="display:flex;flex-direction:column;gap:18px">' + side + '</div></div>';
    } else if (b.status === 'awaiting_transfer_review') {
      var t = pay && pay.transfer;
      html = head(b, 'إيصالك قيد المراجعة') + '<div class="g2"><div style="display:flex;flex-direction:column;gap:18px">' +
        '<div style="background:var(--gold-50);border:1px solid #EAD9B6;border-radius:16px;padding:16px;display:flex;gap:14px;align-items:center"><span class="avatar" style="background:var(--gold);color:var(--green-900)">!</span><div style="flex:1"><b>استلمنا إيصال تحويلك</b><div class="muted" style="font-size:14px">الحجز <span dir="ltr">' + esc(b.number) + '</span> · سنراجعه ونبلغك فور اعتماده.</div></div></div>' +
        (t ? panel('بيانات التحويل', '<div class="cmp"><div class="k">المبلغ</div><div>' + sar(t.amount) + '</div><div class="k">اسم المحوّل</div><div>' + esc(t.senderName) + '</div><div class="k">البنك المحوَّل منه</div><div>' + esc(t.senderBank) + '</div>' +
          '<div class="k">إلى</div><div>' + esc(t.bankAccount ? t.bankAccount.bankName : '') + '</div><div class="k">تاريخ التحويل</div><div dir="ltr" style="text-align:right">' + esc(DMY.format(new Date(t.transferredAt))) + '</div></div>') : '') +
        cancelLink(b) + '</div><div style="display:flex;flex-direction:column;gap:18px">' + side + panel('ماذا يحدث بعد التحويل؟', steps(pendingSteps.map(function (s, i) { return [esc(s), '', i === 0 ? 0 : 0]; }))) + '</div></div>';
    } else if (b.status === 'confirmed' || b.status === 'completed') {
      var rent = b.property.offer === 'rent', agent = b.property.agent;
      var done = b.status === 'completed';
      var title = done ? 'اكتملت الصفقة' : (b.paymentType === 'deposit' ? 'تم دفع العربون بنجاح' : 'تم الدفع بنجاح');
      var receipt = paid ? '<div class="receipt" style="margin-top:20px"><div class="paper" style="width:100%;max-width:380px"><b style="text-align:center">إيصال دفع</b>' +
        '<div class="l"><span>رقم الإيصال</span><b dir="ltr">' + esc(paid.receiptNumber) + '</b></div><div class="l"><span>الحجز</span><span dir="ltr">' + esc(b.number) + '</span></div>' +
        '<div class="l"><span>المبلغ</span><b>' + sar(paid.amount) + '</b></div><div class="l"><span>الطريقة</span><span>' + esc(PM[paid.method] || '') + '</span></div>' +
        '<div class="l"><span>التاريخ</span><span>' + esc(stamp(paid.paidAt)) + '</span></div></div></div>' : '';
      html = head(b, done ? 'اكتملت الصفقة' : 'تم تأكيد حجزك') + '<div class="g2"><section class="panel2"><div class="pb" style="text-align:center;padding:34px">' +
        '<div style="width:72px;height:72px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;margin:0 auto">' + I('check') + '</div>' +
        '<h2 style="margin-top:14px">' + title + '</h2><p class="muted">تم حجز «' + esc(b.property.title) + '» باسمك' + (agent && !done ? '، وسيتواصل معك ' + esc(agent.name) + ' خلال ساعات العمل' : '') + '.</p>' + receipt +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">' +
          (paid ? '<button class="btn btn--primary btn--sm" type="button" data-receipt="' + esc(paid.id) + '" data-receipt-no="' + esc(paid.receiptNumber) + '">' + I('doc') + 'تنزيل الإيصال PDF</button>' : '') +
          (agent && agent.whatsapp ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(agent.whatsapp) + '?text=' + encodeURIComponent('بخصوص الحجز ' + b.number) + '">' + I('whatsapp') + 'تواصل مع المستشار</a>' : '') +
        '</div></div></section>' +
        panel('الخطوات التالية', steps([
          ['الحجز', done ? 'مكتمل' : 'مؤكد', 1],
          ['الدفع', sar(b.amountPaid) + ' ' + (b.paymentType === 'deposit' ? 'عربون' : ''), 1],
          [rent ? 'توقيع العقد في منصة إيجار' : 'توقيع العقد', done ? 'تم' : 'سيتواصل معك المستشار', done ? 1 : 0],
          [rent ? 'الاستلام' : 'الإفراغ', done ? 'تم' : (b.paymentType === 'deposit' ? 'بعد سداد المتبقي' : 'بعد توقيع العقد'), done ? 1 : 0]
        ])) + '</div>';
    } else {
      var msg = { expired: ['انتهت مهلة الحجز', 'لم يكتمل الدفع خلال المهلة، فأُلغي الحجز تلقائياً. يمكنك الحجز من جديد إن كان العقار ما زال متاحاً.'],
        cancelled: ['تم إلغاء الحجز', 'أُلغي هذا الحجز. إن كنت دفعت مبلغاً فسيتواصل معك فريقنا بخصوص الاسترداد.'],
        refunded: ['تم استرداد المبلغ', 'أُعيد المبلغ إلى وسيلة الدفع الأصلية.'] }[b.status] || [bkPill(b.status), ''];
      var url = (pub && pub.url) || ('/property/' + b.property.id);
      html = head(b, msg[0]) + '<div class="g2"><section class="panel2"><div class="pb" style="text-align:center;padding:34px">' + empty('clock', msg[0], msg[1],
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn--primary btn--sm" href="' + esc(url) + '">صفحة العقار</a><a class="btn btn--ghost btn--sm" href="/account/bookings">حجوزاتي</a></div>') +
        (paid ? '<button class="btn btn--ghost btn--sm" type="button" data-receipt="' + esc(paid.id) + '" data-receipt-no="' + esc(paid.receiptNumber) + '">' + I('doc') + 'تنزيل الإيصال PDF</button>' : '') +
        '</div></section><div style="display:flex;flex-direction:column;gap:18px">' + side + '</div></div>';
    }
    main().innerHTML = html;
    document.title = 'الحجز ' + b.number + ' — ' + (MZ.config.brand.fullName || '');
    tickCountdowns();
    bindTransfer(b);
  }

  function bindTransfer(b) {
    var f = document.querySelector('[data-transfer]');
    if (!f) return;
    var na = b.nextAction, input = f.querySelector('input[type=file]'), drop = f.querySelector('[data-drop]'), file = null;
    function setErr(name, msg) { var el = f.querySelector('[data-err="' + name + '"]'); if (el) el.textContent = msg || ''; }
    function pick(x) {
      setErr('receipt', '');
      if (!x) return;
      if ((na.acceptedFileTypes || []).indexOf(x.type) === -1) { setErr('receipt', FIELD_MSG.invalid_type); return; }
      if (x.size > (na.maxFileMb || 10) * 1024 * 1024) { setErr('receipt', 'حجم الملف أكبر من ' + na.maxFileMb + ' ميجابايت'); return; }
      file = x;
      f.querySelector('[data-drop-label]').innerHTML = I('check') + ' ' + esc(x.name) + ' <span class="link">تغيير</span>';
    }
    input.addEventListener('change', function () { pick(input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = 'var(--green)'; }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = ''; }); });
    drop.addEventListener('drop', function (e) { pick(e.dataTransfer.files[0]); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      f.querySelectorAll('[data-err]').forEach(function (x) { x.textContent = ''; });
      var name = f.senderName.value.trim(), amount = Number(String(f.amount.value).replace(/[,\s]/g, ''));
      var ok = true;
      if (!file) { setErr('receipt', 'ارفع صورة أو ملف الإيصال'); ok = false; }
      if (name.length < 2) { setErr('senderName', 'اكتب اسم المحوّل كما في الحساب البنكي'); ok = false; }
      if (!(amount > 0)) { setErr('amount', 'اكتب المبلغ المحوّل'); ok = false; }
      if (!f.transferredAt.value) { setErr('transferredAt', FIELD_MSG.invalid_date); ok = false; }
      if (!ok) return;
      var fd = new FormData();
      fd.append('bankAccountId', f.bankAccountId.value);
      fd.append('senderName', name);
      fd.append('senderBank', f.senderBank.value);
      if (f.transferReference.value.trim()) fd.append('transferReference', f.transferReference.value.trim());
      fd.append('transferredAt', new Date(f.transferredAt.value + 'T12:00:00+03:00').toISOString());
      fd.append('amount', String(amount));
      fd.append('receipt', file, file.name);
      var btn = f.querySelector('[type=submit]'); btn.disabled = true;
      auth.request('/me/payments/' + encodeURIComponent(f.dataset.transfer) + '/transfer', { body: fd }).then(function () {
        ui.toast('تم إرسال الإيصال للمراجعة'); loadBooking();
      }).catch(function (err) {
        btn.disabled = false;
        var fields = err.fields || {}, any = false;
        Object.keys(fields).forEach(function (k) { any = true; setErr(k, FIELD_MSG[fields[k]] || err.message); });
        if (!any) setErr('_', err.message);
      });
    });
  }

  function moyasarForm(na) {
    var host = document.querySelector('[data-moyasar-host]');
    if (!host) return;
    host.innerHTML = panel('بيانات الدفع', '<div data-mysr></div>');
    MZ.payments.moyasarForm(host.querySelector('[data-mysr]'), na);
  }
  /** What to do with a `nextAction` returned by POST /me/bookings/:id/pay. */
  function followAction(res, bookingId) {
    var na = res && res.nextAction;
    if (na && na.type === 'redirect' && /^https:\/\//.test(na.url)) { location.href = na.url; return true; }
    if (na && na.type === 'moyasar_form' && page === 'booking') { moyasarForm(na); return true; }
    if (res && res.paymentError) ui.toast(esc(res.paymentError));
    if (page !== 'booking') location.href = '/account/booking?b=' + encodeURIComponent(bookingId);
    return false;
  }

  var bookingId = null;
  function loadBooking() {
    return auth.request('/me/bookings/' + encodeURIComponent(bookingId)).then(function (b) {
      return MZ.api.getProperty(b.property.id).catch(function () { return null; }).then(function (pub) { drawBooking(b, pub); });
    }).catch(function (e) {
      if (e.status === 404) main().innerHTML = empty('key', 'الحجز غير موجود', '', '<a class="btn btn--primary btn--sm" href="/account/bookings">حجوزاتي</a>');
      else fail(e);
    });
  }
  V.booking = function () {
    var q = new URLSearchParams(location.search);
    bookingId = q.get('b');
    if (!bookingId) { location.replace('/account/bookings'); return; }
    shell('<p class="muted">جارٍ التحميل…</p>');
    var pid = q.get('p'), providerId = q.get('id');
    // Back from Moyasar: ask the server to re-fetch the payment (it never trusts the URL's status).
    var verify = pid ? auth.request('/me/payments/' + encodeURIComponent(pid) + '/verify', { body: providerId && /^[A-Za-z0-9_-]{6,80}$/.test(providerId) ? { providerPaymentId: providerId } : {} })
      .then(function (r) { if (r && r.status === 'failed') ui.toast('لم تكتمل عملية الدفع'); }).catch(function () {}) : Promise.resolve();
    verify.then(function () {
      if (pid) history.replaceState(null, '', '/account/booking?b=' + encodeURIComponent(bookingId));
      return loadBooking();
    });
  };
  // Live updates: the API pushes booking.updated / payment.updated to the customer's room.
  function onLive(p) {
    if (page === 'booking' && bookingId && p && (p.id === bookingId || p.bookingId === bookingId)) loadBooking();
  }
  MZ.rt.on('booking.updated', onLive);
  MZ.rt.on('payment.updated', onLive);

  root.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]');
    if (c) {
      var done = function () { ui.toast('تم النسخ'); };
      if (navigator.clipboard) navigator.clipboard.writeText(c.dataset.copy).then(done, function () {}); else done();
      return;
    }
    var r = e.target.closest('[data-receipt]');
    if (r) {
      r.disabled = true;
      auth.download('/me/payments/' + encodeURIComponent(r.dataset.receipt) + '/receipt.pdf', 'receipt-' + r.dataset.receiptNo + '.pdf')
        .catch(fail).then(function () { r.disabled = false; });
      return;
    }
    if (e.target.closest('[data-bk-cancel]')) {
      if (!window.confirm('إلغاء هذا الحجز؟ سيصبح العقار متاحاً لغيرك.')) return;
      auth.request('/me/bookings/' + encodeURIComponent(bookingId) + '/cancel', { body: {} }).then(function () { ui.toast('تم إلغاء الحجز'); loadBooking(); }).catch(fail);
      return;
    }
    var pb = e.target.closest('[data-pay]');
    if (pb) {
      pb.disabled = true;
      auth.request('/me/bookings/' + encodeURIComponent(bookingId) + '/pay', { body: { method: pb.dataset.pay } }).then(function (res) {
        if (!followAction(res, bookingId)) { pb.disabled = false; if (!res.nextAction) loadBooking(); }
      }).catch(function (err) { pb.disabled = false; fail(err); });
    }
  });

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
