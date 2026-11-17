/* =========================================================
   مكونات الواجهة المشتركة: الأيقونات، التنسيق، الهيدر، الفوتر،
   بطاقة العقار، المفضلة، النوافذ والتنبيهات.
   ========================================================= */
window.MZ = window.MZ || {};

(function (MZ) {
  var S = MZ.schema, cfg = MZ.config;

  /* ---------- Icons (stroke, 24px) ---------- */
  var P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>',
    bath: '<path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2zM6 12V6a2 2 0 0 1 3.5-1.3M7 19l-1 2M17 19l1 2"/>',
    area: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sofa: '<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v4H2z"/><path d="M5 17v2M19 17v2"/>',
    car: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M3 11h18"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1 0-2-1-2-2l1-1-1-2z"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    map: '<path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2z"/><path d="M9 4v14M15 6v14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    road: '<path d="M8 4 5 20M16 4l3 16M12 5v2M12 11v2M12 17v2"/>',
    layers: '<path d="m12 4 9 5-9 5-9-5z"/><path d="m3 14 9 5 9-5"/>',
    ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    palm: '<path d="M12 21c1-4 1-8 0-11"/><path d="M12 10c-2-3-6-3-8-1M12 10c2-3 6-3 8-1M12 10c-1-3-4-5-7-5M12 10c1-3 4-5 7-5"/>',
    land: '<path d="M3 18 8 9l4 6 3-4 6 7z"/><path d="M3 21h18"/>',
    villa: '<path d="M3 20h18M5 20V10l7-5 7 5v10"/><path d="M10 20v-5h4v5"/>',
    apartment: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M11 21v-3h2v3"/>',
    floor: '<path d="M3 20h18M4 20V12h16v8M4 12l8-6 8 6"/><path d="M8 16h3M13 16h3"/>',
    townhouse: '<path d="M2 20h20M3 20v-8l4-3 4 3v8M11 20v-8l4-3 4 3v8"/><path d="M6 20v-3h2v3M14 20v-3h2v3"/>',
    building: '<rect x="4" y="6" width="16" height="15" rx="1"/><path d="M4 6l8-3 8 3M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3"/>',
    tower: '<path d="M8 21V6l4-3 4 3v15M6 21h12"/><path d="M10 8h4M10 11h4M10 14h4M10 17h4"/>',
    office: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M8 8V5h8v3M3 13h18M11 13v2h2v-2"/>',
    showroom: '<path d="M3 9h18l-1.5-4h-15z"/><path d="M4 9v11h16V9M8 20v-6h8v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    warehouse: '<path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-7h10v7M7 16h10"/>',
    istiraha: '<path d="M2 18 12 6l10 12z"/><path d="M12 6v12M9 18l3-5 3 5"/>',
    farm: '<path d="M12 21v-9"/><path d="M12 12c-2-3-6-3-8-1M12 12c2-3 6-3 8-1M12 12c-1-3-4-5-7-5M12 12c1-3 4-5 7-5"/><path d="M3 21h18"/>',
    mosque: '<path d="M5 21v-8a7 7 0 0 1 14 0v8"/><path d="M12 6V3M3 21h18M10 21v-4a2 2 0 0 1 4 0v4"/><path d="M12 6a2 2 0 0 0 2-2"/>',
    school: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6"/>',
    health: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    pharmacy: '<rect x="4" y="9" width="16" height="7" rx="3.5" transform="rotate(-45 12 12.5)"/><path d="m9.5 10 5 5"/>',
    cart: '<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/>',
    park: '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21M9 21h6"/>',
    fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 10h10"/><path d="M15 8h2l2 2v7a1.5 1.5 0 0 1-3 0v-3h-1"/>',
    bank: '<path d="m3 9 9-5 9 5M5 9v9M9 9v9M15 9v9M19 9v9M3 21h18"/>',
    key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.5 11.5 8-8M16 7l2 2M18.5 4.5l2 2"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    chart: '<path d="M4 20h16M7 16v-4M12 16V8M17 16v-7"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6.5L14 17v4M10 11l1.5-4 3 2.5 2.5 1M11.5 7 8 9l-1 3"/>',
    drive: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    expand: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6"/>',
    x: '<path d="M4 4l16 16M20 4 4 20"/>',
    snap: '<path d="M12 3c3 0 5 2.2 5 5v2.5l2 .5-1.5 1.5c.5 1.5 2 2.5 3.5 3-1 .8-2.5.8-3 1.5l-.5 1.5c-1-.3-2-.2-3 .5-1 .7-2 1-2.5 1s-1.5-.3-2.5-1-2-.8-3-.5L7 17.5c-.5-.7-2-.7-3-1.5 1.5-.5 3-1.5 3.5-3L6 11.5 8 11V8c0-2.8 2-5 4-5z"/>',
    linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 10.5V16M8 8v.01M11.5 16v-5.5M11.5 13a2.5 2.5 0 0 1 5 0v3"/>',
    tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.5 4 5 4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h1M12 11h1M16 11h0M8 15h1M12 15h1M16 15v3M8 18h5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    handshake: '<path d="m2 12 4-4 4 2 3-2 5 1 4 4"/><path d="m6 13 4 4c.8.8 2 .8 2.8 0M10 15l2 2M12 13l3 3"/>',
    grid2: '<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.info) + '</svg>';
  }

  /* ---------- Formatting ---------- */
  var nf = new Intl.NumberFormat('en-US');
  function num(n) { return n == null ? '' : nf.format(n); }
  function money(n) { return num(n) + ' <span class="cur">' + cfg.currency + '</span>'; }
  function moneyShort(n) {
    if (n >= 1e6) return (+(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)) + ' مليون';
    if (n >= 1e3) return num(Math.round(n / 1e3)) + ' ألف';
    return num(n);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* مفتاح رسم محلي (بيانات تجريبية) أو رابط صورة كامل من الباك إند */
  function img(key) {
    if (!key) return '/assets/img/favicon.svg';
    if (/^(https?:)?\/|^data:/.test(key)) return key;
    return key.indexOf('.') !== -1 ? '/assets/img/' + key : '/assets/img/props/' + key + '.svg';
  }
  function priceSuffix(p) { return p.offer === 'rent' && p.rentPeriod ? ' / ' + S.rentPeriods[p.rentPeriod] : ''; }
  function dist(m) { return m < 1000 ? num(Math.round(m / 10) * 10) + ' م' : (m / 1000).toFixed(1) + ' كم'; }
  function ago(dateStr) {
    var d = Math.round((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
    if (d <= 0) return 'اليوم';
    if (d === 1) return 'أمس';
    if (d === 2) return 'قبل يومين';
    if (d <= 10) return 'قبل ' + d + ' أيام';
    if (d < 30) return 'قبل ' + d + ' يوماً';
    var m = Math.round(d / 30);
    return m === 1 ? 'قبل شهر' : m === 2 ? 'قبل شهرين' : 'قبل ' + m + ' أشهر';
  }

  function fieldValue(f, v) {
    if (v === undefined || v === null || v === '') return null;
    if (f.kind === 'bool') return v ? 'نعم' : 'لا';
    if (f.kind === 'select') return f.options[v] || v;
    if (f.kind === 'money') return money(v);
    if (f.kind === 'number') {
      if (v === 0 && f.zeroLabel) return f.zeroLabel;
      return num(v) + (f.unit ? ' ' + f.unit : '');
    }
    return esc(v);
  }

  /* ---------- Storage (safe) ---------- */
  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem('mz_' + k) || 'null');
      localStorage.setItem('mz_' + k, JSON.stringify(v));
    } catch (e) { return v === undefined ? null : undefined; }
  }
  var memFav = null;
  var fav = {
    list: function () { var l = store('fav'); if (l) memFav = l; return memFav || []; },
    has: function (id) { return fav.list().indexOf(String(id)) !== -1; },
    toggle: function (id) {
      id = String(id);
      var on = !fav.has(id);
      fav.set(id, on);
      if (fav.onToggle) fav.onToggle(id, on); // account sync (session.js)
      return on;
    },
    /* يضبط حالة عقار في المفضلة دون مزامنة (للتراجع أو للدمج بعد الدخول) */
    set: function (id, on) {
      id = String(id);
      var l = fav.list().filter(function (x) { return x !== id; });
      if (on) l.push(id);
      memFav = l; store('fav', l); updateFavCount();
      document.querySelectorAll('[data-fav="' + id + '"]').forEach(function (b) { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    },
    replace: function (ids) {
      memFav = ids.map(String); store('fav', memFav); updateFavCount();
      document.querySelectorAll('[data-fav]').forEach(function (b) { var on = fav.has(b.getAttribute('data-fav')); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    },
    onToggle: null
  };
  function updateFavCount() {
    var n = fav.list().length;
    document.querySelectorAll('[data-fav-count]').forEach(function (el) { el.textContent = n; el.hidden = !n; });
  }

  /* ---------- Badges ---------- */
  function offerBadge(p) { return '<span class="badge badge--' + p.offer + '">' + S.offers[p.offer].label + '</span>'; }
  function statusBadge(p, always) {
    if (p.status === 'available' && !always) return '';
    return '<span class="status status--' + p.status + '"><i></i>' + S.statuses[p.status].label + '</span>';
  }

  /* ---------- Property card ---------- */
  function keyFacts(p, max) {
    var s = p.specs, out = [];
    function add(ic, v, label) { if (v != null && v !== '') out.push('<li title="' + label + '">' + icon(ic) + '<span>' + v + '</span></li>'); }
    if (s.bedrooms != null) add('bed', s.bedrooms, 'غرف النوم');
    if (s.bathrooms != null && S.types[p.type].cat === 'residential') add('bath', s.bathrooms, 'دورات المياه');
    if (s.units != null) add('grid', s.units + ' وحدة', 'عدد الوحدات');
    if (s.floors != null && S.types[p.type].cat !== 'residential') add('layers', s.floors + ' أدوار', 'عدد الأدوار');
    if (s.landUse && p.type === 'land') add('land', S.field('landUse').options[s.landUse], 'استخدام الأرض');
    if (s.ceilingHeight != null) add('ruler', 'ارتفاع ' + s.ceilingHeight + ' م', 'ارتفاع السقف');
    if (s.palms != null && p.type === 'farm') add('palm', num(s.palms) + ' نخلة', 'النخيل');
    if (p.offer === 'investment' && s.roi) add('trend', s.roi + '% عائد', 'العائد السنوي');
    add('area', num(s.area) + ' م²', 'المساحة');
    return out.slice(0, max || 4).join('');
  }

  function card(p, opts) {
    opts = opts || {};
    var t = S.types[p.type], closed = S.isClosed(p.status), isFav = fav.has(p.id);
    var href = p.url || '/property#p-' + p.id;
    return '' +
      '<article class="card' + (closed ? ' card--closed' : '') + (opts.row ? ' card--row' : '') + '" data-id="' + p.id + '">' +
        '<a class="card__media" href="' + href + '" tabindex="-1" aria-hidden="true">' +
          '<img src="' + img(p.images[0]) + '" alt="" loading="lazy">' +
          (closed ? '<span class="stamp">' + S.statuses[p.status].label + '</span>' : '') +
        '</a>' +
        '<div class="card__top">' + offerBadge(p) + statusBadge(p) + '</div>' +
        '<button class="fav-btn' + (isFav ? ' is-on' : '') + '" type="button" data-fav="' + p.id + '" aria-pressed="' + isFav + '" aria-label="حفظ في المفضلة">' + icon('heart') + '</button>' +
        '<div class="card__body">' +
          '<div class="card__meta"><span class="type-chip">' + icon(t.icon) + t.label + '</span><span class="muted">' + ago(p.createdAt) + '</span></div>' +
          '<h3 class="card__title"><a href="' + href + '">' + esc(p.title) + '</a></h3>' +
          '<p class="card__loc">' + icon('pin') + esc(p.district) + '، ' + esc(p.cityLabel) + '</p>' +
          '<ul class="facts">' + keyFacts(p, opts.row ? 5 : 3) + '</ul>' +
          '<div class="card__foot">' +
            '<div class="price">' + money(p.price) + '<small>' + priceSuffix(p) + '</small></div>' +
            '<span class="code">' + p.code + '</span>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  /* ---------- Header / Footer ---------- */
  var NAV = [
    { href: '/', label: 'الرئيسية', id: 'home' },
    { href: '/properties', label: 'العقارات', id: 'properties' },
    { href: '/properties#sale', label: 'للبيع', id: 'sale' },
    { href: '/properties#rent', label: 'للإيجار', id: 'rent' },
    { href: '/properties#investment', label: 'للاستثمار', id: 'investment' },
    { href: '/about', label: 'من نحن', id: 'about' },
    { href: '/contact', label: 'تواصل معنا', id: 'contact' }
  ];

  function logo(light) {
    var custom = light ? (cfg.brand.logoLightUrl || cfg.brand.logoUrl) : cfg.brand.logoUrl;
    if (custom) {
      return '<a class="logo' + (light ? ' logo--light' : '') + '" href="/" aria-label="' + cfg.brand.fullName + ' — الرئيسية"><img src="' + esc(custom) + '" alt="' + cfg.brand.fullName + '" style="height:42px;width:auto"></a>';
    }
    return '<a class="logo' + (light ? ' logo--light' : '') + '" href="/" aria-label="' + cfg.brand.fullName + ' — الرئيسية">' +
      '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="currentColor"/><path d="M10 29V18l10-7 10 7v11" fill="none" stroke="#C9A86C" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 29v-6h8v6" fill="none" stroke="#FAF7F2" stroke-width="2.4" stroke-linejoin="round"/></svg>' +
      '<span><b>' + cfg.brand.name + '</b><small>للعقارات</small></span></a>';
  }

  function header(active) {
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '" class="nav__link' + (n.id === active ? ' is-active' : '') + '"' + (n.id === active ? ' aria-current="page"' : '') + '>' + n.label + '</a>';
    }).join('');
    return '' +
      '<a class="skip" href="#main">تخطَّ إلى المحتوى</a>' +
      '<header class="site-header"><div class="container site-header__in">' +
        logo() +
        '<nav class="nav" aria-label="القائمة الرئيسية">' + links + '</nav>' +
        '<div class="header-actions">' +
          '<span class="hdr-auth" data-auth-in></span>' +
          '<a class="icon-btn" href="/favorites" aria-label="المفضلة">' + icon('heart') + '<span class="dot-count" data-fav-count hidden></span></a>' +
          '<span class="hdr-auth" data-auth-out></span>' +
          '<a class="btn btn--primary btn--sm hide-sm" href="/contact#list">' + icon('plus') + 'اعرض عقارك</a>' +
          '<button class="icon-btn show-sm" type="button" data-menu-open aria-label="فتح القائمة" aria-expanded="false">' + icon('menu') + '</button>' +
        '</div>' +
      '</div></header>' +
      '<div class="drawer" data-menu hidden><div class="drawer__panel" role="dialog" aria-modal="true" aria-label="القائمة">' +
        '<div class="drawer__head">' + logo() + '<button class="icon-btn" type="button" data-menu-close aria-label="إغلاق القائمة">' + icon('close') + '</button></div>' +
        '<nav class="drawer__nav">' + links + '<a href="/favorites" class="nav__link">المفضلة</a></nav>' +
        '<div data-auth-drawer></div>' +
        '<a class="btn btn--primary btn--block" href="/contact#list">' + icon('plus') + 'اعرض عقارك</a>' +
      '</div></div>';
  }

  function footer() {
    var types = Object.keys(S.types).slice(0, 8).map(function (k) { return '<li><a href="/properties" data-goto-type="' + k + '">' + S.types[k].plural + '</a></li>'; }).join('');
    var cities = S.cities.map(function (c) { return '<li><a href="/properties" data-goto-city="' + c.id + '">عقارات ' + c.label + '</a></li>'; }).join('');
    return '' +
      '<footer class="site-footer"><div class="container">' +
        '<div class="footer-grid">' +
          '<div class="footer-brand">' + logo(true) +
            '<p>' + cfg.brand.tagline + '. نعرض عقارات مرخّصة للبيع والإيجار والاستثمار في أبرز مدن المملكة.</p>' +
            '<div class="social">' +
              ['x', 'instagram', 'snap', 'tiktok', 'linkedin'].map(function (s) { return '<a href="#" aria-label="' + s + '">' + icon(s) + '</a>'; }).join('') +
            '</div>' +
          '</div>' +
          '<div><h4>أنواع العقارات</h4><ul>' + types + '</ul></div>' +
          '<div><h4>المدن</h4><ul>' + cities + '</ul></div>' +
          '<div><h4>تواصل معنا</h4><ul class="contact-list">' +
            '<li>' + icon('phone') + '<span dir="ltr">' + cfg.contact.phoneDisplay + '</span></li>' +
            '<li>' + icon('mail') + '<span>' + cfg.contact.email + '</span></li>' +
            '<li>' + icon('pin') + '<span>' + cfg.brand.address + '</span></li>' +
            '<li>' + icon('clock') + '<span>' + cfg.contact.hours + '</span></li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="footer-legal">' +
          '<span>رخصة فال: ' + cfg.brand.falLicense + '</span><span>السجل التجاري: ' + cfg.brand.cr + '</span>' +
          '<span>جميع الإعلانات مرخّصة وفق اشتراطات الهيئة العامة للعقار</span>' +
        '</div>' +
        '<div class="footer-bottom"><span>© ' + new Date().getFullYear() + ' ' + cfg.brand.fullName + '. جميع الحقوق محفوظة.</span>' +
          '<span><a href="#">سياسة الخصوصية</a> · <a href="#">الشروط والأحكام</a></span></div>' +
      '</div></footer>' +
      '<div class="toast" role="status" aria-live="polite" data-toast></div>';
  }

  /* ---------- Toast / Modal ---------- */
  var toastT;
  function toast(msg) {
    var t = document.querySelector('[data-toast]'); if (!t) return;
    t.innerHTML = icon('check') + '<span>' + msg + '</span>'; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  var lastFocus;
  function openModal(html, opts) {
    opts = opts || {};
    closeModal();
    lastFocus = document.activeElement;
    var m = document.createElement('div');
    m.className = 'modal' + (opts.wide ? ' modal--wide' : '') + (opts.dark ? ' modal--dark' : '');
    m.setAttribute('data-modal', '');
    m.innerHTML = '<div class="modal__box" role="dialog" aria-modal="true"' + (opts.label ? ' aria-label="' + opts.label + '"' : '') + '>' +
      '<button class="icon-btn modal__x" type="button" data-modal-close aria-label="إغلاق">' + icon('close') + '</button>' + html + '</div>';
    document.body.appendChild(m);
    document.body.classList.add('no-scroll');
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-modal-close]')) closeModal(); });
    var f = m.querySelector('input,select,textarea,button:not(.modal__x)'); (f || m.querySelector('.modal__x')).focus();
    return m;
  }
  function closeModal() {
    var m = document.querySelector('[data-modal]');
    if (m) { m.remove(); document.body.classList.remove('no-scroll'); if (lastFocus) lastFocus.focus(); }
  }

  /* نقل الفلاتر بين الصفحات (يعمل مع أو بدون query string) */
  function handoff(q) {
    try { sessionStorage.setItem('mz_q', JSON.stringify(q)); } catch (e) { MZ._handoff = q; }
  }
  function takeHandoff() {
    var q = null;
    try { q = JSON.parse(sessionStorage.getItem('mz_q') || 'null'); sessionStorage.removeItem('mz_q'); } catch (e) { q = MZ._handoff || null; }
    return q;
  }

  /* ---------- Phone validation (Saudi) ---------- */
  function validPhone(v) { return /^(?:\+?966|0)?5\d{8}$/.test(String(v).replace(/[\s-]/g, '')); }

  /* ---------- Mount shared chrome ---------- */
  function mount(active) {
    var h = document.querySelector('[data-header]'), f = document.querySelector('[data-footer]');
    if (h) h.outerHTML = header(active);
    if (f) f.outerHTML = footer();
    updateFavCount();
    // حساب العميل والإشعارات (session.js، المرحلة 4)
    if (MZ.auth) { MZ.auth.renderHeader(); MZ.auth.init(); }

    var drawer = document.querySelector('[data-menu]'), opener = document.querySelector('[data-menu-open]');
    function setMenu(open) {
      drawer.hidden = !open; opener.setAttribute('aria-expanded', open);
      document.body.classList.toggle('no-scroll', open);
      if (open) drawer.querySelector('[data-menu-close]').focus(); else opener.focus();
    }
    if (opener) opener.addEventListener('click', function () { setMenu(true); });
    if (drawer) drawer.addEventListener('click', function (e) { if (e.target === drawer || e.target.closest('[data-menu-close]')) setMenu(false); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-modal]')) closeModal();
      else if (drawer && !drawer.hidden) setMenu(false);
    });

    var hdr = document.querySelector('.site-header');
    function onScroll() { hdr.classList.toggle('is-scrolled', window.scrollY > 8); }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    document.addEventListener('click', function (e) {
      var fb = e.target.closest('[data-fav]');
      if (fb) {
        e.preventDefault();
        var on = fav.toggle(fb.getAttribute('data-fav'));
        document.querySelectorAll('[data-fav="' + fb.getAttribute('data-fav') + '"]').forEach(function (b) { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
        toast(on ? 'أُضيف العقار إلى المفضلة' : 'أُزيل العقار من المفضلة');
        document.dispatchEvent(new CustomEvent('mz:fav'));
        return;
      }
      var gt = e.target.closest('[data-goto-type],[data-goto-city]');
      if (gt) {
        var q = {};
        if (gt.dataset.gotoType) q.types = [gt.dataset.gotoType];
        if (gt.dataset.gotoCity) q.city = gt.dataset.gotoCity;
        handoff(q);
      }
    });
  }

  /* ---------- Boot (docs/08 §1.4) ----------
     يجلب إعدادات الموقع من الباك إند (مخزّنة 5 دقائق في الجلسة) ويدمجها في MZ.config.
     إن تعذّر الوصول للباك إند يعمل الموقع بالبيانات التجريبية تلقائياً. */
  var booting = null;
  function escConfig(v) {
    if (typeof v === 'string') return esc(v);
    if (Array.isArray(v)) return v.map(escConfig);
    if (v && typeof v === 'object') { var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = escConfig(v[k]); return o; }
    return v;
  }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  function cachedJson(key, url) {
    try { var c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < 300000) return Promise.resolve(c.v); } catch (e) {}
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (v) { try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), v: v })); } catch (e) {} return v; });
  }
  function applyConfig(remote) {
    var r = escConfig(remote);
    Object.assign(cfg.brand, { name: r.brand.name, fullName: r.brand.fullName, tagline: r.brand.tagline, logoUrl: r.brand.logoUrl, logoLightUrl: r.brand.logoLightUrl });
    applyFavicon(remote.brand && remote.brand.faviconUrl);
    if (r.licensing.regaFalLicense) cfg.brand.falLicense = r.licensing.regaFalLicense;
    if (r.licensing.cr) cfg.brand.cr = r.licensing.cr;
    if (r.contact.address) cfg.brand.address = r.contact.address;
    Object.assign(cfg.contact, { phone: r.contact.phone, phoneDisplay: r.contact.phoneDisplay, whatsapp: r.contact.whatsapp, email: r.contact.email, hours: r.contact.hours, officeLat: r.contact.officeLat, officeLng: r.contact.officeLng, social: r.contact.social });
    cfg.licensing = r.licensing;
    cfg.features = r.features;
    cfg.booking = r.booking;
    if (r.nearby && r.nearby.radius) cfg.nearby.radius = r.nearby.radius;
    if (r.map) {
      cfg.map.provider = r.map.provider === 'google' && r.map.googleBrowserKey ? 'google' : 'osm';
      if (r.map.tilesUrl) cfg.map.tiles = remote.map.tilesUrl; // URL template: keep braces unescaped
      if (r.map.attribution) cfg.map.attribution = remote.map.attribution;
      cfg.map.googleApiKey = remote.map.googleBrowserKey || '';
    }
  }
  /* أيقونة الموقع من «الهوية والمظهر» (ملفات /brand/ المولّدة بعدة مقاسات) + manifest */
  function applyFavicon(url) {
    if (!/^\/brand\/favicon-[a-f0-9]+-512\.png$/.test(url || '')) return;
    function link(rel, href, sizes) {
      var el = document.querySelector('link[rel="' + rel + '"]' + (sizes ? '[sizes="' + sizes + '"]' : '')) || document.createElement('link');
      el.rel = rel; el.href = href; if (sizes) el.setAttribute('sizes', sizes);
      if (rel === 'icon') el.type = 'image/png';
      if (!el.parentNode) document.head.appendChild(el);
    }
    link('icon', url.replace('-512.png', '-32.png'));
    link('apple-touch-icon', url.replace('-512.png', '-180.png'));
    link('manifest', '/site.webmanifest');
  }
  function applySchema(remote) {
    if (!remote || !Array.isArray(remote.cities) || !remote.cities.length) return;
    S.cities.length = 0;
    escConfig(remote.cities).forEach(function (c) { S.cities.push(c); });
  }
  function useMock() {
    cfg.dataSource = 'mock';
    return MZ.MOCK_PROPERTIES ? Promise.resolve() : loadScript('/data/properties.js');
  }
  function boot() {
    if (booting) return booting;
    var forceMock = /[?&]mock=1\b/.test(location.search);
    try { if (localStorage.getItem('mz_mock') === '1') forceMock = true; } catch (e) {}
    if (forceMock || cfg.dataSource === 'mock') return (booting = useMock());
    booting = Promise.all([cachedJson('mz_cfg', cfg.apiBase + '/public/config'), cachedJson('mz_schema', cfg.apiBase + '/public/schema')])
      .then(function (r) { applyConfig(r[0]); applySchema(r[1]); })
      .catch(function () { return useMock(); });
    return booting;
  }
  MZ.boot = boot;

  MZ.ui = {
    icon: icon, num: num, money: money, moneyShort: moneyShort, esc: esc, img: img, ago: ago, dist: dist,
    priceSuffix: priceSuffix, fieldValue: fieldValue, card: card, keyFacts: keyFacts,
    offerBadge: offerBadge, statusBadge: statusBadge, fav: fav, toast: toast,
    openModal: openModal, closeModal: closeModal, mount: mount, handoff: handoff, takeHandoff: takeHandoff,
    validPhone: validPhone, store: store
  };
})(window.MZ);
