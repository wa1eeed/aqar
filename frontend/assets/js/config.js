/* =========================================================
   الإعدادات العامة — عدّل هنا فقط عند الربط بالباك إند
   ========================================================= */
window.MZ = window.MZ || {};

MZ.config = {
  brand: {
    name: 'منزلة',
    fullName: 'منزلة العقارية',
    tagline: 'عقارات تليق بمنزلتك',
    falLicense: '[رقم رخصة فال للمنشأة]',
    cr: '[رقم السجل التجاري]',
    address: '[عنوان المقر الرئيسي]، الرياض'
  },

  contact: {
    phone: '+966500000000',          // [رقم التواصل]
    phoneDisplay: '050 000 0000',
    whatsapp: '966500000000',        // بدون + للروابط
    email: 'info@example.com',       // [البريد الرسمي]
    hours: 'الأحد – الخميس، 9 ص – 9 م'
  },

  /* مصدر البيانات:
     'api'  = الباك إند (نقاط /api/v1/public/* — راجع docs/02)
     'mock' = بيانات تجريبية من data/properties.js (للتطوير المحلي فقط:
              أضِف ?mock=1 للرابط أو localStorage.mz_mock='1') */
  dataSource: 'api',
  apiBase: '/api/v1/public',

  /* الخريطة: 'osm' (افتراضي، مجاني) أو 'google' (يحتاج مفتاح) */
  map: {
    provider: 'osm',
    googleApiKey: '',
    tiles: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; مساهمو OpenStreetMap'
  },

  /* الخدمات القريبة:
     'osm' = بحث مباشر من OpenStreetMap (Overpass API)
     'api' = من الباك إند: GET {apiBase}/properties/:id/nearby
     عند فشل المصدر تُعرض بيانات تجريبية مع تنبيه واضح */
  nearby: {
    source: 'api',
    radius: 2000,
    overpassUrl: 'https://overpass-api.de/api/interpreter',
    fallbackToSample: true
  },

  pageSize: 12,
  currency: 'ر.س'
};

/* تفعيل وضع البيانات التجريبية محلياً: ?mock=1 أو localStorage.mz_mock='1' */
(function () {
  try {
    var m = /[?&]mock=1/.test(location.search) || localStorage.getItem('mz_mock') === '1';
    if (m) { MZ.config.dataSource = 'mock'; MZ.config.nearby.source = 'osm'; }
  } catch (e) { /* ignore */ }
})();
