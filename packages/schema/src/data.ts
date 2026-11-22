/**
 * عقار أونلاين — بيانات نموذج العقار (المصدر الوحيد).
 * منقول حرفياً من frontend/assets/js/schema.js بدون تغيير أي مفتاح أو تسمية أو خيار.
 * عدّل هنا فقط؛ ملف frontend/assets/js/schema.js مُولَّد من هذا الملف.
 */
import { ALL, type SchemaData } from './types.js';

const RES: string[] = ['villa', 'apartment', 'floor', 'townhouse'];
const BUILT: string[] = [
  'villa',
  'apartment',
  'floor',
  'townhouse',
  'building',
  'tower',
  'office',
  'showroom',
  'warehouse',
  'istiraha',
  'farm',
];

export const schemaData: SchemaData = {
  offers: {
    sale: { label: 'للبيع', short: 'بيع' },
    rent: { label: 'للإيجار', short: 'إيجار' },
    investment: { label: 'للاستثمار', short: 'استثمار' },
  },

  statuses: {
    available: { label: 'متاح', offers: ['sale', 'rent', 'investment'] },
    negotiation: { label: 'قيد التفاوض', offers: ['sale', 'rent', 'investment'] },
    reserved: { label: 'محجوز', offers: ['sale', 'rent', 'investment'] },
    sold: { label: 'تم البيع', offers: ['sale', 'investment'] },
    rented: { label: 'تم التأجير', offers: ['rent'] },
  },
  closedStatuses: ['sold', 'rented'],

  categories: {
    residential: 'سكني',
    commercial: 'تجاري',
    land: 'أراضي',
    leisure: 'استراحات ومزارع',
  },

  types: {
    land: { label: 'أرض', plural: 'أراضي', cat: 'land', icon: 'land', offers: ['sale', 'investment', 'rent'] },
    villa: { label: 'فيلا', plural: 'فلل', cat: 'residential', icon: 'villa', offers: ['sale', 'rent', 'investment'] },
    apartment: { label: 'شقة', plural: 'شقق', cat: 'residential', icon: 'apartment', offers: ['sale', 'rent'] },
    floor: { label: 'دور', plural: 'أدوار', cat: 'residential', icon: 'floor', offers: ['sale', 'rent'] },
    townhouse: { label: 'تاون هاوس', plural: 'تاون هاوس', cat: 'residential', icon: 'townhouse', offers: ['sale', 'rent'] },
    building: { label: 'عمارة', plural: 'عمائر', cat: 'commercial', icon: 'building', offers: ['sale', 'investment', 'rent'] },
    tower: { label: 'برج', plural: 'أبراج', cat: 'commercial', icon: 'tower', offers: ['sale', 'investment', 'rent'] },
    office: { label: 'مكتب', plural: 'مكاتب', cat: 'commercial', icon: 'office', offers: ['rent', 'sale'] },
    showroom: { label: 'معرض تجاري', plural: 'معارض ومحلات', cat: 'commercial', icon: 'showroom', offers: ['rent', 'sale', 'investment'] },
    warehouse: { label: 'مستودع', plural: 'مستودعات', cat: 'commercial', icon: 'warehouse', offers: ['rent', 'sale', 'investment'] },
    istiraha: { label: 'استراحة', plural: 'استراحات', cat: 'leisure', icon: 'istiraha', offers: ['sale', 'rent'] },
    farm: { label: 'مزرعة', plural: 'مزارع', cat: 'leisure', icon: 'farm', offers: ['sale', 'investment'] },
  },

  rentPeriods: { yearly: 'سنوي', monthly: 'شهري', daily: 'يومي' },

  cities: [
    { id: 'riyadh', label: 'الرياض', center: [24.7136, 46.6753], districts: ['الملقا', 'حطين', 'النرجس', 'الياسمين', 'العليا', 'العقيق', 'الصحافة', 'الربيع', 'قرطبة', 'السلي', 'الرمال', 'المهدية'] },
    { id: 'jeddah', label: 'جدة', center: [21.5433, 39.1728], districts: ['الشاطئ', 'أبحر الشمالية', 'الروضة', 'الزهراء', 'المحمدية', 'السلامة', 'الحمدانية'] },
    { id: 'dammam', label: 'الدمام', center: [26.4207, 50.0888], districts: ['الشاطئ الغربي', 'الفيصلية', 'المزروعية', 'الريان', 'النورس', 'المدينة الصناعية الثانية'] },
    { id: 'khobar', label: 'الخبر', center: [26.2172, 50.1971], districts: ['الكورنيش', 'العليا', 'الحزام الذهبي', 'الراكة', 'الجسر'] },
    { id: 'makkah', label: 'مكة المكرمة', center: [21.3891, 39.8579], districts: ['العزيزية', 'الشوقية', 'النسيم', 'العوالي'] },
    { id: 'madinah', label: 'المدينة المنورة', center: [24.5247, 39.5692], districts: ['قباء', 'العزيزية', 'الخالدية', 'شوران'] },
  ],

  fieldGroups: [
    { id: 'basic', label: 'المعلومات الأساسية' },
    { id: 'rooms', label: 'المكونات والمساحات' },
    { id: 'land', label: 'بيانات الأرض' },
    { id: 'invest', label: 'البيانات الاستثمارية' },
    { id: 'rent', label: 'شروط الإيجار' },
    { id: 'features', label: 'المزايا' },
    { id: 'legal', label: 'البيانات النظامية' },
  ],

  fields: [
    /* ---------- أساسية ---------- */
    { key: 'area', label: 'المساحة', group: 'basic', kind: 'number', unit: 'م²', types: ALL, offers: ALL, icon: 'area', key_fact: true, filter: true, required: true },
    { key: 'builtArea', label: 'مسطّح البناء', group: 'basic', kind: 'number', unit: 'م²', types: BUILT, offers: ALL },
    { key: 'constructionStatus', label: 'حالة البناء', group: 'basic', kind: 'select', types: BUILT, offers: ALL, filter: true, options: { ready: 'جاهز', under_construction: 'تحت الإنشاء', off_plan: 'على الخارطة' } },
    { key: 'age', label: 'عمر العقار', group: 'basic', kind: 'number', unit: 'سنة', types: BUILT, offers: ALL, icon: 'calendar', key_fact: true, zeroLabel: 'جديد' },
    { key: 'facade', label: 'الواجهة', group: 'basic', kind: 'select', types: ALL, offers: ALL, icon: 'compass', key_fact: true, filter: true, options: { north: 'شمالية', south: 'جنوبية', east: 'شرقية', west: 'غربية', north_east: 'شمالية شرقية', north_west: 'شمالية غربية', south_east: 'جنوبية شرقية', south_west: 'جنوبية غربية', three: '3 شوارع', four: '4 شوارع' } },
    { key: 'streetWidth', label: 'عرض الشارع', group: 'basic', kind: 'number', unit: 'م', types: ALL, offers: ALL, icon: 'road' },
    { key: 'streetsCount', label: 'عدد الشوارع', group: 'basic', kind: 'number', types: ['land', 'villa', 'building', 'showroom', 'warehouse', 'tower'], offers: ALL },

    /* ---------- المكونات ---------- */
    { key: 'bedrooms', label: 'غرف النوم', group: 'rooms', kind: 'number', types: RES, offers: ALL, icon: 'bed', key_fact: true, filter: true },
    { key: 'bathrooms', label: 'دورات المياه', group: 'rooms', kind: 'number', types: RES.concat(['office', 'istiraha', 'showroom']), offers: ALL, icon: 'bath', key_fact: true, filter: true },
    { key: 'livingRooms', label: 'الصالات', group: 'rooms', kind: 'number', types: RES.concat(['istiraha']), offers: ALL, icon: 'sofa' },
    { key: 'majlis', label: 'المجالس', group: 'rooms', kind: 'number', types: ['villa', 'floor', 'townhouse', 'istiraha', 'farm'], offers: ALL },
    { key: 'kitchen', label: 'المطبخ', group: 'rooms', kind: 'select', types: RES.concat(['istiraha']), offers: ALL, options: { fitted: 'مركّب', not_fitted: 'غير مركّب' } },
    { key: 'floorNumber', label: 'رقم الدور', group: 'rooms', kind: 'number', types: ['apartment', 'floor', 'office'], offers: ALL, icon: 'layers', zeroLabel: 'الأرضي' },
    { key: 'floors', label: 'عدد الأدوار', group: 'rooms', kind: 'number', types: ['villa', 'townhouse', 'building', 'tower'], offers: ALL, icon: 'layers', key_fact: true },
    { key: 'units', label: 'عدد الوحدات', group: 'rooms', kind: 'number', types: ['building', 'tower'], offers: ALL, icon: 'grid', key_fact: true },
    { key: 'shops', label: 'عدد المحلات', group: 'rooms', kind: 'number', types: ['building', 'tower'], offers: ALL },
    { key: 'elevators', label: 'المصاعد', group: 'rooms', kind: 'number', types: ['apartment', 'building', 'tower', 'office'], offers: ALL },
    { key: 'parking', label: 'مواقف السيارات', group: 'rooms', kind: 'number', types: BUILT, offers: ALL, icon: 'car' },
    { key: 'ceilingHeight', label: 'ارتفاع السقف', group: 'rooms', kind: 'number', unit: 'م', types: ['warehouse', 'showroom'], offers: ALL, key_fact: true, icon: 'ruler' },
    { key: 'frontage', label: 'طول الواجهة', group: 'rooms', kind: 'number', unit: 'م', types: ['showroom'], offers: ALL, key_fact: true, icon: 'ruler' },
    { key: 'loadingDocks', label: 'أرصفة التحميل', group: 'rooms', kind: 'number', types: ['warehouse'], offers: ALL },
    { key: 'wells', label: 'الآبار', group: 'rooms', kind: 'number', types: ['farm'], offers: ALL, key_fact: true, icon: 'drop' },
    { key: 'palms', label: 'عدد النخيل', group: 'rooms', kind: 'number', types: ['farm', 'istiraha'], offers: ALL, key_fact: true, icon: 'palm' },

    /* ---------- الأرض ---------- */
    { key: 'landUse', label: 'استخدام الأرض', group: 'land', kind: 'select', types: ['land', 'farm'], offers: ALL, filter: true, key_fact: true, icon: 'land', options: { residential: 'سكني', commercial: 'تجاري', mixed: 'سكني تجاري', agricultural: 'زراعي', industrial: 'صناعي' } },
    { key: 'dimensions', label: 'الأطوال', group: 'land', kind: 'text', types: ['land'], offers: ALL },
    { key: 'planNo', label: 'رقم المخطط', group: 'land', kind: 'text', types: ['land', 'villa', 'building', 'farm', 'istiraha'], offers: ALL },
    { key: 'plotNo', label: 'رقم القطعة', group: 'land', kind: 'text', types: ['land', 'villa', 'building', 'istiraha'], offers: ALL },

    /* ---------- الاستثمار ---------- */
    { key: 'investmentModel', label: 'نموذج الاستثمار', group: 'invest', kind: 'select', types: ALL, offers: ['investment'], options: { income: 'دخل تأجيري قائم', development: 'تطوير', partnership: 'شراكة', bot: 'بناء وتشغيل ونقل (BOT)', lease: 'تأجير طويل الأجل' } },
    { key: 'annualIncome', label: 'الدخل السنوي', group: 'invest', kind: 'money', types: ALL, offers: ['investment'] },
    { key: 'roi', label: 'العائد السنوي', group: 'invest', kind: 'number', unit: '%', types: ALL, offers: ['investment'], filter: true },
    { key: 'occupancy', label: 'نسبة الإشغال', group: 'invest', kind: 'number', unit: '%', types: ['building', 'tower', 'office', 'showroom', 'warehouse'], offers: ['investment'] },
    { key: 'leaseTerm', label: 'مدة العقد', group: 'invest', kind: 'number', unit: 'سنة', types: ALL, offers: ['investment'] },

    /* ---------- الإيجار ---------- */
    { key: 'payments', label: 'الدفعات', group: 'rent', kind: 'select', types: ALL, offers: ['rent'], options: { '1': 'دفعة واحدة', '2': 'دفعتان', '4': '4 دفعات', '12': 'شهري' } },
    { key: 'deposit', label: 'مبلغ التأمين', group: 'rent', kind: 'money', types: ALL, offers: ['rent'] },
    { key: 'familiesOnly', label: 'للعائلات فقط', group: 'rent', kind: 'bool', types: RES, offers: ['rent'] },
    { key: 'ejar', label: 'عقد موثّق عبر إيجار', group: 'rent', kind: 'bool', types: ALL, offers: ['rent'] },

    /* ---------- المزايا ---------- */
    { key: 'furnished', label: 'التأثيث', group: 'features', kind: 'select', types: RES.concat(['office', 'istiraha']), offers: ALL, filter: true, options: { yes: 'مفروش', partial: 'مفروش جزئياً', no: 'غير مفروش' } },
    { key: 'ac', label: 'التكييف', group: 'features', kind: 'select', types: BUILT, offers: ALL, options: { central: 'مركزي', split: 'سبليت', concealed: 'مخفي', none: 'بدون' } },
    { key: 'maidRoom', label: 'غرفة خادمة', group: 'features', kind: 'bool', types: RES, offers: ALL, filter: true },
    { key: 'driverRoom', label: 'غرفة سائق', group: 'features', kind: 'bool', types: ['villa', 'townhouse', 'floor'], offers: ALL, filter: true },
    { key: 'annex', label: 'ملحق', group: 'features', kind: 'bool', types: ['villa', 'townhouse', 'floor'], offers: ALL, filter: true },
    { key: 'pool', label: 'مسبح', group: 'features', kind: 'bool', types: ['villa', 'townhouse', 'istiraha', 'farm', 'apartment'], offers: ALL, filter: true },
    { key: 'basement', label: 'قبو', group: 'features', kind: 'bool', types: ['villa', 'building', 'tower'], offers: ALL },
    { key: 'yard', label: 'حوش', group: 'features', kind: 'bool', types: ['villa', 'townhouse', 'floor', 'istiraha'], offers: ALL },
    { key: 'roof', label: 'سطح خاص', group: 'features', kind: 'bool', types: ['apartment', 'floor', 'townhouse'], offers: ALL },
    { key: 'privateEntrance', label: 'مدخل خاص', group: 'features', kind: 'bool', types: ['floor', 'apartment', 'townhouse'], offers: ALL },
    { key: 'privateElevator', label: 'مصعد داخلي', group: 'features', kind: 'bool', types: ['villa', 'townhouse'], offers: ALL, filter: true },
    { key: 'garden', label: 'حديقة', group: 'features', kind: 'bool', types: ['villa', 'townhouse', 'istiraha', 'farm'], offers: ALL },
    { key: 'smartHome', label: 'أنظمة منزل ذكي', group: 'features', kind: 'bool', types: RES, offers: ALL },
    { key: 'security', label: 'حراسة أمنية', group: 'features', kind: 'bool', types: ['apartment', 'building', 'tower', 'office', 'warehouse', 'townhouse'], offers: ALL },
    { key: 'gym', label: 'نادي رياضي', group: 'features', kind: 'bool', types: ['apartment', 'tower', 'townhouse'], offers: ALL },
    { key: 'playground', label: 'ملعب', group: 'features', kind: 'bool', types: ['istiraha', 'farm'], offers: ALL },
    { key: 'tent', label: 'بيت شعر', group: 'features', kind: 'bool', types: ['istiraha', 'farm'], offers: ALL },
    { key: 'civilDefense', label: 'رخصة دفاع مدني', group: 'features', kind: 'bool', types: ['building', 'tower', 'office', 'showroom', 'warehouse'], offers: ALL },
    { key: 'fireSystem', label: 'نظام إطفاء', group: 'features', kind: 'bool', types: ['building', 'tower', 'office', 'showroom', 'warehouse'], offers: ALL },

    /* ---------- النظامية (الهيئة العامة للعقار) ---------- */
    { key: 'adLicense', label: 'رقم ترخيص الإعلان', group: 'legal', kind: 'text', types: ALL, offers: ALL, required: true },
    { key: 'falLicense', label: 'رقم رخصة فال', group: 'legal', kind: 'text', types: ALL, offers: ALL, required: true },
    { key: 'licenseExpiry', label: 'تاريخ انتهاء الترخيص', group: 'legal', kind: 'date', types: ALL, offers: ALL },
    { key: 'deedType', label: 'نوع الصك', group: 'legal', kind: 'select', types: ALL, offers: ['sale', 'investment'], options: { electronic: 'صك إلكتروني', paper: 'صك ورقي محدّث' } },
    { key: 'mortgage', label: 'يقبل التمويل العقاري', group: 'legal', kind: 'bool', types: RES.concat(['land']), offers: ['sale'], filter: true },
    { key: 'mortgaged', label: 'عليه رهن', group: 'legal', kind: 'bool', types: ALL, offers: ['sale', 'investment'] },
  ],

  nearby: {
    mosque: { label: 'مساجد', icon: 'mosque', osm: '["amenity"="place_of_worship"]["religion"="muslim"]' },
    school: { label: 'مدارس', icon: 'school', osm: '["amenity"~"^(school|kindergarten)$"]' },
    health: { label: 'مستشفيات ومراكز صحية', icon: 'health', osm: '["amenity"~"^(hospital|clinic)$"]' },
    pharmacy: { label: 'صيدليات', icon: 'pharmacy', osm: '["amenity"="pharmacy"]' },
    grocery: { label: 'أسواق غذائية', icon: 'cart', osm: '["shop"~"^(supermarket|convenience)$"]' },
    mall: { label: 'مراكز تجارية', icon: 'bag', osm: '["shop"="mall"]' },
    food: { label: 'مطاعم ومقاهي', icon: 'coffee', osm: '["amenity"~"^(restaurant|cafe)$"]' },
    park: { label: 'حدائق', icon: 'park', osm: '["leisure"="park"]' },
    fuel: { label: 'محطات وقود', icon: 'fuel', osm: '["amenity"="fuel"]' },
    bank: { label: 'بنوك وصرّافات', icon: 'bank', osm: '["amenity"~"^(bank|atm)$"]' },
  },
};
