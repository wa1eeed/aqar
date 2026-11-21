(function (MZ) {
  MZ.boot().then(function () {
  var S = MZ.schema, ui = MZ.ui, api = MZ.api, cfg = MZ.config, I = ui.icon;
  ui.mount('contact');

  var REQS = [
    ['buy', 'أبحث عن عقار للشراء', 'search'],
    ['rent', 'أبحث عن عقار للإيجار', 'key'],
    ['list', 'أعرض عقاري', 'plus'],
    ['invest', 'استشارة استثمارية', 'chart'],
    ['manage', 'إدارة أملاك', 'building']
  ];
  var req = document.querySelector('[data-req]');
  var initial = location.hash === '#list' ? 'list' : 'buy';
  req.innerHTML = REQS.map(function (r) {
    return '<label><input type="radio" name="request" value="' + r[0] + '"' + (r[0] === initial ? ' checked' : '') + '><span>' + I(r[2]) + r[1] + '</span></label>';
  }).join('');

  var f = document.querySelector('[data-contact]');
  f.city.innerHTML = '<option value="">اختر المدينة</option>' + S.cities.map(function (c) { return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('');
  f.type.innerHTML = '<option value="">اختر النوع</option>' + Object.keys(S.types).map(function (k) { return '<option value="' + k + '">' + S.types[k].label + '</option>'; }).join('');

  function syncReq() {
    var v = f.request.value;
    var lbl = document.querySelector('[data-budget-label]');
    lbl.textContent = v === 'list' ? 'السعر المتوقع (ر.س)' : v === 'manage' ? 'عدد الوحدات' : 'الميزانية التقريبية (ر.س)';
    f.budget.placeholder = v === 'manage' ? 'مثال: 12' : 'مثال: 2,000,000';
  }
  req.addEventListener('change', syncReq); syncReq();
  window.addEventListener('hashchange', function () { if (location.hash === '#list') { f.querySelector('[value="list"]').checked = true; syncReq(); } });

  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true;
    [f.name, f.phone].forEach(function (el) { var bad = !el.value.trim(); el.setAttribute('aria-invalid', bad); if (bad) ok = false; });
    var pOk = ui.validPhone(f.phone.value);
    if (f.phone.value) { f.phone.setAttribute('aria-invalid', !pOk); document.querySelector('[data-err="phone"]').hidden = pOk; }
    document.querySelector('[data-err="consent"]').hidden = f.consent.checked;
    if (!ok || !pOk || !f.consent.checked) { (f.querySelector('[aria-invalid="true"]') || f.consent).focus(); return; }
    var btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'جارِ الإرسال…';
    api.submitLead({ type: f.request.value, name: f.name.value.trim(), phone: f.phone.value, email: f.email.value, city: f.city.value, propertyType: f.type.value, budget: f.budget.value, message: f.message.value })
      .then(function (r) {
        document.querySelector('[data-form-panel]').innerHTML = '<div class="success"><div class="ic-wrap">' + I('check') + '</div><h2 style="font-size:24px">استلمنا طلبك</h2>' +
          '<p class="muted">سيتواصل معك أحد مستشارينا خلال يوم عمل. رقم الطلب: <bdi>' + r.id + '</bdi></p>' +
          (r.demo ? '<p class="demo-note">وضع تجريبي: لم يُرسل الطلب لأي جهة. سيعمل الإرسال بعد ربط الباك إند.</p>' : '') +
          '<a class="btn btn--primary" href="/properties">تصفّح العقارات</a></div>';
      })
      .catch(function () { btn.disabled = false; btn.textContent = 'إعادة المحاولة'; ui.toast('تعذّر الإرسال، حاول مرة أخرى'); });
  });

  document.querySelector('[data-info]').innerHTML = [
    ['phone', 'الهاتف', '<span dir="ltr">' + cfg.contact.phoneDisplay + '</span>', 'tel:' + cfg.contact.phone],
    ['whatsapp', 'واتساب', '<span dir="ltr">' + cfg.contact.phoneDisplay + '</span>', 'https://wa.me/' + cfg.contact.whatsapp],
    ['mail', 'البريد الإلكتروني', cfg.contact.email, 'mailto:' + cfg.contact.email],
    ['pin', 'المقر الرئيسي', cfg.brand.address, null],
    ['clock', 'ساعات العمل', cfg.contact.hours, null]
  ].map(function (x) {
    var inner = '<div class="ic-wrap">' + I(x[0]) + '</div><div><span>' + x[1] + '</span><b>' + x[2] + '</b></div>';
    return x[3] ? '<a class="info-item" href="' + x[3] + '"' + (x[3].indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '') + '>' + inner + '</a>' : '<div class="info-item">' + inner + '</div>';
  }).join('');

  /* موقع المكتب — عدّل الإحداثيات */
  var office = [24.7136, 46.6753];
  MZ.map.create(document.querySelector('[data-office-map]'), { center: office, zoom: 14, scrollZoom: false }).then(function (m) {
    if (m) m.marker(office[0], office[1], MZ.map.homePin(), { title: cfg.brand.fullName });
  });
  });
})(window.MZ);
