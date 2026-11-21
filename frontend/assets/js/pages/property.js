(function (MZ) {
  MZ.boot().then(function () {
  var S = MZ.schema, ui = MZ.ui, api = MZ.api, cfg = MZ.config, I = ui.icon;
  ui.mount('properties');
  var root = document.querySelector('[data-prop]');

  function getId() {
    var m = location.hash.match(/^#p-(\d+)/);
    if (m) return m[1];
    try { return new URLSearchParams(location.search).get('id'); } catch (e) { return null; }
  }

  function load() {
    var id = getId();
    if (!id) return notFound();
    api.getProperty(id).then(render).catch(notFound);
  }
  window.addEventListener('hashchange', function () { if (/^#p-\d+/.test(location.hash)) { window.scrollTo(0, 0); load(); } });
  load();

  function notFound() {
    root.innerHTML = '<div class="page-head"></div><div class="empty">' + I('search') + '<h3>لم نعثر على هذا العقار</h3><p>ربما تم حذف الإعلان أو انتهى ترخيصه. تصفّح العقارات المتاحة.</p><a class="btn btn--primary" href="/properties">كل العقارات</a></div>';
  }

  /* ---------------------------------------------------------------- */
  function render(p) {
    var t = S.types[p.type], s = p.specs, closed = S.isClosed(p.status);
    var fields = S.fieldsFor(p.type, p.offer);
    document.title = p.title + ' — ' + p.district + '، ' + p.cityLabel + ' | منزلة العقارية';

    /* Gallery */
    var imgs = p.images;
    var gal = '<div class="gallery' + (closed ? ' is-closed' : '') + '">' +
      imgs.slice(0, 5).map(function (k, i) {
        var more = i === 4 && imgs.length > 5 ? '<span class="gallery__more">+' + (imgs.length - 5) + '</span>' : '';
        return '<button type="button" data-lb="' + i + '" aria-label="عرض الصورة ' + (i + 1) + ' من ' + imgs.length + '"><img src="' + ui.img(k) + '" alt="' + ui.esc(p.title) + ' — صورة ' + (i + 1) + '"' + (i ? ' loading="lazy"' : '') + '>' + more + '</button>';
      }).join('') +
      (closed ? '<span class="stamp" aria-hidden="true">' + S.statuses[p.status].label + '</span>' : '') +
      '<button type="button" class="btn btn--light btn--sm gallery__all" data-lb="0">' + I('grid') + 'كل الصور (' + imgs.length + ')</button>' +
    '</div>';
    if (imgs.length < 5) gal = gal.replace('class="gallery', 'class="gallery gallery--n' + imgs.length);

    /* Key facts */
    var kf = fields.filter(function (f) { return f.key_fact && s[f.key] != null && s[f.key] !== ''; }).slice(0, 5);
    var keyfacts = '<div class="keyfacts">' + kf.map(function (f) {
      return '<div>' + I(f.icon || 'info') + '<span>' + f.label + '</span><b>' + ui.fieldValue(f, s[f.key]) + '</b></div>';
    }).join('') + '<div>' + I(t.icon) + '<span>نوع العقار</span><b>' + t.label + '</b></div></div>';

    /* Spec groups (بدون المزايا والنظامية والاستثمار — لها أقسام خاصة) */
    var groups = S.fieldGroups.filter(function (g) { return ['features', 'legal', 'invest'].indexOf(g.id) === -1; });
    var specHtml = '';
    groups.forEach(function (g) {
      var rows = fields.filter(function (f) { return f.group === g.id && s[f.key] != null && s[f.key] !== ''; });
      if (g.id === 'rent' && p.rentPeriod) rows.unshift({ label: 'مدة الإيجار', _v: S.rentPeriods[p.rentPeriod] });
      if (!rows.length) return;
      specHtml += '<div class="spec-group"><h3>' + g.label + '</h3>' + rows.map(function (f) {
        return '<div class="spec-row"><span>' + f.label + '</span><b>' + (f._v || ui.fieldValue(f, s[f.key])) + '</b></div>';
      }).join('') + '</div>';
    });
    var specGroups = specHtml;

    /* Features */
    var feats = fields.filter(function (f) { return f.group === 'features'; });
    var featHtml = feats.map(function (f) {
      var v = s[f.key];
      if (f.kind === 'bool') {
        if (v == null) return '';
        return '<div class="feature' + (v ? '' : ' is-off') + '">' + I(v ? 'check' : 'close') + f.label + '</div>';
      }
      if (v == null) return '';
      return '<div class="feature">' + I('check') + f.label + ': ' + ui.fieldValue(f, v) + '</div>';
    }).join('');

    /* Investment */
    var investHtml = '';
    if (p.offer === 'investment') {
      var payback = s.annualIncome ? (p.price / s.annualIncome).toFixed(1) : null;
      var model = S.field('investmentModel').options[s.investmentModel];
      investHtml = '<section class="psec" id="invest"><h2>البيانات الاستثمارية</h2><div class="invest-box">' +
        '<div><span>قيمة الاستثمار</span><b>' + ui.moneyShort(p.price) + '</b></div>' +
        '<div><span>الدخل السنوي' + (s.investmentModel === 'income' ? '' : ' المتوقع') + '</span><b>' + (s.annualIncome ? ui.moneyShort(s.annualIncome) : '—') + '</b></div>' +
        '<div><span>العائد السنوي</span><b class="gold">' + (s.roi ? s.roi + '%' : '—') + '</b></div>' +
        '<div><span>' + (s.occupancy != null ? 'نسبة الإشغال' : s.leaseTerm ? 'مدة العقد' : 'فترة الاسترداد') + '</span><b>' + (s.occupancy != null ? s.occupancy + '%' : s.leaseTerm ? s.leaseTerm + ' سنة' : (payback ? payback + ' سنة' : '—')) + '</b></div>' +
      '</div>' +
      '<div class="specs" style="margin-top:20px"><div class="spec-group">' +
        (model ? '<div class="spec-row"><span>نموذج الاستثمار</span><b>' + model + '</b></div>' : '') +
        (payback ? '<div class="spec-row"><span>فترة الاسترداد التقديرية</span><b>' + payback + ' سنة</b></div>' : '') +
      '</div></div>' +
      '<p class="muted" style="font-size:13px;margin-top:6px">الأرقام المعروضة تقديرية بناءً على بيانات المالك والعقود القائمة، ولا تُعدّ توصية استثمارية.</p></section>';
    }

    /* Legal */
    var legalFields = fields.filter(function (f) { return f.group === 'legal' && s[f.key] != null; });
    var legalHtml = '<div class="legal">' + legalFields.map(function (f) {
      var v = f.kind === 'date' ? new Date(s[f.key]).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : ui.fieldValue(f, s[f.key]);
      return '<div><span>' + f.label + '</span><b' + (f.kind === 'text' ? '' : ' style="direction:rtl"') + '>' + v + '</b></div>';
    }).join('') + '</div>' +
      '<p class="legal-note">' + I('shield') + 'هذا الإعلان مرخّص وفق اشتراطات الهيئة العامة للعقار. يمكنك التحقق من رقم الترخيص عبر منصة الهيئة.</p>';

    /* Price box */
    var priceLabel = p.offer === 'rent' ? 'قيمة الإيجار' : p.offer === 'investment' ? 'قيمة الاستثمار' : 'سعر البيع';
    var subs = '';
    if (p.pricePerMeter) subs += '<div class="pricebox__sub"><span>سعر المتر</span><b>' + ui.money(p.pricePerMeter) + '</b></div>';
    if (p.offer === 'rent' && s.payments) subs += '<div class="pricebox__sub"><span>الدفعات</span><b>' + S.field('payments').options[s.payments] + '</b></div>';
    if (p.offer === 'rent' && s.deposit) subs += '<div class="pricebox__sub"><span>مبلغ التأمين</span><b>' + ui.money(s.deposit) + '</b></div>';
    if (p.offer === 'investment' && s.roi) subs += '<div class="pricebox__sub"><span>العائد السنوي</span><b>' + s.roi + '%</b></div>';
    subs += '<div class="pricebox__sub"><span>قابل للتفاوض</span><b>' + (p.negotiable ? 'نعم' : 'لا') + '</b></div>';

    var agent = p.agent;
    var waText = encodeURIComponent('السلام عليكم، أستفسر عن العقار ' + p.code + ' — ' + p.title);
    var actions;
    if (closed) {
      actions = '<div class="closed-note">' + I('info') + '<span>هذا العقار ' + S.statuses[p.status].label + '. تصفّح عقارات مشابهة أو سجّل طلبك وسنبلغك بالفرص الجديدة.</span></div>' +
        '<div class="pricebox__btns"><a class="btn btn--primary" href="#similar">عقارات مشابهة</a></div>';
    } else if (p.status === 'reserved') {
      actions = '<div class="closed-note">' + I('clock') + '<span>العقار محجوز حالياً. سجّل اهتمامك وسنبلغك فور إتاحته.</span></div>' +
        '<div class="pricebox__btns"><button class="btn btn--primary" type="button" data-book="waitlist">أبلغني عند الإتاحة</button>' +
        '<a class="btn btn--wa" href="https://wa.me/' + agent.whatsapp + '?text=' + waText + '" target="_blank" rel="noopener">' + I('whatsapp') + 'واتساب</a>' +
        '<a class="btn btn--ghost" href="tel:' + agent.phone + '">' + I('phone') + 'اتصال</a></div>';
    } else {
      var canBook = p.booking && p.booking.enabled;
      var bookCta = canBook ? '<a class="btn btn--primary btn--block" href="/booking.html#p-' + p.id + '">احجز العقار</a>' : '';
      actions = '<div class="pricebox__btns">' + bookCta +
        '<button class="btn ' + (canBook ? 'btn--ghost' : 'btn--primary') + '" type="button" data-book="viewing">' + I('calendar') + 'احجز موعد معاينة</button>' +
        '<a class="btn btn--wa" href="https://wa.me/' + agent.whatsapp + '?text=' + waText + '" target="_blank" rel="noopener">' + I('whatsapp') + 'واتساب</a>' +
        '<a class="btn btn--ghost" href="tel:' + agent.phone + '">' + I('phone') + 'اتصال</a></div>';
    }

    var calc = '';
    if (p.offer === 'sale' && s.mortgage && !closed) {
      calc = '<div class="calc" data-calc><h3>' + I('calc') + 'حاسبة التمويل العقاري</h3>' +
        '<div class="calc__grid">' +
          '<div class="field"><label for="c-down">الدفعة الأولى %</label><input id="c-down" class="input" type="number" min="0" max="90" value="10" inputmode="numeric"></div>' +
          '<div class="field"><label for="c-years">المدة (سنة)</label><input id="c-years" class="input" type="number" min="1" max="30" value="25" inputmode="numeric"></div>' +
          '<div class="field" style="grid-column:1/-1"><label for="c-rate">نسبة الربح السنوية %</label><input id="c-rate" class="input" type="number" min="0" max="20" step="0.1" value="4.5" inputmode="decimal"></div>' +
        '</div>' +
        '<div class="calc__out"><span>القسط الشهري التقديري</span><b data-calc-out>—</b></div>' +
        '<p class="calc__fine">تقدير أولي فقط. يحدد البنك القسط الفعلي حسب الراتب والالتزامات وبرامج الدعم السكني.</p></div>';
    }

    var tabs = [['overview', 'نظرة عامة'], ['details', 'التفاصيل']];
    if (featHtml) tabs.push(['features', 'المزايا']);
    if (investHtml) tabs.push(['invest', 'الاستثمار']);
    tabs.push(['location', 'الموقع والخدمات'], ['legal', 'بيانات الترخيص']);

    root.innerHTML =
      '<header class="page-head" style="padding-bottom:20px"><nav class="crumbs" aria-label="مسار التنقل">' +
        '<a href="/">الرئيسية</a><span aria-hidden="true">/</span><a href="/properties#' + p.offer + '">' + S.offers[p.offer].label + '</a><span aria-hidden="true">/</span>' +
        '<a href="/properties" data-goto-type="' + p.type + '">' + t.plural + '</a><span aria-hidden="true">/</span><span>' + p.code + '</span></nav></header>' +
      gal +
      '<div class="prop-head"><div>' +
        '<div class="prop-head__badges">' + ui.offerBadge(p) + ui.statusBadge(p, true) + '<span class="status" style="color:var(--gold-ink)">' + I(t.icon) + t.label + '</span></div>' +
        '<h1>' + ui.esc(p.title) + '</h1>' +
        '<div class="prop-head__loc"><span>' + I('pin') + 'حي ' + p.district + '، ' + p.cityLabel + '</span><span>' + I('doc') + '<bdi>' + p.code + '</bdi></span><span>' + I('clock') + 'نُشر ' + ui.ago(p.createdAt) + '</span></div>' +
      '</div><div class="prop-head__actions">' +
        '<button class="icon-btn' + (ui.fav.has(p.id) ? ' is-on' : '') + '" type="button" data-fav="' + p.id + '" aria-pressed="' + ui.fav.has(p.id) + '" aria-label="حفظ في المفضلة" style="--c:var(--st-sold)">' + I('heart') + '</button>' +
        '<button class="icon-btn" type="button" data-share aria-label="نسخ رابط العقار">' + I('share') + '</button>' +
      '</div></div>' +

      '<div class="prop-layout"><div>' +
        keyfacts +
        '<nav class="ptabs" aria-label="أقسام الصفحة">' + tabs.map(function (x, i) { return '<a href="#' + x[0] + '" data-tab="' + x[0] + '"' + (i ? '' : ' class="is-active"') + '>' + x[1] + '</a>'; }).join('') + '</nav>' +
        '<section class="psec" id="overview"><h2>عن العقار</h2><p class="desc">' + ui.esc(p.description) + '</p></section>' +
        investHtml +
        '<section class="psec" id="details"><h2>التفاصيل والمواصفات</h2><div class="specs">' + specGroups + '</div></section>' +
        (featHtml ? '<section class="psec" id="features"><h2>المزايا</h2><div class="features">' + featHtml + '</div></section>' : '') +
        '<section class="psec" id="location"><h2>الموقع والخدمات القريبة</h2><div class="nearby-summary" data-nb-summary></div>' +
          '<div class="nearby"><div class="nearby__map" data-nb-map></div><div class="nearby__side"><div class="nearby__cats" data-nb-cats></div><ul class="nearby__list" data-nb-list><li class="muted" style="padding:16px">جارِ تحميل الخدمات القريبة…</li></ul><p class="nearby__note" data-nb-note></p></div></div>' +
          '<p style="margin-top:14px"><a class="link" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '" target="_blank" rel="noopener">' + I('map') + 'الاتجاهات إلى العقار</a></p>' +
        '</section>' +
        '<section class="psec" id="legal"><h2>بيانات الترخيص</h2>' + legalHtml + '</section>' +
      '</div>' +

      '<aside class="side">' +
        '<div class="pricebox"><span class="pricebox__label">' + priceLabel + '</span>' +
          '<div class="pricebox__price">' + ui.money(p.price) + '<small>' + ui.priceSuffix(p) + '</small></div>' + subs + actions + '</div>' +
        '<div class="agent"><div class="avatar" aria-hidden="true">' + agent.name.charAt(0) + '</div><div><b>' + agent.name + '</b><small>' + agent.role + '</small>' +
          '<small>رخصة فال: <bdi>' + agent.fal + '</bdi></small><small dir="ltr" style="text-align:right">' + agent.phone + '</small></div></div>' +
        calc +
      '</aside></div>' +

      '<section class="section" id="similar" style="padding-bottom:0"><div class="section-head"><div><span class="eyebrow">قد يعجبك أيضاً</span><h2 class="h2">عقارات مشابهة</h2></div><a class="link" href="/properties#' + p.offer + '">المزيد ' + I('arrowL') + '</a></div><div class="grid-cards grid-cards--4" data-similar></div></section>' +

      '<div class="mobile-bar"><div class="price">' + ui.money(p.price) + '<small>' + ui.priceSuffix(p) + '</small></div>' +
        (closed ? '<a class="btn btn--primary" href="#similar">عقارات مشابهة</a>' :
        '<a class="btn btn--wa" href="https://wa.me/' + agent.whatsapp + '?text=' + waText + '" target="_blank" rel="noopener" aria-label="واتساب">' + I('whatsapp') + '</a><button class="btn btn--primary" type="button" data-book="' + (p.status === 'reserved' ? 'waitlist' : 'viewing') + '">' + (p.status === 'reserved' ? 'أبلغني' : 'احجز معاينة') + '</button>') +
      '</div>';
    document.body.classList.add('has-mobile-bar');

    bind(p);
    nearby(p);
    api.getSimilar(p, 4).then(function (list) { root.querySelector('[data-similar]').innerHTML = list.map(function (x) { return ui.card(x); }).join(''); });
  }

  /* ---------------------------------------------------------------- */
  function bind(p) {
    root.querySelectorAll('[data-lb]').forEach(function (b) { b.addEventListener('click', function () { lightbox(p, +b.dataset.lb); }); });
    root.querySelectorAll('[data-book]').forEach(function (b) { b.addEventListener('click', function () { bookForm(p, b.dataset.book); }); });
    if (MZ.rt) MZ.rt.onProperty(p.id, function () { ui.toast('تم تحديث حالة العقار'); setTimeout(function () { location.reload(); }, 1400); });
    root.querySelector('[data-share]').addEventListener('click', function () {
      var url = location.href;
      try { navigator.clipboard.writeText(url).then(function () { ui.toast('تم نسخ رابط العقار'); }, function () { ui.toast('انسخ الرابط من شريط العنوان'); }); }
      catch (e) { ui.toast('انسخ الرابط من شريط العنوان'); }
    });

    /* scroll spy */
    var links = root.querySelectorAll('[data-tab]');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) links.forEach(function (a) { a.classList.toggle('is-active', a.dataset.tab === en.target.id); });
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      root.querySelectorAll('.psec').forEach(function (s) { io.observe(s); });
    }
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var t = document.getElementById(a.dataset.tab); if (t) t.scrollIntoView({ behavior: 'smooth' });
      });
    });
    var sim = root.querySelectorAll('a[href="#similar"]');
    sim.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); document.getElementById('similar').scrollIntoView({ behavior: 'smooth' }); }); });

    /* mortgage calc */
    var c = root.querySelector('[data-calc]');
    if (c) {
      var calc = function () {
        var down = Math.min(90, Math.max(0, +c.querySelector('#c-down').value || 0)) / 100;
        var years = Math.min(30, Math.max(1, +c.querySelector('#c-years').value || 1));
        var r = (+c.querySelector('#c-rate').value || 0) / 100 / 12, n = years * 12, P = p.price * (1 - down);
        var m = r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
        c.querySelector('[data-calc-out]').innerHTML = ui.money(Math.round(m));
      };
      c.addEventListener('input', calc); calc();
    }
  }

  /* ---------------- Lightbox ---------------- */
  function lightbox(p, start) {
    var i = start, imgs = p.images;
    var m = ui.openModal('<div class="lb"><span class="lb__count" data-lb-count></span><div class="lb__stage"><img data-lb-img alt="">' +
      '<button class="lb__nav lb__prev" type="button" data-lb-prev aria-label="الصورة السابقة">' + I('chevR') + '</button>' +
      '<button class="lb__nav lb__next" type="button" data-lb-next aria-label="الصورة التالية">' + I('chevL') + '</button></div>' +
      '<div class="lb__thumbs">' + imgs.map(function (k, j) { return '<button type="button" data-lb-go="' + j + '" aria-label="صورة ' + (j + 1) + '"><img src="' + ui.img(k) + '" alt=""></button>'; }).join('') + '</div></div>',
      { wide: true, label: 'معرض صور العقار' });
    function show(j) {
      i = (j + imgs.length) % imgs.length;
      m.querySelector('[data-lb-img]').src = ui.img(imgs[i]);
      m.querySelector('[data-lb-img]').alt = p.title + ' — صورة ' + (i + 1);
      m.querySelector('[data-lb-count]').textContent = (i + 1) + ' / ' + imgs.length;
      m.querySelectorAll('[data-lb-go]').forEach(function (b) { b.setAttribute('aria-current', +b.dataset.lbGo === i); });
    }
    m.querySelector('[data-lb-prev]').addEventListener('click', function () { show(i - 1); });
    m.querySelector('[data-lb-next]').addEventListener('click', function () { show(i + 1); });
    m.querySelectorAll('[data-lb-go]').forEach(function (b) { b.addEventListener('click', function () { show(+b.dataset.lbGo); }); });
    m.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') show(i + 1); if (e.key === 'ArrowRight') show(i - 1); });
    show(i);
  }

  /* ---------------- Booking / waitlist form ---------------- */
  function bookForm(p, kind) {
    var today = new Date().toISOString().slice(0, 10);
    var isWait = kind === 'waitlist';
    var m = ui.openModal(
      '<h3>' + (isWait ? 'أبلغني عند إتاحة العقار' : 'حجز موعد معاينة') + '</h3><p class="muted">' + ui.esc(p.title) + ' · <bdi>' + p.code + '</bdi></p>' +
      '<form class="form-grid" novalidate data-book-form>' +
        '<div class="field full"><label for="b-name">الاسم</label><input id="b-name" class="input" name="name" required autocomplete="name"></div>' +
        '<div class="field full"><label for="b-phone">رقم الجوال</label><input id="b-phone" class="input" name="phone" required inputmode="tel" dir="ltr" placeholder="05XXXXXXXX" autocomplete="tel"><span class="err" data-err="phone" hidden>أدخل رقم جوال سعودي صحيح يبدأ بـ 05</span></div>' +
        (isWait ? '' :
        '<div class="field"><label for="b-date">التاريخ المفضل</label><input id="b-date" class="input" type="date" name="date" min="' + today + '" required></div>' +
        '<div class="field"><label for="b-time">الفترة</label><select id="b-time" class="select" name="slot"><option value="morning">صباحاً (9 – 12)</option><option value="afternoon">عصراً (4 – 6)</option><option value="evening">مساءً (7 – 9)</option></select></div>') +
        '<div class="field full"><label for="b-notes">ملاحظات (اختياري)</label><textarea id="b-notes" class="textarea" name="notes" rows="3"></textarea></div>' +
        '<div class="full"><button class="btn btn--primary btn--block" type="submit">' + (isWait ? 'سجّل اهتمامي' : 'تأكيد طلب المعاينة') + '</button></div>' +
      '</form>', { label: isWait ? 'تسجيل الاهتمام' : 'حجز موعد معاينة' });

    var f = m.querySelector('[data-book-form]');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var phone = f.phone.value, ok = true;
      [f.name, f.phone, f.date].forEach(function (el) { if (el) { var bad = !el.value.trim(); el.setAttribute('aria-invalid', bad); if (bad) ok = false; } });
      var phoneOk = ui.validPhone(phone);
      f.phone.setAttribute('aria-invalid', !phoneOk); m.querySelector('[data-err="phone"]').hidden = phoneOk || !phone;
      if (!ok || !phoneOk) { (f.querySelector('[aria-invalid="true"]') || f.name).focus(); return; }
      var btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'جارِ الإرسال…';
      api.submitLead({ type: kind, propertyId: p.id, name: f.name.value.trim(), phone: phone, date: f.date ? f.date.value : null, slot: f.slot ? f.slot.value : null, notes: f.notes.value.trim() })
        .then(function (r) {
          m.querySelector('.modal__box').innerHTML = '<button class="icon-btn modal__x" type="button" data-modal-close aria-label="إغلاق">' + I('close') + '</button>' +
            '<div class="success"><div class="ic-wrap">' + I('check') + '</div><h3>' + (isWait ? 'سجّلنا اهتمامك' : 'استلمنا طلب المعاينة') + '</h3>' +
            '<p class="muted">سيتواصل معك ' + p.agent.name + ' لتأكيد ' + (isWait ? 'التفاصيل عند إتاحة العقار' : 'الموعد') + '. رقم الطلب: <bdi>' + r.id + '</bdi></p>' +
            (r.demo ? '<p class="demo-note">وضع تجريبي: لم يُرسل الطلب لأي جهة. سيعمل الإرسال بعد ربط الباك إند.</p>' : '') +
            '<button class="btn btn--ghost" type="button" data-modal-close>إغلاق</button></div>';
        })
        .catch(function () { btn.disabled = false; btn.textContent = 'إعادة المحاولة'; ui.toast('تعذّر الإرسال، حاول مرة أخرى'); });
    });
  }

  /* ---------------- Nearby services ---------------- */
  function nearby(p) {
    var mapEl = root.querySelector('[data-nb-map]');
    var mapP = MZ.map.create(mapEl, { center: [p.lat, p.lng], zoom: 15, scrollZoom: false });
    Promise.all([mapP, api.getNearby(p)]).then(function (res) {
      var m = res[0], data = res[1], items = data.items, current = 'all', pins = {};
      var note = root.querySelector('[data-nb-note]');
      note.innerHTML = I('info') + (data.source === 'sample'
        ? 'بيانات توضيحية للمعاينة — تُجلب الخدمات الفعلية من OpenStreetMap بعد الرفع على السيرفر.'
        : data.source === 'osm' ? 'المصدر: مساهمو OpenStreetMap ضمن نطاق ' + (cfg.nearby.radius / 1000) + ' كم.' : 'ضمن نطاق ' + (cfg.nearby.radius / 1000) + ' كم.');

      /* summary: nearest per key category */
      var keyCats = ['mosque', 'school', 'health', 'grocery', 'mall'];
      root.querySelector('[data-nb-summary]').innerHTML = keyCats.map(function (c) {
        var it = items.filter(function (x) { return x.cat === c; })[0];
        return '<div>' + I(S.nearby[c].icon) + '<span>أقرب ' + S.nearby[c].label.replace(/^(مساجد|مدارس|مستشفيات ومراكز صحية|أسواق غذائية|مراكز تجارية)$/, function (w) { return { 'مساجد': 'مسجد', 'مدارس': 'مدرسة', 'مستشفيات ومراكز صحية': 'مركز صحي', 'أسواق غذائية': 'سوق غذائي', 'مراكز تجارية': 'مركز تجاري' }[w]; }) + '</span><b>' + (it ? ui.dist(it.distance) : 'غير متوفر') + '</b></div>';
      }).join('');

      var counts = {}; items.forEach(function (x) { counts[x.cat] = (counts[x.cat] || 0) + 1; });
      var cats = root.querySelector('[data-nb-cats]');
      cats.innerHTML = '<button type="button" class="chip" data-cat="all" aria-pressed="true">الكل (' + items.length + ')</button>' +
        Object.keys(S.nearby).filter(function (c) { return counts[c]; }).map(function (c) {
          return '<button type="button" class="chip" data-cat="' + c + '" aria-pressed="false">' + I(S.nearby[c].icon) + S.nearby[c].label + ' (' + counts[c] + ')</button>';
        }).join('');

      if (m) {
        m.circle(p.lat, p.lng, cfg.nearby.radius);
        m.marker(p.lat, p.lng, MZ.map.homePin(), { z: 2000, title: p.title });
      }
      var list = root.querySelector('[data-nb-list]');

      function draw() {
        var vis = items.filter(function (x) { return current === 'all' || x.cat === current; });
        list.innerHTML = vis.length ? vis.slice(0, 60).map(function (x) {
          var walk = Math.max(1, Math.round(x.distance / 80)), drive = Math.max(1, Math.round(x.distance / 450) + 1);
          return '<li><button type="button" data-poi="' + x.id + '"><span class="ico">' + I(S.nearby[x.cat].icon) + '</span><span><b>' + ui.esc(x.name) + '</b><small>' + S.nearby[x.cat].label + '</small></span>' +
            '<span class="d">' + ui.dist(x.distance) + '<small>' + (x.distance <= 1200 ? I('walk') + walk + ' د مشياً' : I('drive') + drive + ' د بالسيارة') + '</small></span></button></li>';
        }).join('') : '<li class="muted" style="padding:16px">لا توجد نتائج في هذا التصنيف ضمن النطاق.</li>';
        if (!m) return;
        Object.keys(pins).forEach(function (k) { pins[k].remove(); }); pins = {};
        vis.forEach(function (x) {
          pins[x.id] = m.marker(x.lat, x.lng, MZ.map.poiPin(x.cat), { title: x.name, onClick: function () { activate(x.id, true); } });
        });
        m.fit([[p.lat, p.lng]].concat(vis.map(function (x) { return [x.lat, x.lng]; })), 30);
      }
      function activate(id, fromMap) {
        Object.keys(pins).forEach(function (k) { pins[k].setActive(k === id); });
        list.querySelectorAll('[data-poi]').forEach(function (b) { b.classList.toggle('is-active', b.dataset.poi === id); });
        var b = list.querySelector('[data-poi="' + id + '"]');
        if (fromMap && b) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        if (!fromMap && m) { var it = items.filter(function (x) { return x.id === id; })[0]; if (it) m.panTo([it.lat, it.lng]); }
      }
      cats.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cat]'); if (!b) return;
        current = b.dataset.cat;
        cats.querySelectorAll('[data-cat]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        draw();
      });
      list.addEventListener('click', function (e) { var b = e.target.closest('[data-poi]'); if (b) activate(b.dataset.poi, false); });
      draw();
    });
  }
  });
})(window.MZ);
