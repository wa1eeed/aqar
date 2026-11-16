/* =========================================================
   طبقة البيانات — كل الصفحات تتعامل مع هذه الدوال فقط.
   عند تحويل dataSource إلى 'api' تُرسل الطلبات للباك إند
   بنفس الشكل الموثّق في API.md، ولا تحتاج الصفحات أي تعديل.
   ========================================================= */
window.MZ = window.MZ || {};

(function (MZ) {
  var cfg = MZ.config, S = MZ.schema;

  function delay(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 120); }); }

  function http(path, opts) {
    return fetch(cfg.apiBase + path, Object.assign({ headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } }, opts || {}))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function qs(obj) {
    var parts = [];
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  /* ---------- Mock helpers ---------- */
  function hydrate(p) {
    var c = S.city(p.city);
    var out = Object.assign({}, p);
    out.code = 'MZ-' + p.id;
    out.cityLabel = c ? c.label : p.city;
    out.agent = MZ.MOCK_AGENTS[p.agent] || p.agent;
    out.pricePerMeter = (p.offer !== 'rent' && p.specs.area) ? Math.round(p.price / p.specs.area) : null;
    if (p.offer === 'investment' && !p.specs.roi && p.specs.annualIncome) out.specs.roi = +(p.specs.annualIncome / p.price * 100).toFixed(1);
    return out;
  }
  function all() { return (MZ.MOCK_PROPERTIES || []).map(hydrate); }

  /* سعر سنوي تقريبي لمقارنة الإيجارات عند الفرز والفلترة */
  function annualised(p) {
    if (p.offer !== 'rent') return p.price;
    if (p.rentPeriod === 'monthly') return p.price * 12;
    if (p.rentPeriod === 'daily') return p.price * 365;
    return p.price;
  }

  function applyFilters(list, q) {
    var types = q.types ? [].concat(q.types) : [];
    var statuses = q.status ? [].concat(q.status) : [];
    var feats = q.features ? [].concat(q.features) : [];
    var text = (q.q || '').trim();
    return list.filter(function (p) {
      var s = p.specs;
      if (q.offer && p.offer !== q.offer) return false;
      if (q.city && p.city !== q.city) return false;
      if (q.district && p.district !== q.district) return false;
      if (types.length && types.indexOf(p.type) === -1) return false;
      if (statuses.length && statuses.indexOf(p.status) === -1) return false;
      if (q.hideClosed && S.isClosed(p.status)) return false;
      if (q.priceMin && p.price < +q.priceMin) return false;
      if (q.priceMax && p.price > +q.priceMax) return false;
      if (q.areaMin && s.area < +q.areaMin) return false;
      if (q.areaMax && s.area > +q.areaMax) return false;
      if (q.bedrooms && !(s.bedrooms >= +q.bedrooms)) return false;
      if (q.bathrooms && !(s.bathrooms >= +q.bathrooms)) return false;
      if (q.furnished && s.furnished !== q.furnished) return false;
      if (q.landUse && s.landUse !== q.landUse) return false;
      if (q.facade && s.facade !== q.facade) return false;
      if (q.constructionStatus && s.constructionStatus !== q.constructionStatus) return false;
      if (q.rentPeriod && p.rentPeriod !== q.rentPeriod) return false;
      if (q.roiMin && !(s.roi >= +q.roiMin)) return false;
      if (q.featured && !p.featured) return false;
      for (var i = 0; i < feats.length; i++) if (!s[feats[i]]) return false;
      if (text) {
        var hay = [p.title, p.district, p.cityLabel, p.code, S.types[p.type].label, p.description].join(' ');
        if (hay.indexOf(text) === -1) return false;
      }
      return true;
    });
  }

  function sortList(list, sort) {
    var fns = {
      newest: function (a, b) { return b.createdAt.localeCompare(a.createdAt); },
      price_asc: function (a, b) { return annualised(a) - annualised(b); },
      price_desc: function (a, b) { return annualised(b) - annualised(a); },
      area_desc: function (a, b) { return b.specs.area - a.specs.area; },
      roi_desc: function (a, b) { return (b.specs.roi || 0) - (a.specs.roi || 0); }
    };
    var closedLast = function (a, b) { return (S.isClosed(a.status) ? 1 : 0) - (S.isClosed(b.status) ? 1 : 0); };
    var fn = fns[sort] || fns.newest;
    return list.slice().sort(function (a, b) { return closedLast(a, b) || fn(a, b); });
  }

  /* ---------- Nearby ---------- */
  function haversine(a, b, c, d) {
    var R = 6371000, toR = Math.PI / 180;
    var dLat = (c - a) * toR, dLng = (d - b) * toR;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * toR) * Math.cos(c * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }

  var SAMPLE_NAMES = {
    mosque: ['جامع الحي', 'مسجد الإيمان', 'مسجد التقوى', 'جامع النور'],
    school: ['مدرسة ابتدائية', 'روضة أطفال', 'مدارس أهلية', 'مدرسة متوسطة'],
    health: ['مركز الرعاية الصحية الأولية', 'مستشفى عام', 'مجمع عيادات'],
    pharmacy: ['صيدلية', 'صيدلية 24 ساعة'],
    grocery: ['سوبرماركت', 'تموينات الحي', 'هايبرماركت'],
    mall: ['مركز تجاري', 'مجمع تجاري مفتوح'],
    food: ['مقهى مختص', 'مطعم شعبي', 'مطعم عائلي', 'مخبز'],
    park: ['حديقة الحي', 'ممشى'],
    fuel: ['محطة وقود'],
    bank: ['صرّاف آلي', 'فرع بنك']
  };

  /* بيانات تجريبية ثابتة (نفس النتيجة لكل عقار) — تُستخدم عند تعذّر المصدر الحقيقي */
  function sampleNearby(p) {
    var seed = p.id * 9301 + 49297;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    var out = [];
    Object.keys(S.nearby).forEach(function (cat) {
      var n = cat === 'mall' || cat === 'fuel' || cat === 'health' ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 2);
      for (var i = 0; i < n; i++) {
        var ang = rnd() * Math.PI * 2, dist = 150 + rnd() * 1800;
        var lat = p.lat + (dist * Math.cos(ang)) / 111320;
        var lng = p.lng + (dist * Math.sin(ang)) / (111320 * Math.cos(p.lat * Math.PI / 180));
        var names = SAMPLE_NAMES[cat];
        out.push({ id: cat + i, cat: cat, name: names[(i + Math.floor(rnd() * 10)) % names.length], lat: lat, lng: lng, distance: haversine(p.lat, p.lng, lat, lng) });
      }
    });
    return out.sort(function (a, b) { return a.distance - b.distance; });
  }

  function osmNearby(p) {
    var r = cfg.nearby.radius;
    var body = '[out:json][timeout:20];(' + Object.keys(S.nearby).map(function (cat) {
      return 'nwr' + S.nearby[cat].osm + '(around:' + r + ',' + p.lat + ',' + p.lng + ');';
    }).join('') + ');out center 200;';
    return fetch(cfg.nearby.overpassUrl, { method: 'POST', body: 'data=' + encodeURIComponent(body), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(function (r) { if (!r.ok) throw new Error('overpass'); return r.json(); })
      .then(function (j) {
        var items = [];
        (j.elements || []).forEach(function (e) {
          var t = e.tags || {}, lat = e.lat || (e.center && e.center.lat), lng = e.lon || (e.center && e.center.lon);
          if (!lat) return;
          var cat = null;
          if (t.amenity === 'place_of_worship') cat = 'mosque';
          else if (t.amenity === 'school' || t.amenity === 'kindergarten') cat = 'school';
          else if (t.amenity === 'hospital' || t.amenity === 'clinic') cat = 'health';
          else if (t.amenity === 'pharmacy') cat = 'pharmacy';
          else if (t.shop === 'supermarket' || t.shop === 'convenience') cat = 'grocery';
          else if (t.shop === 'mall') cat = 'mall';
          else if (t.amenity === 'restaurant' || t.amenity === 'cafe') cat = 'food';
          else if (t.leisure === 'park') cat = 'park';
          else if (t.amenity === 'fuel') cat = 'fuel';
          else if (t.amenity === 'bank' || t.amenity === 'atm') cat = 'bank';
          if (!cat) return;
          items.push({ id: e.type + e.id, cat: cat, name: t['name:ar'] || t.name || S.nearby[cat].label.replace(/ات$|ون$/, ''), lat: lat, lng: lng, distance: haversine(p.lat, p.lng, lat, lng) });
        });
        if (!items.length) throw new Error('empty');
        return items.sort(function (a, b) { return a.distance - b.distance; });
      });
  }

  /* ---------- Public API ---------- */
  MZ.api = {
    /* GET /properties */
    listProperties: function (q) {
      q = q || {};
      if (cfg.dataSource === 'api') return http('/properties' + qs(q));
      var list = sortList(applyFilters(all(), q), q.sort);
      var size = +q.pageSize || cfg.pageSize, page = Math.max(1, +q.page || 1);
      return delay({ items: list.slice((page - 1) * size, page * size), total: list.length, page: page, pageSize: size, pages: Math.max(1, Math.ceil(list.length / size)) });
    },
    /* GET /properties/:id */
    getProperty: function (id) {
      if (cfg.dataSource === 'api') return http('/properties/' + encodeURIComponent(id));
      var p = all().filter(function (x) { return String(x.id) === String(id); })[0];
      return p ? delay(p) : Promise.reject(new Error('not_found'));
    },
    /* GET /properties/:id/similar */
    getSimilar: function (p, limit) {
      if (cfg.dataSource === 'api') return http('/properties/' + p.id + '/similar?limit=' + (limit || 3));
      var list = all().filter(function (x) { return x.id !== p.id && !S.isClosed(x.status); });
      list.sort(function (a, b) {
        function score(x) { return (x.type === p.type ? 3 : 0) + (x.offer === p.offer ? 2 : 0) + (x.city === p.city ? 1 : 0); }
        return score(b) - score(a);
      });
      return delay(list.slice(0, limit || 3));
    },
    /* GET /properties/:id/nearby  — أو OpenStreetMap مباشرة */
    getNearby: function (p) {
      var src = cfg.nearby.source;
      var primary = src === 'api' && cfg.dataSource === 'api'
        ? http('/properties/' + p.id + '/nearby?radius=' + cfg.nearby.radius).then(function (r) { return r.items; })
        : src === 'osm' ? osmNearby(p) : Promise.reject(new Error('sample'));
      return primary.then(function (items) { return { source: src, items: items }; })
        .catch(function () {
          if (!cfg.nearby.fallbackToSample) return { source: 'none', items: [] };
          return { source: 'sample', items: sampleNearby(p) };
        });
    },
    /* GET /stats */
    getStats: function () {
      if (cfg.dataSource === 'api') return http('/stats');
      var list = all(), byType = {}, byCity = {}, byOffer = {};
      list.forEach(function (p) {
        if (S.isClosed(p.status)) return;
        byType[p.type] = (byType[p.type] || 0) + 1;
        byCity[p.city] = (byCity[p.city] || 0) + 1;
        byOffer[p.offer] = (byOffer[p.offer] || 0) + 1;
      });
      return delay({ total: list.filter(function (p) { return !S.isClosed(p.status); }).length, byType: byType, byCity: byCity, byOffer: byOffer });
    },
    /* GET /properties?ids=… (للمفضلة) */
    getMany: function (ids) {
      if (!ids.length) return Promise.resolve([]);
      if (cfg.dataSource === 'api') return http('/properties?ids=' + ids.join(',')).then(function (r) { return r.items; });
      return delay(all().filter(function (p) { return ids.indexOf(String(p.id)) !== -1; }));
    },
    /* POST /leads — طلبات التواصل والمعاينة وعرض العقار */
    submitLead: function (payload) {
      if (cfg.dataSource === 'api') return http('/leads', { method: 'POST', body: JSON.stringify(payload) });
      return delay({ ok: true, demo: true, id: 'L-' + Date.now().toString().slice(-6) });
    },
    annualised: annualised,
    distance: haversine
  };
})(window.MZ);
