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
     'api'  = الباك إند (الافتراضي). إن تعذّر الوصول إليه يتحوّل الموقع تلقائياً للبيانات التجريبية.
     'mock' = بيانات تجريبية من data/properties.js (للتطوير: أضف ?mock=1 للرابط) */
  dataSource: 'api',
  apiBase: '/api/v1',

  /* الخريطة: 'osm' (افتراضي، مجاني) أو 'google' (يحتاج مفتاح) */
  map: {
    provider: 'osm',
    googleApiKey: '',
    tiles: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; مساهمو OpenStreetMap'
  },

  /* الخدمات القريبة: من الباك إند GET {apiBase}/public/properties/:id/nearby
     (البيانات التوضيحية تظهر في وضع البيانات التجريبية فقط) */
  nearby: {
    source: 'api',
    radius: 2000
  },

  pageSize: 12,
  currency: 'ر.س'
};
