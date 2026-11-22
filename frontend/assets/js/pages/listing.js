(function (MZ) {
  MZ.boot().then(function () {
  var S = MZ.schema, ui = MZ.ui, api = MZ.api, cfg = MZ.config;

  var DEFAULT = { offer: '', city: '', district: '', types: [], status: [], priceMin: '', priceMax: '', areaMin: '', areaMax: '', bedrooms: '', bathrooms: '', features: [], furnished: '', landUse: '', rentPeriod: '', constructionStatus: '', facade: '', roiMin: '', q: '', hideClosed: false, sort: 'newest', page: 1 };
  var state = clone(DEFAULT), view = 'grid';
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var hashOffer = { sale: 'sale', rent: 'rent', investment: 'investment' };
  function readHash() {
    var h = location.hash.replace('#', '');
    if (hashOffer[h]) { state.offer = h; ui.mount(h); return; }
    if (h === 'map') view = 'map';
    ui.mount('properties');
  }
  readHash();

  /* فلاتر قادمة من الصفحة الرئيسية أو رابط مع query string */
  var incoming = ui.takeHandoff() || {};
  try {
    var sp = new URLSearchParams(location.search);
    sp.forEach(function (v, k) { if (k in DEFAULT) incoming[k] = Array.isArray(DEFAULT[k]) ? v.split(',') : v; });
  } catch (e) {}
  Object.keys(incoming).forEach(function (k) { if (k in DEFAULT && incoming[k] !== undefined && incoming[k] !== '') state[k] = incoming[k]; });
  var savedView = ui.store('view'); if (savedView && !location.hash) view = savedView;

  var els = {
    layout: document.querySelector('[data-layout]'),
    body: document.querySelector('[data-filters-body]'),
    filters: document.querySelector('[data-filters]'),
    backdrop: document.querySelector('[data-filters-backdrop]'),
    results: document.querySelector('[data-results]'),
    wrap: document.querySelector('[data-results-wrap]'),
    count: document.querySelector('[data-count]'),
    active: document.querySelector('[data-active]'),
    pager: document.querySelector('[data-pager]'),
    sort: document.querySelector('[data-sort]'),
    title: document.querySelector('[data-title]'),
    crumb: document.querySelector('[data-crumb]')
  };

  /* view icons */
  document.querySelectorAll('[data-views] button').forEach(function (b) { b.innerHTML = ui.icon({ grid: 'grid', list: 'list', map: 'map' }[b.dataset.v]); });

  /* ---------- Context helpers ---------- */
  function typesInScope() {
    return Object.keys(S.types).filter(function (k) { return !state.offer || S.types[k].offers.indexOf(state.offer) !== -1; });
  }
  function selTypes() { return state.types.length ? state.types : typesInScope(); }
  function anyCat(cat) { return selTypes().some(function (t) { return S.types[t].cat === cat; }); }
  function anyType(list) { return selTypes().some(function (t) { return list.indexOf(t) !== -1; }); }
  function onlyCat(cat) { var t = selTypes(); return t.length && t.every(function (x) { return S.types[x].cat === cat; }); }

  /* ---------- Build filters ---------- */
  function opt(v, label, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + label + '</option>'; }
  function group(label, html, id) { return '<div class="fgroup">' + (id ? '<label class="label" for="' + id + '">' + label + '</label>' : '<span class="label">' + label + '</span>') + html + '</div>'; }
  function pills(name, values, cur) {
    return '<div class="num-pills" role="group">' + values.map(function (v) {
      return '<button type="button" data-pill="' + name + '" data-v="' + v[0] + '" aria-pressed="' + (String(cur) === String(v[0])) + '">' + v[1] + '</button>';
    }).join('') + '</div>';
  }

  function renderFilters() {
    var h = '';
    h += group('بحث', '<input id="f-q" class="input" data-k="q" placeholder="عنوان، حي، أو رقم الإعلان" value="' + ui.esc(state.q) + '">', 'f-q');

    var cityOpts = opt('', 'كل المدن', state.city) + S.cities.map(function (c) { return opt(c.id, c.label, state.city); }).join('');
    var c = S.city(state.city);
    var distOpts = opt('', c ? 'كل الأحياء' : 'اختر المدينة أولاً', state.district) + (c ? c.districts.map(function (d) { return opt(d, d, state.district); }).join('') : '');
    h += '<div class="fgroup"><div class="range2"><div class="field"><label for="f-city">المدينة</label><select id="f-city" class="select" data-k="city">' + cityOpts + '</select></div>' +
         '<div class="field"><label for="f-district">الحي</label><select id="f-district" class="select" data-k="district"' + (c ? '' : ' disabled') + '>' + distOpts + '</select></div></div></div>';

    h += group('نوع العقار', '<div class="chips">' + typesInScope().map(function (k) {
      return '<button type="button" class="chip" data-type="' + k + '" aria-pressed="' + (state.types.indexOf(k) !== -1) + '">' + ui.icon(S.types[k].icon) + S.types[k].label + '</button>';
    }).join('') + '</div>');

    var sts = state.offer ? S.statusesFor(state.offer) : Object.keys(S.statuses);
    h += group('حالة العقار', '<div class="chips">' + sts.map(function (k) {
      return '<button type="button" class="chip" data-status="' + k + '" aria-pressed="' + (state.status.indexOf(k) !== -1) + '"><span class="status status--' + k + '" style="border:0;padding:0;height:auto;background:none"><i></i></span>' + S.statuses[k].label + '</button>';
    }).join('') + '</div><label class="check"><input type="checkbox" data-k="hideClosed"' + (state.hideClosed ? ' checked' : '') + '>إخفاء المباع والمؤجَّر</label>');

    if (state.offer === 'rent') {
      h += group('مدة الإيجار', pills('rentPeriod', [['', 'الكل'], ['yearly', 'سنوي'], ['monthly', 'شهري'], ['daily', 'يومي']], state.rentPeriod));
    }

    var priceLabel = state.offer === 'rent' ? 'قيمة الإيجار (ر.س)' : state.offer === 'investment' ? 'قيمة الاستثمار (ر.س)' : 'السعر (ر.س)';
    h += group(priceLabel, '<div class="range2"><input class="input" inputmode="numeric" data-k="priceMin" placeholder="من" aria-label="السعر من" value="' + state.priceMin + '"><input class="input" inputmode="numeric" data-k="priceMax" placeholder="إلى" aria-label="السعر إلى" value="' + state.priceMax + '"></div>');
    h += group('المساحة (م²)', '<div class="range2"><input class="input" inputmode="numeric" data-k="areaMin" placeholder="من" aria-label="المساحة من" value="' + state.areaMin + '"><input class="input" inputmode="numeric" data-k="areaMax" placeholder="إلى" aria-label="المساحة إلى" value="' + state.areaMax + '"></div>');

    if (state.offer === 'investment') {
      h += group('العائد السنوي الأدنى', pills('roiMin', [['', 'الكل'], ['5', '+5%'], ['7', '+7%'], ['9', '+9%']], state.roiMin));
    }

    if (anyCat('residential') && state.offer !== 'investment') {
      h += group('غرف النوم', pills('bedrooms', [['', 'الكل'], ['1', '+1'], ['2', '+2'], ['3', '+3'], ['4', '+4'], ['5', '+5']], state.bedrooms));
      h += group('دورات المياه', pills('bathrooms', [['', 'الكل'], ['1', '+1'], ['2', '+2'], ['3', '+3'], ['4', '+4']], state.bathrooms));
      h += group('التأثيث', '<select id="f-furn" class="select" data-k="furnished">' + opt('', 'الكل', state.furnished) + Object.keys(S.field('furnished').options).map(function (k) { return opt(k, S.field('furnished').options[k], state.furnished); }).join('') + '</select>', 'f-furn');
    }

    if (anyType(['land', 'farm'])) {
      var lu = S.field('landUse').options;
      h += group('استخدام الأرض', '<select id="f-lu" class="select" data-k="landUse">' + opt('', 'الكل', state.landUse) + Object.keys(lu).map(function (k) { return opt(k, lu[k], state.landUse); }).join('') + '</select>', 'f-lu');
    }

    if (!onlyCat('land')) {
      var cs = S.field('constructionStatus').options;
      h += group('حالة البناء', '<select id="f-cs" class="select" data-k="constructionStatus">' + opt('', 'الكل', state.constructionStatus) + Object.keys(cs).map(function (k) { return opt(k, cs[k], state.constructionStatus); }).join('') + '</select>', 'f-cs');
    }

    var fc = S.field('facade').options;
    h += group('الواجهة', '<select id="f-fac" class="select" data-k="facade">' + opt('', 'الكل', state.facade) + Object.keys(fc).map(function (k) { return opt(k, fc[k], state.facade); }).join('') + '</select>', 'f-fac');

    /* المزايا القابلة للفلترة حسب الأنواع المختارة */
    var feats = S.fields.filter(function (f) {
      return f.kind === 'bool' && f.filter && (f.types === '*' || selTypes().some(function (t) { return f.types.indexOf(t) !== -1; })) &&
        (f.offers === '*' || !state.offer || f.offers.indexOf(state.offer) !== -1);
    });
    if (feats.length) {
      h += group('المزايا', feats.map(function (f) {
        return '<label class="check"><input type="checkbox" data-feature="' + f.key + '"' + (state.features.indexOf(f.key) !== -1 ? ' checked' : '') + '>' + f.label + '</label>';
      }).join(''));
    }
    els.body.innerHTML = h;
  }

  /* ---------- Events ---------- */
  var tq;
  els.body.addEventListener('input', function (e) {
    var k = e.target.dataset.k;
    if (!k || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
    var v = e.target.value;
    if (k !== 'q') v = v.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
    if (k !== 'q' && e.target.value !== v) e.target.value = v;
    state[k] = v; state.page = 1;
    clearTimeout(tq); tq = setTimeout(load, 350);
  });
  els.body.addEventListener('change', function (e) {
    var t = e.target, k = t.dataset.k;
    if (t.dataset.feature) {
      var f = t.dataset.feature, i = state.features.indexOf(f);
      if (t.checked && i === -1) state.features.push(f); else if (!t.checked && i !== -1) state.features.splice(i, 1);
    } else if (k === 'hideClosed') state.hideClosed = t.checked;
    else if (k && t.tagName === 'SELECT') {
      state[k] = t.value;
      if (k === 'city') { state.district = ''; renderFilters(); }
    } else return;
    state.page = 1; load();
  });
  els.body.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.type) {
      toggle(state.types, b.dataset.type);
      pruneFeatures(); renderFilters();
    } else if (b.dataset.status) {
      toggle(state.status, b.dataset.status); b.setAttribute('aria-pressed', state.status.indexOf(b.dataset.status) !== -1);
    } else if (b.dataset.pill) {
      state[b.dataset.pill] = b.dataset.v;
      b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    } else return;
    state.page = 1; load();
  });
  function toggle(arr, v) { var i = arr.indexOf(v); if (i === -1) arr.push(v); else arr.splice(i, 1); }
  function pruneFeatures() {
    if (!anyCat('residential')) { state.bedrooms = ''; state.bathrooms = ''; state.furnished = ''; }
    if (!anyType(['land', 'farm'])) state.landUse = '';
  }

  document.querySelector('[data-reset]').addEventListener('click', function () {
    var o = state.offer, s = state.sort; state = clone(DEFAULT); state.offer = o; state.sort = s;
    renderFilters(); load();
  });

  function setOffer(o) {
    state.offer = o; state.page = 1;
    state.types = state.types.filter(function (t) { return !o || S.types[t].offers.indexOf(o) !== -1; });
    state.status = state.status.filter(function (s) { return !o || S.statuses[s].offers.indexOf(o) !== -1; });
    if (o !== 'rent') state.rentPeriod = '';
    if (o !== 'investment') state.roiMin = '';
    syncOfferUI(); renderFilters(); load();
  }
  function syncOfferUI() {
    document.querySelectorAll('[data-offer-tabs] button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === state.offer); });
    var t = state.offer ? 'عقارات ' + S.offers[state.offer].label : 'كل العقارات';
    if (state.types.length === 1) t = S.types[state.types[0]].plural + (state.offer ? ' ' + S.offers[state.offer].label : '');
    if (state.city) t += ' في ' + S.city(state.city).label;
    els.title.textContent = t; els.crumb.textContent = t;
    document.title = t + ' — عقار أونلاين';
    document.querySelectorAll('.nav__link').forEach(function (a) {
      var id = a.getAttribute('href').split('#')[1] || (a.getAttribute('href') === '/properties' ? '' : null);
      var on = id !== null && id === state.offer && a.getAttribute('href').indexOf('/properties') === 0;
      a.classList.toggle('is-active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  document.querySelectorAll('[data-offer-tabs] button').forEach(function (b) {
    b.addEventListener('click', function () {
      setOffer(b.dataset.v);
      try { history.replaceState(null, '', b.dataset.v ? '#' + b.dataset.v : location.pathname); } catch (e) {}
    });
  });
  window.addEventListener('hashchange', function () {
    var h = location.hash.replace('#', '');
    if (hashOffer[h] && h !== state.offer) setOffer(h);
    else if (h === 'map') setView('map');
  });

  els.sort.value = state.sort;
  els.sort.addEventListener('change', function () { state.sort = els.sort.value; state.page = 1; load(); });

  /* Mobile / map-view filters drawer */
  function openFilters(on) {
    els.filters.classList.toggle('is-open', on); els.backdrop.hidden = !on;
    document.body.classList.toggle('no-scroll', on);
    if (on) els.filters.querySelector('.filters__close').focus();
  }
  document.querySelector('[data-filters-open]').addEventListener('click', function () { openFilters(true); });
  document.querySelectorAll('[data-filters-close]').forEach(function (b) { b.addEventListener('click', function () { openFilters(false); }); });
  els.backdrop.addEventListener('click', function () { openFilters(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && els.filters.classList.contains('is-open')) openFilters(false); });

  /* ---------- Views ---------- */
  var mapApi = null, mapEl = null, markers = {};
  function setView(v) {
    view = v; ui.store('view', v);
    document.querySelectorAll('[data-views] button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v); });
    els.layout.classList.toggle('is-map', v === 'map');
    els.results.classList.toggle('is-list', v === 'list');
    if (v === 'map') {
      if (!mapEl) {
        els.wrap.classList.add('map-split');
        mapEl = document.createElement('div'); mapEl.className = 'map-split__map';
        els.wrap.appendChild(mapEl);
        MZ.map.create(mapEl, { center: [24.75, 46.67], zoom: 11 }).then(function (m) { mapApi = m; drawMarkers(lastItems || []); });
      } else { els.wrap.classList.add('map-split'); mapEl.hidden = false; if (mapApi) setTimeout(mapApi.invalidate, 50); }
    } else if (mapEl) { els.wrap.classList.remove('map-split'); mapEl.hidden = true; }
    if (lastItems) render(lastItems);
  }
  document.querySelectorAll('[data-views] button').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.v); if (b.dataset.v === 'map') load(); }); });

  function drawMarkers(items) {
    if (!mapApi || view !== 'map') return;
    Object.keys(markers).forEach(function (k) { markers[k].remove(); }); markers = {};
    items.forEach(function (p) {
      markers[p.id] = mapApi.marker(p.lat, p.lng, MZ.map.pricePin(p), {
        title: p.title,
        onClick: function () {
          var c = els.results.querySelector('[data-id="' + p.id + '"]');
          highlight(p.id);
          if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
    mapApi.fit(items.map(function (p) { return [p.lat, p.lng]; }), 50);
  }
  function highlight(id) {
    els.results.querySelectorAll('.card').forEach(function (c) { c.classList.toggle('is-hl', c.dataset.id === String(id)); });
    Object.keys(markers).forEach(function (k) { markers[k].setActive(k === String(id)); });
  }
  els.results.addEventListener('mouseover', function (e) { var c = e.target.closest('.card'); if (c && mapApi) Object.keys(markers).forEach(function (k) { markers[k].setActive(k === c.dataset.id); }); });
  els.results.addEventListener('mouseleave', function () { Object.keys(markers).forEach(function (k) { markers[k].setActive(false); }); });

  /* ---------- Active chips ---------- */
  function activeList() {
    var a = [];
    if (state.q) a.push(['q', '"' + state.q + '"']);
    if (state.city) a.push(['city', S.city(state.city).label]);
    if (state.district) a.push(['district', 'حي ' + state.district]);
    state.types.forEach(function (t) { a.push(['types:' + t, S.types[t].label]); });
    state.status.forEach(function (s) { a.push(['status:' + s, S.statuses[s].label]); });
    if (state.hideClosed) a.push(['hideClosed', 'بدون المباع والمؤجر']);
    if (state.rentPeriod) a.push(['rentPeriod', 'إيجار ' + S.rentPeriods[state.rentPeriod]]);
    if (state.priceMin || state.priceMax) a.push(['price', 'السعر ' + (state.priceMin ? 'من ' + ui.num(+state.priceMin) + ' ' : '') + (state.priceMax ? 'إلى ' + ui.num(+state.priceMax) : '')]);
    if (state.areaMin || state.areaMax) a.push(['area', 'المساحة ' + (state.areaMin ? 'من ' + state.areaMin + ' ' : '') + (state.areaMax ? 'إلى ' + state.areaMax : '') + ' م²']);
    if (state.roiMin) a.push(['roiMin', 'عائد +' + state.roiMin + '%']);
    if (state.bedrooms) a.push(['bedrooms', state.bedrooms + '+ غرف']);
    if (state.bathrooms) a.push(['bathrooms', state.bathrooms + '+ دورات مياه']);
    if (state.furnished) a.push(['furnished', S.field('furnished').options[state.furnished]]);
    if (state.landUse) a.push(['landUse', S.field('landUse').options[state.landUse]]);
    if (state.constructionStatus) a.push(['constructionStatus', S.field('constructionStatus').options[state.constructionStatus]]);
    if (state.facade) a.push(['facade', 'واجهة ' + S.field('facade').options[state.facade]]);
    state.features.forEach(function (f) { a.push(['features:' + f, S.field(f).label]); });
    return a;
  }
  function renderActive() {
    var a = activeList();
    els.active.innerHTML = a.map(function (x) { return '<button type="button" class="achip" data-rm="' + x[0] + '" aria-label="إزالة فلتر ' + x[1] + '">' + x[1] + ui.icon('close') + '</button>'; }).join('');
    var n = document.querySelector('[data-filter-count]'); n.textContent = a.length; n.hidden = !a.length;
  }
  els.active.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rm]'); if (!b) return;
    var k = b.dataset.rm, parts = k.split(':');
    if (parts.length === 2) toggle(state[parts[0]], parts[1]);
    else if (k === 'price') { state.priceMin = ''; state.priceMax = ''; }
    else if (k === 'area') { state.areaMin = ''; state.areaMax = ''; }
    else if (k === 'city') { state.city = ''; state.district = ''; }
    else state[k] = DEFAULT[k];
    state.page = 1; renderFilters(); load();
  });

  /* ---------- Load / render ---------- */
  var lastItems = null, reqId = 0;
  function query() {
    var q = clone(state);
    q.pageSize = view === 'map' ? 50 : cfg.pageSize;
    return q;
  }
  function load() {
    var id = ++reqId;
    els.results.classList.add('is-loading');
    syncOfferUI(); renderActive();
    api.listProperties(query()).then(function (r) {
      if (id !== reqId) return;
      els.results.classList.remove('is-loading');
      lastItems = r.items;
      els.count.innerHTML = '<b>' + r.total + '</b> عقار' + (r.total ? ' — عرض ' + ((r.page - 1) * r.pageSize + 1) + '–' + Math.min(r.total, r.page * r.pageSize) : '');
      document.querySelector('[data-apply-count]').textContent = 'عرض ' + r.total + ' نتيجة';
      render(r.items);
      renderPager(r);
      drawMarkers(r.items);
    });
  }
  function render(items) {
    if (!items.length) {
      els.results.innerHTML = '<div class="empty" style="grid-column:1/-1">' + ui.icon('search') + '<h3>لا توجد عقارات مطابقة</h3><p>جرّب توسيع نطاق السعر أو إزالة بعض الفلاتر، أو اطلب عقاراً بمواصفاتك وسنبحث لك عنه.</p><div class="cta__btns" style="margin-top:8px"><button class="btn btn--ghost" type="button" data-clear-all>مسح الفلاتر</button><a class="btn btn--primary" href="/contact">اطلب عقاراً</a></div></div>';
      var c = els.results.querySelector('[data-clear-all]');
      if (c) c.addEventListener('click', function () { document.querySelector('[data-reset]').click(); });
      return;
    }
    els.results.innerHTML = items.map(function (p) { return ui.card(p, { row: view === 'list' }); }).join('');
  }
  function renderPager(r) {
    if (r.pages <= 1) { els.pager.innerHTML = ''; return; }
    var h = '<button type="button" data-page="' + (r.page - 1) + '"' + (r.page === 1 ? ' disabled' : '') + ' aria-label="الصفحة السابقة">' + ui.icon('chevR') + '</button>';
    for (var i = 1; i <= r.pages; i++) h += '<button type="button" data-page="' + i + '"' + (i === r.page ? ' aria-current="page"' : '') + '>' + i + '</button>';
    h += '<button type="button" data-page="' + (r.page + 1) + '"' + (r.page === r.pages ? ' disabled' : '') + ' aria-label="الصفحة التالية">' + ui.icon('chevL') + '</button>';
    els.pager.innerHTML = h;
  }
  els.pager.addEventListener('click', function (e) {
    var b = e.target.closest('[data-page]'); if (!b || b.disabled) return;
    state.page = +b.dataset.page; load();
    window.scrollTo({ top: els.layout.offsetTop - 100, behavior: 'smooth' });
  });
  document.addEventListener('mz:fav', function () {});

  renderFilters();
  setView(view);
  load();
  });
})(window.MZ);
