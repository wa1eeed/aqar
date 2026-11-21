(function (MZ) {
  MZ.boot().then(function () {
  var S = MZ.schema, ui = MZ.ui, api = MZ.api;
  ui.mount('home');

  /* ---------- Search panel ---------- */
  var form = document.querySelector('[data-search]');
  var offer = 'sale';
  var PRICES = {
    sale: [500000, 1000000, 2000000, 3000000, 5000000, 10000000, 20000000],
    rent: [30000, 50000, 75000, 100000, 150000, 250000, 500000],
    investment: [5000000, 10000000, 25000000, 50000000, 100000000, 200000000]
  };
  var citySel = form.querySelector('#s-city'), typeSel = form.querySelector('#s-type'), priceSel = form.querySelector('#s-price');
  S.cities.forEach(function (c) { citySel.insertAdjacentHTML('beforeend', '<option value="' + c.id + '">' + c.label + '</option>'); });
  function fillTypes() {
    typeSel.innerHTML = '<option value="">كل الأنواع</option>' + Object.keys(S.types).filter(function (k) { return S.types[k].offers.indexOf(offer) !== -1; })
      .map(function (k) { return '<option value="' + k + '">' + S.types[k].label + '</option>'; }).join('');
  }
  function fillPrices() {
    priceSel.innerHTML = '<option value="">بدون حد</option>' + PRICES[offer].map(function (v) { return '<option value="' + v + '">' + ui.moneyShort(v) + ' ريال' + (offer === 'rent' ? ' سنوياً' : '') + '</option>'; }).join('');
  }
  function fillDistricts() {
    var c = S.city(citySel.value), list = c ? c.districts : S.cities.reduce(function (a, c) { return a.concat(c.districts); }, []);
    form.querySelector('#s-districts').innerHTML = list.map(function (d) { return '<option value="' + d + '">'; }).join('');
  }
  fillTypes(); fillPrices(); fillDistricts();
  citySel.addEventListener('change', fillDistricts);
  form.querySelectorAll('[data-offer]').forEach(function (b) {
    b.addEventListener('click', function () {
      offer = b.dataset.offer;
      form.querySelectorAll('[data-offer]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      fillTypes(); fillPrices();
    });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = { offer: offer, city: citySel.value, priceMax: priceSel.value };
    if (typeSel.value) q.types = [typeSel.value];
    var text = form.querySelector('#s-q').value.trim();
    var c = S.city(citySel.value);
    var allDistricts = c ? c.districts : S.cities.reduce(function (a, c) { return a.concat(c.districts); }, []);
    if (text && allDistricts.indexOf(text) !== -1) q.district = text; else if (text) q.q = text;
    if (q.district && !q.city) S.cities.forEach(function (c) { if (c.districts.indexOf(q.district) !== -1) q.city = c.id; });
    ui.handoff(q);
    location.href = '/properties#' + offer;
  });

  /* ---------- Data-driven sections ---------- */
  api.getStats().then(function (st) {
    document.querySelector('[data-hero-stats]').innerHTML =
      '<div><b>' + st.total + '</b><span>عقار متاح الآن</span></div>' +
      '<div><b>' + Object.keys(st.byCity).length + '</b><span>مدن</span></div>' +
      '<div><b>' + Object.keys(st.byType).length + '</b><span>نوعاً من العقارات</span></div>';

    document.querySelector('[data-types]').innerHTML = Object.keys(S.types).map(function (k) {
      var t = S.types[k], n = st.byType[k] || 0;
      return '<a class="type-tile" href="/properties" data-goto-type="' + k + '">' + ui.icon(t.icon) + '<div><b>' + t.plural + '</b><br><span>' + (n ? n + ' عقار متاح' : 'قريباً') + '</span></div></a>';
    }).join('');

    var grads = ['#176149,#0A2F25', '#7C5A2C,#3E2B12', '#1F4E6B,#0E2738', '#5C3B5E,#2C1A2D', '#2F5D50,#132B24', '#6B4A2A,#2E2012'];
    document.querySelector('[data-cities]').innerHTML = S.cities.map(function (c, i) {
      return '<a class="city" style="--c-bg:linear-gradient(160deg,' + grads[i % grads.length] + ')" href="/properties" data-goto-city="' + c.id + '"><b>' + c.label + '</b><span>' + (st.byCity[c.id] || 0) + ' عقار' + ui.icon('arrowL') + '</span></a>';
    }).join('');
  });

  /* Featured */
  var featEl = document.querySelector('[data-featured]');
  function loadFeatured(o) {
    var N = 8;
    featEl.innerHTML = Array(N + 1).join('<div class="sk" style="height:430px"></div>');
    Promise.all([
      api.listProperties({ offer: o || undefined, hideClosed: true, sort: 'newest', pageSize: N, featured: true }),
      api.listProperties({ offer: o || undefined, hideClosed: true, sort: 'newest', pageSize: N })
    ]).then(function (rs) {
      var items = rs[0].items.slice(), ids = items.map(function (p) { return p.id; });
      rs[1].items.forEach(function (p) { if (items.length < N && ids.indexOf(p.id) === -1) items.push(p); });
      featEl.innerHTML = items.map(function (p) { return ui.card(p); }).join('');
    });
  }
  loadFeatured('');
  document.querySelectorAll('[data-feat-tabs] button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-feat-tabs] button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      loadFeatured(b.dataset.v);
    });
  });

  /* Investment */
  api.listProperties({ offer: 'investment', sort: 'roi_desc', pageSize: 3 }).then(function (r) {
    document.querySelector('[data-invest]').innerHTML = r.items.map(function (p) {
      var s = p.specs;
      return '<article class="icard">' +
        '<div class="icard__media"><img src="' + ui.img(p.images[0]) + '" alt="" loading="lazy">' +
          '<div class="card__top">' + ui.statusBadge(p) + '</div></div>' +
        '<div class="icard__body">' +
          '<h3><a href="/property#p-' + p.id + '">' + ui.esc(p.title) + '</a></h3>' +
          '<p class="icard__loc">' + ui.icon('pin') + p.district + '، ' + p.cityLabel + '</p>' +
          '<div class="kpis">' +
            '<div><span>قيمة الاستثمار</span><b>' + ui.moneyShort(p.price) + '</b></div>' +
            '<div><span>الدخل السنوي</span><b>' + (s.annualIncome ? ui.moneyShort(s.annualIncome) : '—') + '</b></div>' +
            '<div><span>العائد</span><b class="gold">' + (s.roi ? s.roi + '%' : '—') + '</b></div>' +
          '</div>' +
        '</div></article>';
    }).join('');
  });

  /* Services */
  var services = [
    ['handshake', 'البيع والشراء', 'تسعير مبني على صفقات الحي الفعلية، وتفاوض يحفظ حقك حتى الإفراغ.'],
    ['key', 'التأجير وإدارة الأملاك', 'تسويق الوحدات، توثيق العقود عبر إيجار، وتحصيل ومتابعة دورية.'],
    ['chart', 'الاستشارات الاستثمارية', 'دراسة العائد والمخاطر والبدائل قبل أن تتخذ القرار.'],
    ['doc', 'التقييم العقاري', 'تقييم بالتعاون مع مقيّمين معتمدين لأغراض البيع والتمويل والورث.']
  ];
  document.querySelector('[data-services]').innerHTML = services.map(function (s) {
    return '<div class="service"><div class="ic-wrap">' + ui.icon(s[0]) + '</div><h3>' + s[1] + '</h3><p>' + s[2] + '</p></div>';
  }).join('');

  /* Map teaser */
  var mapEl = document.querySelector('[data-home-map]');
  api.listProperties({ pageSize: 100, hideClosed: true }).then(function (r) {
    MZ.map.create(mapEl, { center: [24.75, 46.66], zoom: 11, scrollZoom: false }).then(function (m) {
      if (!m) return;
      var riyadh = r.items.filter(function (p) { return p.city === 'riyadh'; });
      riyadh.forEach(function (p) {
        m.marker(p.lat, p.lng, MZ.map.pricePin(p), { onClick: function () { location.href = '/property#p-' + p.id; }, title: p.title });
      });
      m.fit(riyadh.map(function (p) { return [p.lat, p.lng]; }), 50);
    });
  });
  });
})(window.MZ);
