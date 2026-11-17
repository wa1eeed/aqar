/* =========================================================
   حساب العميل والإشعارات اللحظية (docs/08 §3, §9 — المرحلة 4)
   - MZ.auth: دخول برمز يُرسل للبريد، جلسة العميل، طلبات /me
   - MZ.rt:   اتصال Socket.IO (تحديثات العقارات والإشعارات)
   - الهيدر: جرس الإشعارات + قائمة «حسابي» أو زر «دخول»
   رمز الدخول (access token) يبقى في sessionStorage لمدة صلاحيته فقط (15 دقيقة)،
   ورمز التجديد في كوكي httpOnly لا يصل إليه JavaScript.
   ========================================================= */
window.MZ = window.MZ || {};

(function (MZ) {
  var cfg = MZ.config, ui = MZ.ui, I = ui.icon, esc = ui.esc;
  var TOKEN_KEY = 'mz_at', HINT_KEY = 'mz_auth';
  var state = { token: null, exp: 0, user: null, unread: 0 };
  var listeners = [];

  function enabled() {
    return cfg.dataSource === 'api' && !(cfg.features && cfg.features.customerAccounts === false);
  }

  /* ---------- token storage ---------- */
  function saveToken(t, expiresIn) {
    state.token = t;
    state.exp = Date.now() + Math.max(30, (expiresIn || 900) - 30) * 1000;
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ t: t, exp: state.exp })); } catch (e) {}
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) {}
  }
  function loadToken() {
    try {
      var v = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (v && v.exp > Date.now()) { state.token = v.t; state.exp = v.exp; }
    } catch (e) {}
  }
  function clearSession() {
    state.token = null; state.exp = 0; state.user = null; state.unread = 0;
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(HINT_KEY); } catch (e) {}
  }
  function hinted() { try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return false; } }

  /* ---------- HTTP ---------- */
  function raw(path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json', 'X-Requested-With': 'nx' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (state.token && opts.auth !== false) headers.Authorization = 'Bearer ' + state.token;
    return fetch(cfg.apiBase + path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store'
    });
  }
  function toError(r) {
    return r.json().catch(function () { return {}; }).then(function (b) {
      var e = new Error((b.error && b.error.message) || 'تعذّر الاتصال بالخادم، حاول مرة أخرى');
      e.status = r.status; e.code = b.error && b.error.code;
      e.fields = (b.error && b.error.details && b.error.details.fields) || {};
      throw e;
    });
  }
  var refreshing = null;
  function refresh() {
    if (!refreshing) {
      refreshing = raw('/auth/refresh', { body: { audience: 'customer' }, auth: false })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
        .then(function (b) { saveToken(b.accessToken, b.expiresIn); return true; })
        .catch(function () { clearSession(); return false; })
        .then(function (ok) { setTimeout(function () { refreshing = null; }, 0); return ok; });
    }
    return refreshing;
  }
  /** Authenticated request with one silent refresh on 401. */
  function request(path, opts) {
    var go = function () { return raw(path, opts); };
    var ready = state.token && state.exp > Date.now() ? Promise.resolve(true) : refresh();
    return ready.then(go).then(function (r) {
      if (r.status !== 401) return r;
      return refresh().then(function (ok) {
        if (!ok) { setUser(null); return r; }
        return go();
      });
    }).then(function (r) {
      if (!r.ok) return toError(r);
      if (r.status === 204) return null;
      return r.json();
    });
  }

  /* ---------- session ---------- */
  function setUser(u) {
    var changed = (state.user && state.user.id) !== (u && u.id);
    state.user = u;
    if (!u) clearSession();
    renderHeader();
    if (changed) listeners.forEach(function (fn) { try { fn(u); } catch (e) {} });
  }
  function loadMe() {
    return request('/auth/me').then(function (me) {
      if (!me || me.typ !== 'customer') { setUser(null); return null; }
      setUser(me.customer);
      return me.customer;
    }).catch(function () { setUser(null); return null; });
  }
  var initP = null;
  function init() {
    if (initP) return initP;
    if (!enabled()) return (initP = Promise.resolve(null));
    loadToken();
    initP = (state.token || hinted() ? loadMe() : Promise.resolve(null)).then(function (u) {
      if (u) { refreshUnread(); MZ.rt.connect(); }
      return u;
    });
    return initP;
  }
  function afterLogin(accessToken, expiresIn) {
    saveToken(accessToken, expiresIn);
    return loadMe().then(function (u) {
      if (!u) return null;
      // Merge the browser's saved favorites into the account once (docs/08 §3).
      var local = ui.fav.list().map(Number).filter(function (n) { return n > 0; });
      return request('/me/favorites', { method: 'PUT', body: { ids: local.slice(0, 200) } })
        .then(function (r) { ui.fav.replace(r.ids.map(String)); })
        .catch(function () {})
        .then(function () { refreshUnread(); MZ.rt.reconnect(); return u; });
    });
  }
  function logout() {
    return raw('/auth/logout', { body: { audience: 'customer' }, auth: false }).catch(function () {}).then(function () {
      setUser(null);
      MZ.rt.reconnect();
      ui.toast('تم تسجيل الخروج');
      if (/^\/account/.test(location.pathname)) location.href = '/';
    });
  }

  /* ---------- favorites sync (optimistic, docs/08 §3) ---------- */
  ui.fav.onToggle = function (id, on) {
    if (!state.user) return;
    request('/me/favorites/' + encodeURIComponent(id), { method: on ? 'PUT' : 'DELETE' }).catch(function (e) {
      ui.fav.set(id, !on);
      ui.toast(e.message || 'تعذّر تحديث المفضلة');
    });
  };

  /* ---------- header: bell + account menu / «دخول» ---------- */
  function initial(n) { return esc(String(n || '؟').trim().charAt(0)); }
  var BELL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  function menuLinks() {
    return [
      ['/account', 'grid', 'حسابي'],
      ['/account/viewings', 'calendar', 'معايناتي'],
      ['/account/saved-searches', 'heart', 'المفضلة'],
      ['/account/notifications', null, 'الإشعارات'],
      ['/account/settings', 'user', 'الإعدادات']
    ];
  }
  function renderHeader() {
    var inSlot = document.querySelector('[data-auth-in]'), outSlot = document.querySelector('[data-auth-out]');
    var drawer = document.querySelector('[data-auth-drawer]');
    if (!inSlot || !outSlot) return;
    if (!enabled()) { inSlot.innerHTML = outSlot.innerHTML = ''; if (drawer) drawer.innerHTML = ''; return; }
    var u = state.user;
    if (!u) {
      inSlot.innerHTML = '';
      outSlot.innerHTML = '<button class="btn btn--ghost btn--sm hide-sm" type="button" data-login>' + I('user') + 'دخول</button>';
      if (drawer) drawer.innerHTML = '<button class="btn btn--ghost btn--block" type="button" data-login>' + I('user') + 'دخول / إنشاء حساب</button>';
      return;
    }
    outSlot.innerHTML = '';
    inSlot.innerHTML =
      '<div class="hdr-pop" data-pop="bell"><button class="icon-btn" type="button" data-pop-btn aria-expanded="false" aria-label="الإشعارات">' + BELL +
        '<span class="dot-count" data-unread' + (state.unread ? '' : ' hidden') + '>' + (state.unread > 99 ? '99+' : state.unread) + '</span></button>' +
        '<div class="hdr-menu hdr-menu--wide" data-pop-menu hidden><div class="hdr-menu__head"><b>الإشعارات</b><button type="button" class="link" data-read-all>تعليم الكل كمقروء</button></div>' +
        '<div class="hdr-notifs" data-bell-list><p class="muted" style="padding:14px">جارٍ التحميل…</p></div>' +
        '<a class="hdr-menu__all" href="/account/notifications">عرض الكل</a></div></div>' +
      '<div class="hdr-pop" data-pop="me"><button class="btn btn--ghost btn--sm hdr-me" type="button" data-pop-btn aria-expanded="false" aria-haspopup="menu">' +
        I('user') + '<span class="hide-sm">حسابي</span></button>' +
        '<div class="hdr-menu" data-pop-menu role="menu" hidden><div class="hdr-menu__who"><span class="avatar">' + initial(u.name) + '</span><div><b>' + esc(u.name) + '</b><small dir="ltr">' + esc(u.email || u.phone || '') + '</small></div></div>' +
        menuLinks().map(function (m) { return '<a role="menuitem" href="' + m[0] + '">' + (m[1] ? I(m[1]) : BELL) + m[2] + '</a>'; }).join('') +
        '<button type="button" role="menuitem" data-logout>' + I('arrowL') + 'تسجيل الخروج</button></div></div>';
    if (drawer) {
      drawer.innerHTML = '<div class="drawer__acc">' + menuLinks().map(function (m) { return '<a class="nav__link" href="' + m[0] + '">' + m[2] + '</a>'; }).join('') +
        '<button class="nav__link" type="button" data-logout style="text-align:start">تسجيل الخروج</button></div>';
    }
  }
  function setUnread(n) {
    state.unread = Math.max(0, n | 0);
    document.querySelectorAll('[data-unread]').forEach(function (el) {
      el.textContent = state.unread > 99 ? '99+' : state.unread; el.hidden = !state.unread;
    });
    document.dispatchEvent(new CustomEvent('mz:unread', { detail: state.unread }));
  }
  function refreshUnread() {
    if (!state.user) return;
    request('/me/notifications?pageSize=1').then(function (r) { setUnread(r.unread); }).catch(function () {});
  }
  function bellList() {
    var box = document.querySelector('[data-bell-list]'); if (!box) return;
    request('/me/notifications?pageSize=8').then(function (r) {
      setUnread(r.unread);
      box.innerHTML = r.items.length ? r.items.map(notifItem).join('') : '<p class="muted" style="padding:14px">لا توجد إشعارات</p>';
    }).catch(function () { box.innerHTML = '<p class="muted" style="padding:14px">تعذّر التحميل</p>'; });
  }
  function notifItem(n) {
    return '<a class="hdr-notif' + (n.readAt ? '' : ' is-unread') + '" href="' + esc(safeLink(n.link)) + '" data-notif="' + esc(n.id) + '"><b>' + esc(n.title) + '</b>' +
      (n.body ? '<span>' + esc(n.body) + '</span>' : '') + '<small>' + esc(ago(n.createdAt)) + '</small></a>';
  }
  /** Only same-site relative links from notifications. */
  function safeLink(l) { return typeof l === 'string' && /^\/(?!\/)[^\s]*$/.test(l) ? l : '/account/notifications'; }
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'الآن';
    if (s < 3600) return 'قبل ' + Math.round(s / 60) + ' دقيقة';
    if (s < 86400) return 'قبل ' + Math.round(s / 3600) + ' ساعة';
    return 'قبل ' + Math.round(s / 86400) + ' يوم';
  }

  function closePops(except) {
    document.querySelectorAll('[data-pop]').forEach(function (p) {
      if (p === except) return;
      var m = p.querySelector('[data-pop-menu]'), b = p.querySelector('[data-pop-btn]');
      if (m && !m.hidden) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); }
    });
  }
  document.addEventListener('click', function (e) {
    var login = e.target.closest('[data-login]');
    if (login) { e.preventDefault(); openLogin(); return; }
    if (e.target.closest('[data-logout]')) { e.preventDefault(); logout(); return; }
    var btn = e.target.closest('[data-pop-btn]');
    if (btn) {
      var pop = btn.closest('[data-pop]'), menu = pop.querySelector('[data-pop-menu]');
      closePops(pop);
      menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden && pop.dataset.pop === 'bell') bellList();
      return;
    }
    if (e.target.closest('[data-read-all]')) {
      request('/me/notifications/read', { body: { all: true } }).then(function (r) { setUnread(r.unread); bellList(); }).catch(function () {});
      return;
    }
    var n = e.target.closest('[data-notif]');
    if (n) request('/me/notifications/read', { body: { ids: [n.dataset.notif] } }).catch(function () {});
    if (!e.target.closest('[data-pop]')) closePops();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePops(); });

  /* ---------- OTP login (docs/08 §3, design c-login / c-otp) ---------- */
  var RESEND_SEC = 60;
  function loginView(step, data) {
    data = data || {};
    var icon = '<div class="auth-ic">' + I(step === 'code' ? 'mail' : 'user') + '</div>';
    if (step === 'email') {
      return icon + '<h2 class="auth-title">الدخول إلى حسابك</h2><p class="muted">بدون كلمة مرور — نرسل لك رمز تحقق على بريدك.</p>' +
        '<form class="auth-form" data-step="email" novalidate><div class="field"><label for="auth-email">البريد الإلكتروني</label>' +
        '<input id="auth-email" class="input" type="email" dir="ltr" autocomplete="email" inputmode="email" required maxlength="254" value="' + esc(data.email || '') + '">' +
        '<span class="field-err" data-err></span></div>' +
        '<button class="btn btn--primary btn--block" type="submit">إرسال رمز التحقق</button>' +
        '<small class="muted">بالمتابعة توافق على الشروط وسياسة الخصوصية</small></form>';
    }
    if (step === 'code') {
      var boxes = '';
      for (var i = 0; i < 6; i++) boxes += '<input class="otp-box" inputmode="numeric" autocomplete="' + (i ? 'off' : 'one-time-code') + '" maxlength="1" aria-label="الرقم ' + (i + 1) + '" data-otp="' + i + '">';
      return icon + '<h2 class="auth-title">أدخل رمز التحقق</h2><p class="muted">أرسلنا رمزاً من 6 أرقام إلى <b dir="ltr">' + esc(data.email) + '</b></p>' +
        '<form class="auth-form" data-step="code" novalidate><div class="otp-row" dir="ltr">' + boxes + '</div><span class="field-err" data-err></span>' +
        '<button class="btn btn--primary btn--block" type="submit">تحقق ودخول</button>' +
        '<small class="muted" data-resend></small>' +
        '<button type="button" class="link" data-change-email style="font-size:13px">تغيير البريد</button></form>';
    }
    return icon + '<h2 class="auth-title">أكمل بياناتك</h2><p class="muted">مرة واحدة فقط، لنتمكن من التواصل معك بخصوص طلباتك.</p>' +
      '<form class="auth-form" data-step="profile" novalidate>' +
      '<div class="field"><label for="auth-name">الاسم</label><input id="auth-name" class="input" autocomplete="name" required minlength="2" maxlength="80"><span class="field-err" data-err-name></span></div>' +
      '<div class="field"><label for="auth-phone">رقم الجوال</label><input id="auth-phone" class="input" dir="ltr" inputmode="tel" autocomplete="tel" placeholder="05XXXXXXXX" required><span class="field-err" data-err-phone></span></div>' +
      '<label class="check"><input type="checkbox" id="auth-consent" required>أوافق على سياسة الخصوصية ومعالجة بياناتي</label><span class="field-err" data-err-consent></span>' +
      '<span class="field-err" data-err></span><button class="btn btn--primary btn--block" type="submit">إنشاء الحساب</button></form>';
  }

  /**
   * Login flow inside `host` (a modal box or an inline card). Resolves with the customer.
   * `onDone` runs after a successful login.
   */
  function mountLogin(host, onDone) {
    var data = { email: '', registrationToken: null };
    var timer = null;
    function show(step) {
      clearInterval(timer);
      host.innerHTML = loginView(step, data);
      var form = host.querySelector('form');
      if (step === 'code') wireOtp(form);
      var first = host.querySelector('input'); if (first) first.focus();
      form.addEventListener('submit', function (e) { e.preventDefault(); submit(step, form); });
      var change = host.querySelector('[data-change-email]');
      if (change) change.addEventListener('click', function () { show('email'); });
    }
    function err(form, msg, sel) { var el = form.querySelector(sel || '[data-err]'); if (el) el.textContent = msg || ''; }
    function busy(form, on) { var b = form.querySelector('[type=submit]'); b.disabled = on; b.classList.toggle('is-busy', on); }
    function sendCode() {
      return raw('/auth/customer/otp/send', { body: { channel: 'email', destination: data.email }, auth: false }).then(function (r) {
        if (!r.ok && r.status !== 204) return toError(r);
      });
    }
    function startResend(form) {
      var left = RESEND_SEC, el = form.querySelector('[data-resend]');
      function tick() {
        if (left > 0) { el.textContent = 'لم يصلك؟ إعادة الإرسال بعد ' + ('0' + Math.floor(left / 60)).slice(-2) + ':' + ('0' + (left % 60)).slice(-2); left--; return; }
        clearInterval(timer);
        el.innerHTML = 'لم يصلك؟ <button type="button" class="link" data-resend-now>إعادة الإرسال</button>';
        el.querySelector('[data-resend-now]').addEventListener('click', function () {
          sendCode().then(function () { ui.toast('أُعيد إرسال الرمز'); startResend(form); }, function (e2) { err(form, e2.message); });
        });
      }
      tick(); timer = setInterval(tick, 1000);
    }
    function wireOtp(form) {
      var boxes = [].slice.call(form.querySelectorAll('[data-otp]'));
      boxes.forEach(function (b, i) {
        b.addEventListener('input', function () {
          b.value = b.value.replace(/\D/g, '').slice(-1);
          if (b.value && i < 5) boxes[i + 1].focus();
          if (boxes.every(function (x) { return x.value; })) form.requestSubmit ? form.requestSubmit() : submit('code', form);
        });
        b.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); });
        b.addEventListener('paste', function (e) {
          var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 6);
          if (!t) return;
          e.preventDefault();
          boxes.forEach(function (x, j) { x.value = t[j] || ''; });
          (boxes[Math.min(t.length, 5)]).focus();
          if (t.length === 6) form.requestSubmit ? form.requestSubmit() : submit('code', form);
        });
      });
      startResend(form);
    }
    function submit(step, form) {
      err(form, '');
      if (step === 'email') {
        var email = form.querySelector('#auth-email').value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err(form, 'أدخل بريداً إلكترونياً صحيحاً');
        data.email = email; busy(form, true);
        sendCode().then(function () { show('code'); }, function (e) { busy(form, false); err(form, e.message); });
        return;
      }
      if (step === 'code') {
        var code = [].map.call(form.querySelectorAll('[data-otp]'), function (x) { return x.value; }).join('');
        if (!/^\d{6}$/.test(code)) return err(form, 'أدخل الرمز المكوّن من 6 أرقام');
        busy(form, true);
        raw('/auth/customer/otp/verify', { body: { destination: data.email, code: code }, auth: false })
          .then(function (r) { return r.ok ? r.json() : toError(r); })
          .then(function (b) {
            if (b.accessToken) return finish(b);
            data.registrationToken = b.registrationToken; show('profile');
          })
          .catch(function (e) {
            busy(form, false); err(form, e.message);
            form.querySelectorAll('[data-otp]').forEach(function (x) { x.value = ''; });
            form.querySelector('[data-otp]').focus();
          });
        return;
      }
      var name = form.querySelector('#auth-name').value.trim(), phone = form.querySelector('#auth-phone').value.trim();
      var consent = form.querySelector('#auth-consent').checked, bad = false;
      ['name', 'phone', 'consent'].forEach(function (k) { err(form, '', '[data-err-' + k + ']'); });
      if (name.length < 2) { err(form, 'أدخل اسمك', '[data-err-name]'); bad = true; }
      if (!ui.validPhone(phone)) { err(form, 'رقم الجوال غير صحيح (05XXXXXXXX)', '[data-err-phone]'); bad = true; }
      if (!consent) { err(form, 'الموافقة مطلوبة لإنشاء الحساب', '[data-err-consent]'); bad = true; }
      if (bad) return;
      busy(form, true);
      raw('/auth/customer/register', { body: { registrationToken: data.registrationToken, name: name, phone: phone, consent: true }, auth: false })
        .then(function (r) { return r.ok ? r.json() : toError(r); })
        .then(finish)
        .catch(function (e) {
          busy(form, false);
          if (e.fields && e.fields.phone) err(form, 'رقم الجوال غير صحيح أو مستخدم', '[data-err-phone]');
          else err(form, e.message);
        });
    }
    function finish(b) {
      clearInterval(timer);
      return afterLogin(b.accessToken, b.expiresIn).then(function (u) {
        ui.toast(b.isNew ? 'أهلاً بك! تم إنشاء حسابك' : 'تم تسجيل الدخول');
        if (onDone) onDone(u);
      });
    }
    show('email');
    return { destroy: function () { clearInterval(timer); } };
  }

  function openLogin(onDone) {
    if (!enabled()) return;
    var m = ui.openModal('<div class="auth-card" data-auth-host></div>', { label: 'الدخول إلى حسابك' });
    var flow = mountLogin(m.querySelector('[data-auth-host]'), function (u) { ui.closeModal(); if (onDone) onDone(u); });
    var obs = new MutationObserver(function () { if (!document.body.contains(m)) { flow.destroy(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  }

  /* ---------- Realtime (docs/08 §9) ---------- */
  var rt = (function () {
    var sock = null, loading = null, rooms = {}, handlers = {}, attempt = 0, retryT = null, stopped = false;
    function load() {
      if (window.io) return Promise.resolve();
      if (!loading) {
        loading = new Promise(function (res, rej) {
          var s = document.createElement('script'); s.src = '/ws/socket.io.js'; s.async = true;
          s.onload = res; s.onerror = function () { loading = null; rej(new Error('rt unavailable')); };
          document.head.appendChild(s);
        });
      }
      return loading;
    }
    function emit(ev, p) { (handlers[ev] || []).slice().forEach(function (fn) { try { fn(p || {}); } catch (e) {} }); }
    function retry() {
      if (stopped) return;
      clearTimeout(retryT);
      var delay = Math.min(30000, 1000 * Math.pow(2, attempt++)) + Math.random() * 500;
      retryT = setTimeout(function () {
        (state.user ? refresh() : Promise.resolve()).then(function () { if (sock) sock.connect(); });
      }, delay);
    }
    function connect() {
      if (cfg.dataSource !== 'api') return;
      stopped = false;
      load().then(function () {
        if (sock) return;
        sock = window.io({
          path: '/ws', transports: ['websocket'], reconnection: false,
          auth: function (cb) { cb(state.user && state.token ? { token: state.token } : {}); }
        });
        sock.on('connect', function () {
          attempt = 0;
          Object.keys(rooms).forEach(function (id) { sock.emit('subscribe:property', { id: +id }); });
        });
        sock.on('disconnect', retry);
        sock.on('connect_error', retry);
        sock.on('auth.invalid', function () { refresh().then(function () { reconnect(); }); });
        sock.onAny(function (ev, p) { emit(ev, p); });
      }).catch(function () {});
    }
    function reconnect() {
      if (!sock) return connect();
      sock.disconnect(); attempt = 0; clearTimeout(retryT);
      setTimeout(function () { sock.connect(); }, 50);
    }
    return {
      connect: connect,
      reconnect: reconnect,
      on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      subscribe: function (id) {
        rooms[id] = true; connect();
        if (sock && sock.connected) sock.emit('subscribe:property', { id: +id });
      }
    };
  })();

  rt.on('notification.count', function (p) { setUnread(+p.unread || 0); });
  rt.on('notification.new', function (p) {
    if (p && p.title) ui.toast(esc(p.title));
    document.dispatchEvent(new CustomEvent('mz:notification', { detail: p }));
  });

  MZ.rt = rt;
  MZ.auth = {
    init: init,
    user: function () { return state.user; },
    token: function () { return state.user && state.exp > Date.now() ? state.token : null; },
    request: request,
    openLogin: openLogin,
    mountLogin: mountLogin,
    logout: logout,
    onChange: function (fn) { listeners.push(fn); },
    unread: function () { return state.unread; },
    setUnread: setUnread,
    renderHeader: renderHeader,
    enabled: enabled
  };
})(window.MZ);
