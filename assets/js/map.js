/* =========================================================
   طبقة الخرائط — واجهة موحّدة لمزوّدين:
   'osm'    → Leaflet + OpenStreetMap (افتراضي)
   'google' → Google Maps JavaScript API (يحتاج googleApiKey)
   الصفحات تستدعي MZ.map.create() فقط ولا تعرف المزوّد.
   ========================================================= */
window.MZ = window.MZ || {};

(function (MZ) {
  var cfg = MZ.config.map;
  var loaders = {};

  function loadScript(src) {
    if (loaders[src]) return loaders[src];
    loaders[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res; s.onerror = function () { rej(new Error('script')); };
      document.head.appendChild(s);
    });
    return loaders[src];
  }

  /* ---------------- OpenStreetMap (Leaflet) ---------------- */
  function osm(el, opts) {
    var src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    return (window.L ? Promise.resolve() : loadScript(src)).then(function () {
      var L = window.L;
      var map = L.map(el, { zoomControl: false, scrollWheelZoom: opts.scrollZoom !== false, attributionControl: true }).setView(opts.center, opts.zoom || 12);
      L.control.zoom({ position: 'topleft', zoomInTitle: 'تكبير', zoomOutTitle: 'تصغير' }).addTo(map);
      map.attributionControl.setPrefix(false);
      var tiles = L.tileLayer(cfg.tiles, { maxZoom: 19, attribution: cfg.attribution });
      var failed = 0;
      tiles.on('tileerror', function () { if (++failed > 2) el.classList.add('map--notiles'); });
      tiles.on('tileload', function () { el.classList.remove('map--notiles'); });
      tiles.addTo(map);

      function marker(lat, lng, html, o) {
        o = o || {};
        var m = L.marker([lat, lng], {
          icon: L.divIcon({ className: 'mk-wrap', html: html, iconSize: null, iconAnchor: o.anchor || [0, 0] }),
          zIndexOffset: o.z || 0, keyboard: !!o.onClick, title: o.title || ''
        }).addTo(map);
        if (o.onClick) m.on('click', o.onClick);
        return {
          raw: m,
          el: function () { return m.getElement(); },
          setActive: function (on) { var e = m.getElement(); if (e) e.classList.toggle('is-active', on); m.setZIndexOffset(on ? 1000 : (o.z || 0)); },
          remove: function () { map.removeLayer(m); }
        };
      }

      return {
        provider: 'osm',
        marker: marker,
        circle: function (lat, lng, r) { return L.circle([lat, lng], { radius: r, color: '#0F4C3A', weight: 1.5, fillColor: '#0F4C3A', fillOpacity: .06, dashArray: '6 6' }).addTo(map); },
        fit: function (pts, pad) {
          if (!pts.length) return;
          if (pts.length === 1) return map.setView(pts[0], 15);
          map.fitBounds(L.latLngBounds(pts), { padding: [pad || 40, pad || 40], maxZoom: 15 });
        },
        setView: function (c, z) { map.setView(c, z || map.getZoom()); },
        panTo: function (c) { map.panTo(c); },
        invalidate: function () { map.invalidateSize(); },
        onMove: function (fn) { map.on('moveend', fn); },
        bounds: function () { var b = map.getBounds(); return { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() }; }
      };
    });
  }

  /* ---------------- Google Maps ---------------- */
  function google(el, opts) {
    if (!cfg.googleApiKey) return Promise.reject(new Error('missing_key'));
    var cb = '__mzGmapsReady';
    var ready = window.google && window.google.maps ? Promise.resolve() : new Promise(function (res, rej) {
      window[cb] = res;
      loadScript('https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(cfg.googleApiKey) + '&language=ar&region=SA&callback=' + cb).catch(rej);
    });
    return ready.then(function () {
      var g = window.google.maps;
      var map = new g.Map(el, { center: { lat: opts.center[0], lng: opts.center[1] }, zoom: opts.zoom || 12, disableDefaultUI: true, zoomControl: true, gestureHandling: opts.scrollZoom === false ? 'cooperative' : 'greedy' });

      function Html(pos, html, o) { this.pos = pos; this.html = html; this.o = o; this.setMap(map); }
      Html.prototype = new g.OverlayView();
      Html.prototype.onAdd = function () {
        var d = document.createElement('div'); d.className = 'mk-wrap'; d.style.position = 'absolute'; d.innerHTML = this.html;
        if (this.o.onClick) d.addEventListener('click', this.o.onClick);
        this.div = d; this.getPanes().overlayMouseTarget.appendChild(d);
      };
      Html.prototype.draw = function () {
        var p = this.getProjection().fromLatLngToDivPixel(this.pos);
        if (p && this.div) { this.div.style.left = p.x + 'px'; this.div.style.top = p.y + 'px'; this.div.style.zIndex = this.z || this.o.z || 0; }
      };
      Html.prototype.onRemove = function () { if (this.div) this.div.remove(); };

      return {
        provider: 'google',
        marker: function (lat, lng, html, o) {
          o = o || {};
          var m = new Html(new g.LatLng(lat, lng), html, o);
          return {
            raw: m,
            el: function () { return m.div; },
            setActive: function (on) { if (m.div) { m.div.classList.toggle('is-active', on); m.z = on ? 1000 : 0; m.draw(); } },
            remove: function () { m.setMap(null); }
          };
        },
        circle: function (lat, lng, r) { return new g.Circle({ map: map, center: { lat: lat, lng: lng }, radius: r, strokeColor: '#0F4C3A', strokeWeight: 1.5, fillColor: '#0F4C3A', fillOpacity: .06 }); },
        fit: function (pts) {
          if (!pts.length) return;
          if (pts.length === 1) { map.setCenter({ lat: pts[0][0], lng: pts[0][1] }); map.setZoom(15); return; }
          var b = new g.LatLngBounds(); pts.forEach(function (p) { b.extend({ lat: p[0], lng: p[1] }); }); map.fitBounds(b, 40);
        },
        setView: function (c, z) { map.setCenter({ lat: c[0], lng: c[1] }); if (z) map.setZoom(z); },
        panTo: function (c) { map.panTo({ lat: c[0], lng: c[1] }); },
        invalidate: function () {},
        onMove: function (fn) { map.addListener('idle', fn); },
        bounds: function () { var b = map.getBounds(); if (!b) return null; var ne = b.getNorthEast(), sw = b.getSouthWest(); return { n: ne.lat(), s: sw.lat(), e: ne.lng(), w: sw.lng() }; }
      };
    });
  }

  MZ.map = {
    create: function (el, opts) {
      el.setAttribute('dir', 'ltr');
      el.classList.add('map');
      var p = cfg.provider === 'google' ? google(el, opts).catch(function () { return osm(el, opts); }) : osm(el, opts);
      return p.catch(function () {
        el.classList.add('map--failed');
        el.innerHTML = '<div class="map-fail" dir="rtl">' + MZ.ui.icon('map') + '<span>تعذّر تحميل الخريطة. تحقق من الاتصال بالإنترنت.</span></div>';
        return null;
      });
    },
    /* عناصر العلامات */
    pricePin: function (p) {
      return '<div class="mk-price mk-price--' + p.offer + (MZ.schema.isClosed(p.status) ? ' is-closed' : '') + '">' + MZ.ui.moneyShort(p.price).replace(' مليون', 'M').replace(' ألف', 'K') + '</div>';
    },
    homePin: function () {
      return '<div class="mk-home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20V11l8-6 8 6v9"/><path d="M10 20v-5h4v5"/></svg></div>';
    },
    poiPin: function (cat) {
      return '<div class="mk-poi mk-poi--' + cat + '">' + MZ.ui.icon(MZ.schema.nearby[cat].icon) + '</div>';
    }
  };
})(window.MZ);
