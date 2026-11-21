/* =========================================================
   طبقة حساب العميل — المصادقة (OTP) ونقاط /me/*
   تُحمّل بعد api.js وقبل ui.js.
   ========================================================= */
window.MZ = window.MZ || {};

(function (MZ) {
  var cfg = MZ.config;
  var AUTH = (cfg.apiBase || '/api/v1/public').replace(/\/public$/, ''); // '/api/v1'
  var isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  MZ.auth = { token: null, customer: null };
  try { MZ.auth.token = localStorage.getItem('mz_ct'); } catch (e) { /* ignore */ }

  function setToken(t) {
    MZ.auth.token = t || null;
    try { t ? localStorage.setItem('mz_ct', t) : localStorage.removeItem('mz_ct'); } catch (e) { /* ignore */ }
  }

  function http(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (MZ.auth.token) headers.Authorization = 'Bearer ' + MZ.auth.token;
    if (isDev) headers['X-Tenant'] = 'demo';
    return fetch(AUTH + path, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  MZ.me = {
    isLoggedIn: function () { return !!MZ.auth.token; },
    load: function () {
      if (!MZ.auth.token) return Promise.resolve(null);
      return http('/auth/me').then(function (c) { MZ.auth.customer = c; return c; })
        .catch(function () { setToken(null); MZ.auth.customer = null; return null; });
    },
    otpSend: function (destination) { return http('/auth/customer/otp/send', { method: 'POST', body: { channel: 'email', destination: destination } }); },
    otpVerify: function (destination, code, name) {
      return http('/auth/customer/otp/verify', { method: 'POST', body: { destination: destination, code: code, name: name } })
        .then(function (r) { setToken(r.accessToken); MZ.auth.customer = r.customer; return r; });
    },
    logout: function () { return http('/auth/logout', { method: 'POST' }).catch(function () {}).then(function () { setToken(null); MZ.auth.customer = null; }); },

    favorites: function () { return http('/me/favorites'); },
    addFav: function (id) { return http('/me/favorites/' + id, { method: 'PUT' }); },
    removeFav: function (id) { return http('/me/favorites/' + id, { method: 'DELETE' }); },
    /** يدمج المفضّلة المحلّية مع الخادم عند تسجيل الدخول. */
    syncFavorites: function () {
      if (!MZ.auth.token || !MZ.ui || !MZ.ui.fav) return Promise.resolve();
      return http('/me/favorites').then(function (ids) {
        var server = (ids || []).map(String);
        var local = MZ.ui.fav.list().map(String);
        var uploads = local.filter(function (id) { return server.indexOf(id) === -1; }).map(function (id) { return http('/me/favorites/' + id, { method: 'PUT' }); });
        var union = server.slice();
        local.forEach(function (id) { if (union.indexOf(id) === -1) union.push(id); });
        MZ.ui.fav.set(union);
        return Promise.all(uploads);
      }).catch(function () { /* ignore */ });
    },
    bookings: function () { return http('/me/bookings'); },
    booking: function (id) { return http('/me/bookings/' + id); },
    cancelBooking: function (id) { return http('/me/bookings/' + id + '/cancel', { method: 'POST' }); },
    quote: function (propertyId, paymentType) { return http('/me/bookings/quote', { method: 'POST', body: { propertyId: propertyId, paymentType: paymentType } }); },
    createBooking: function (body) { return http('/me/bookings', { method: 'POST', body: body }); },
    verifyPayment: function (id) { return http('/me/payments/' + id + '/verify', { method: 'POST' }); },
    presignTransfer: function (id, contentType) { return http('/me/payments/' + id + '/transfer/presign', { method: 'POST', body: { contentType: contentType } }); },
    uploadFile: function (url, headers, file) { return fetch(url, { method: 'PUT', headers: headers || {}, body: file }).then(function (r) { if (!r.ok) throw new Error('فشل رفع الملف'); }); },
    submitTransfer: function (id, body) { return http('/me/payments/' + id + '/transfer', { method: 'POST', body: body }); },
    viewings: function () { return http('/me/viewings'); },
    notifications: function () { return http('/me/notifications'); },
    readNotifications: function (ids) { return http('/me/notifications/read', { method: 'POST', body: ids ? { ids: ids } : { all: true } }); },
    setToken: setToken
  };

  /* التحديث اللحظي (Socket.IO) — اختياري، يسقط بصمت عند عدم التوفّر */
  MZ.rt = {
    _socket: null,
    _loading: false,
    _queue: [],
    connect: function (cb) {
      if (this._socket) { if (cb) cb(this._socket); return; }
      this._queue.push(cb);
      if (this._loading) return;
      this._loading = true;
      var self = this;
      var s = document.createElement('script');
      s.src = '/ws/socket.io.js';
      s.onload = function () {
        try {
          var token = MZ.auth && MZ.auth.token;
          self._socket = window.io({ path: '/ws', auth: token ? { token: token } : {}, transports: ['websocket', 'polling'] });
          self._queue.forEach(function (f) { if (f) f(self._socket); });
          self._queue = [];
        } catch (e) { /* unavailable */ }
      };
      s.onerror = function () { self._loading = false; };
      document.head.appendChild(s);
    },
    onProperty: function (id, handler) { this.connect(function (sock) { sock.emit('subscribe:property', { id: id }); sock.on('property.updated', handler); }); },
    on: function (ev, handler) { this.connect(function (sock) { sock.on(ev, handler); }); }
  };
})(window.MZ);
