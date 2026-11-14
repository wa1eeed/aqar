/* =========================================================
   بيانات تجريبية — تُستخدم فقط عندما dataSource = 'mock'
   الأسماء والأرقام والتراخيص هنا أمثلة للعرض وليست حقيقية.
   ========================================================= */
window.MZ = window.MZ || {};

MZ.MOCK_AGENTS = {
  a1: { id: 'a1', name: 'فهد العتيبي', role: 'مستشار عقاري أول', phone: '+966500000001', whatsapp: '966500000001', fal: '1100000101' },
  a2: { id: 'a2', name: 'نورة القحطاني', role: 'مستشارة عقارية', phone: '+966500000002', whatsapp: '966500000002', fal: '1100000102' },
  a3: { id: 'a3', name: 'عبدالله الشمري', role: 'مستشار استثمار عقاري', phone: '+966500000003', whatsapp: '966500000003', fal: '1100000103' }
};

MZ.MOCK_PROPERTIES = [
  {
    id: 1001, type: 'villa', offer: 'sale', status: 'available', featured: true,
    title: 'فيلا مودرن بدرج داخلي ومسبح خاص',
    city: 'riyadh', district: 'الملقا', lat: 24.8040, lng: 46.6170,
    price: 4850000, negotiable: true, agent: 'a1', createdAt: '2026-11-10',
    images: ['photos/villa-modern.jpg', 'photos/int-living2.jpg', 'photos/majlis-out.jpg', 'photos/int-kitchen.jpg', 'photos/int-bedroom.jpg', 'plan-villa'],
    description: 'فيلا بتصميم معاصر على شارع 20 م بواجهة شمالية، مساحات مفتوحة بإضاءة طبيعية، ومسبح خاص مع جلسة خارجية. تشطيبات فاخرة وأنظمة منزل ذكي، وقريبة من طريق الملك سلمان والخدمات الرئيسية.',
    specs: { area: 450, builtArea: 620, constructionStatus: 'ready', age: 0, facade: 'north', streetWidth: 20, streetsCount: 1, bedrooms: 5, bathrooms: 6, livingRooms: 3, majlis: 2, kitchen: 'fitted', floors: 2, parking: 3, furnished: 'no', ac: 'central', maidRoom: true, driverRoom: true, annex: true, pool: true, yard: true, privateElevator: true, smartHome: true, planNo: '3412', plotNo: '718', adLicense: '7200001001', falLicense: '1100000101', licenseExpiry: '2027-05-10', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1002, type: 'apartment', offer: 'rent', status: 'available', featured: true,
    title: 'شقة عائلية واسعة في عمارة حديثة',
    city: 'riyadh', district: 'النرجس', lat: 24.8560, lng: 46.6620,
    price: 75000, rentPeriod: 'yearly', agent: 'a2', createdAt: '2026-11-12',
    images: ['photos/apt-tower.jpg', 'photos/int-living.jpg', 'photos/int-bedroom.jpg', 'photos/int-kitchen.jpg', 'plan-apartment'],
    description: 'شقة في الدور الثاني بمدخل مستقل عن الدرج الرئيسي، 3 غرف نوم منها ماستر، صالة ومطبخ راكب. العمارة جديدة بمصعد ومواقف مخصصة.',
    specs: { area: 165, builtArea: 165, constructionStatus: 'ready', age: 1, facade: 'south', streetWidth: 15, bedrooms: 3, bathrooms: 3, livingRooms: 1, kitchen: 'fitted', floorNumber: 2, elevators: 1, parking: 1, furnished: 'no', ac: 'split', maidRoom: false, roof: false, privateEntrance: true, security: false, payments: '2', deposit: 5000, familiesOnly: true, ejar: true, adLicense: '7200001002', falLicense: '1100000102', licenseExpiry: '2027-02-01' }
  },
  {
    id: 1003, type: 'land', offer: 'sale', status: 'available', featured: false,
    title: 'أرض سكنية زاوية على شارعين',
    city: 'riyadh', district: 'حطين', lat: 24.7620, lng: 46.6020,
    price: 4500000, negotiable: true, agent: 'a1', createdAt: '2026-11-03',
    images: ['photos/land-scrub.jpg', 'photos/land-desert.jpg'],
    description: 'أرض سكنية زاوية بواجهة جنوبية غربية على شارعين 30 م و15 م، مخطط معتمد ومكتمل الخدمات. موقع مناسب لبناء فيلا خاصة أو مشروع فلل.',
    specs: { area: 900, facade: 'south_west', streetWidth: 30, streetsCount: 2, landUse: 'residential', dimensions: '30 × 30 م', planNo: '2456', plotNo: '312', adLicense: '7200001003', falLicense: '1100000101', licenseExpiry: '2027-04-18', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1004, type: 'tower', offer: 'investment', status: 'available', featured: true,
    title: 'برج مكتبي مؤجّر بالكامل على طريق العليا',
    city: 'riyadh', district: 'العليا', lat: 24.6950, lng: 46.6850,
    price: 145000000, agent: 'a3', createdAt: '2026-10-28',
    images: ['photos/tower-glass.jpg', 'photos/int-lobby.jpg', 'photos/office-glass.jpg'],
    description: 'فرصة استثمارية لبرج مكتبي من 18 دوراً بعقود تأجير قائمة مع شركات، إدارة تشغيل احترافية ونسبة إشغال مرتفعة. موقع حيوي على أحد أهم محاور الأعمال في الرياض.',
    specs: { area: 2800, builtArea: 32000, constructionStatus: 'ready', age: 6, facade: 'four', streetWidth: 60, streetsCount: 4, floors: 18, units: 72, shops: 4, elevators: 6, parking: 280, ac: 'central', basement: true, security: true, civilDefense: true, fireSystem: true, investmentModel: 'income', annualIncome: 9800000, roi: 6.8, occupancy: 92, adLicense: '7200001004', falLicense: '1100000103', licenseExpiry: '2027-03-30', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1005, type: 'building', offer: 'investment', status: 'reserved', featured: true,
    title: 'عمارة سكنية تجارية بدخل قائم',
    city: 'riyadh', district: 'الصحافة', lat: 24.8010, lng: 46.6380,
    price: 9200000, agent: 'a3', createdAt: '2026-10-20',
    images: ['photos/townhouse.jpg', 'photos/int-living.jpg', 'plan-apartment'],
    description: '16 شقة سكنية و4 محلات تجارية على شارع تجاري 36 م، عقود موثّقة عبر منصة إيجار ودخل سنوي مستقر.',
    specs: { area: 1050, builtArea: 3100, constructionStatus: 'ready', age: 4, facade: 'east', streetWidth: 36, streetsCount: 1, floors: 4, units: 16, shops: 4, elevators: 2, parking: 20, ac: 'split', basement: false, security: false, civilDefense: true, fireSystem: true, investmentModel: 'income', annualIncome: 720000, roi: 7.8, occupancy: 100, planNo: '1987', plotNo: '45', adLicense: '7200001005', falLicense: '1100000103', licenseExpiry: '2027-01-12', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1006, type: 'villa', offer: 'rent', status: 'rented', featured: false,
    title: 'فيلا قريبة من البحر بحديقة ومسبح',
    city: 'jeddah', district: 'أبحر الشمالية', lat: 21.7290, lng: 39.1010,
    price: 280000, rentPeriod: 'yearly', agent: 'a2', createdAt: '2026-09-15',
    images: ['photos/villa-beach.jpg', 'photos/int-living2.jpg', 'photos/int-bedroom.jpg', 'plan-villa'],
    description: 'فيلا مستقلة بمسافة قصيرة من الواجهة البحرية، حديقة واسعة ومسبح، مناسبة للعائلات الكبيرة.',
    specs: { area: 600, builtArea: 540, constructionStatus: 'ready', age: 5, facade: 'west', streetWidth: 18, bedrooms: 6, bathrooms: 7, livingRooms: 2, majlis: 2, kitchen: 'fitted', floors: 2, parking: 4, furnished: 'partial', ac: 'central', maidRoom: true, driverRoom: true, annex: true, pool: true, garden: true, yard: true, payments: '2', deposit: 15000, familiesOnly: true, ejar: true, adLicense: '7200001006', falLicense: '1100000102', licenseExpiry: '2027-03-01' }
  },
  {
    id: 1007, type: 'apartment', offer: 'sale', status: 'sold', featured: false,
    title: 'شقة بإطلالة بحرية في برج سكني',
    city: 'jeddah', district: 'الشاطئ', lat: 21.6020, lng: 39.1080,
    price: 1650000, agent: 'a2', createdAt: '2026-09-02',
    images: ['photos/marina.jpg', 'photos/int-living2.jpg', 'photos/int-kitchen.jpg', 'plan-apartment'],
    description: 'شقة في الدور 14 بإطلالة مباشرة على البحر، برج بخدمات متكاملة: حراسة ونادي رياضي ومسبح مشترك.',
    specs: { area: 210, builtArea: 210, constructionStatus: 'ready', age: 3, facade: 'west', streetWidth: 40, bedrooms: 3, bathrooms: 4, livingRooms: 1, kitchen: 'fitted', floorNumber: 14, elevators: 4, parking: 2, furnished: 'no', ac: 'central', maidRoom: true, pool: true, security: true, gym: true, adLicense: '7200001007', falLicense: '1100000102', licenseExpiry: '2026-12-20', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1008, type: 'floor', offer: 'sale', status: 'available', featured: true,
    title: 'دور أرضي بمدخل وحوش خاص',
    city: 'riyadh', district: 'الياسمين', lat: 24.8270, lng: 46.6440,
    price: 1950000, agent: 'a1', createdAt: '2026-11-08',
    images: ['photos/villa-row.jpg', 'photos/int-living.jpg', 'photos/majlis-out.jpg', 'plan-apartment'],
    description: 'دور أرضي جديد بمدخل مستقل وحوش خاص، 4 غرف نوم ومجلس رجال، مناسب للتمويل العقاري.',
    specs: { area: 300, builtArea: 300, constructionStatus: 'ready', age: 0, facade: 'north', streetWidth: 15, bedrooms: 4, bathrooms: 4, livingRooms: 1, majlis: 1, kitchen: 'not_fitted', floorNumber: 0, parking: 1, furnished: 'no', ac: 'split', maidRoom: true, driverRoom: false, annex: false, yard: true, privateEntrance: true, smartHome: false, adLicense: '7200001008', falLicense: '1100000101', licenseExpiry: '2027-05-01', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1009, type: 'townhouse', offer: 'sale', status: 'negotiation', featured: false,
    title: 'تاون هاوس في مجمع مسوّر',
    city: 'riyadh', district: 'الربيع', lat: 24.7930, lng: 46.6600,
    price: 2350000, negotiable: true, agent: 'a2', createdAt: '2026-10-30',
    images: ['photos/townhouse-2.jpg', 'photos/int-living.jpg', 'photos/int-bedroom.jpg', 'plan-villa'],
    description: 'وحدة تاون هاوس من ثلاثة أدوار داخل مجمع مسوّر بحراسة ونادي رياضي، سطح خاص وموقفان.',
    specs: { area: 220, builtArea: 340, constructionStatus: 'ready', age: 2, facade: 'east', streetWidth: 12, bedrooms: 4, bathrooms: 5, livingRooms: 2, majlis: 1, kitchen: 'fitted', floors: 3, parking: 2, furnished: 'no', ac: 'central', maidRoom: true, driverRoom: true, roof: true, security: true, gym: true, privateEntrance: true, adLicense: '7200001009', falLicense: '1100000102', licenseExpiry: '2027-02-14', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1010, type: 'office', offer: 'rent', status: 'available', featured: false,
    title: 'مكتب إداري جاهز في برج أعمال',
    city: 'riyadh', district: 'العقيق', lat: 24.7740, lng: 46.6270,
    price: 165000, rentPeriod: 'yearly', agent: 'a3', createdAt: '2026-11-05',
    images: ['photos/office-glass.jpg', 'photos/int-office.jpg', 'photos/int-lobby.jpg'],
    description: 'مكتب في الدور التاسع بتشطيب كامل، قاعة اجتماعات وغرف مدراء، مواقف مخصصة واستقبال على مدار الساعة.',
    specs: { area: 220, builtArea: 220, constructionStatus: 'ready', age: 3, facade: 'north_east', streetWidth: 40, bathrooms: 2, floorNumber: 9, elevators: 4, parking: 4, furnished: 'partial', ac: 'central', security: true, civilDefense: true, fireSystem: true, payments: '4', deposit: 10000, ejar: true, adLicense: '7200001010', falLicense: '1100000103', licenseExpiry: '2027-04-05' }
  },
  {
    id: 1011, type: 'showroom', offer: 'rent', status: 'available', featured: false,
    title: 'معرض تجاري بواجهة زجاجية على طريق رئيسي',
    city: 'jeddah', district: 'الروضة', lat: 21.5620, lng: 39.1530,
    price: 420000, rentPeriod: 'yearly', agent: 'a3', createdAt: '2026-10-25',
    images: ['photos/commercial-1.jpg', 'photos/int-lobby.jpg'],
    description: 'معرض بواجهة 24 م على طريق تجاري رئيسي، ارتفاع سقف مناسب للعلامات التجارية الكبرى، ومواقف أمامية.',
    specs: { area: 380, builtArea: 380, constructionStatus: 'ready', age: 2, facade: 'east', streetWidth: 60, streetsCount: 1, bathrooms: 2, parking: 10, ceilingHeight: 6, frontage: 24, ac: 'central', civilDefense: true, fireSystem: true, payments: '2', deposit: 20000, ejar: true, adLicense: '7200001011', falLicense: '1100000103', licenseExpiry: '2027-02-28' }
  },
  {
    id: 1012, type: 'warehouse', offer: 'rent', status: 'available', featured: false,
    title: 'مستودع مرخّص بأرصفة تحميل',
    city: 'riyadh', district: 'السلي', lat: 24.6670, lng: 46.8130,
    price: 360000, rentPeriod: 'yearly', agent: 'a3', createdAt: '2026-10-18',
    images: ['photos/warehouse-2.jpg', 'photos/warehouse.jpg'],
    description: 'مستودع بمساحة 2,400 م² وارتفاع 10 م، 4 أرصفة تحميل وساحة مناورة للشاحنات، مرخّص من الدفاع المدني.',
    specs: { area: 2400, builtArea: 2100, constructionStatus: 'ready', age: 5, facade: 'south', streetWidth: 30, streetsCount: 2, parking: 12, ceilingHeight: 10, loadingDocks: 4, ac: 'none', security: true, civilDefense: true, fireSystem: true, payments: '4', deposit: 30000, ejar: true, adLicense: '7200001012', falLicense: '1100000103', licenseExpiry: '2027-01-20' }
  },
  {
    id: 1013, type: 'land', offer: 'investment', status: 'available', featured: true,
    title: 'أرض تجارية للاستثمار طويل الأجل',
    city: 'dammam', district: 'الشاطئ الغربي', lat: 26.4600, lng: 50.1150,
    price: 18000000, agent: 'a3', createdAt: '2026-11-01',
    images: ['photos/land-desert.jpg', 'photos/land-scrub.jpg'],
    description: 'أرض تجارية على طريق رئيسي مطروحة للتطوير أو الاستثمار بنظام البناء والتشغيل والنقل، مناسبة لمجمع تجاري أو فندقي.',
    specs: { area: 5000, facade: 'three', streetWidth: 60, streetsCount: 3, landUse: 'commercial', dimensions: '50 × 100 م', planNo: '87', plotNo: '12', investmentModel: 'bot', annualIncome: 1650000, roi: 9.2, leaseTerm: 25, adLicense: '7200001013', falLicense: '1100000103', licenseExpiry: '2027-06-01', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1014, type: 'villa', offer: 'sale', status: 'available', featured: false,
    title: 'فيلا دورين وملحق بتصميم كلاسيكي',
    city: 'khobar', district: 'الحزام الذهبي', lat: 26.2810, lng: 50.1850,
    price: 3200000, negotiable: true, agent: 'a1', createdAt: '2026-10-22',
    images: ['photos/villa-white.jpg', 'photos/majlis-out.jpg', 'photos/int-living.jpg', 'plan-villa'],
    description: 'فيلا بتصميم كلاسيكي بمجالس واسعة وملحق خارجي، حديقة أمامية ومواقف داخلية.',
    specs: { area: 500, builtArea: 560, constructionStatus: 'ready', age: 7, facade: 'south', streetWidth: 20, streetsCount: 1, bedrooms: 6, bathrooms: 6, livingRooms: 2, majlis: 2, kitchen: 'fitted', floors: 2, parking: 3, furnished: 'no', ac: 'split', maidRoom: true, driverRoom: true, annex: true, garden: true, yard: true, planNo: '611', plotNo: '204', adLicense: '7200001014', falLicense: '1100000101', licenseExpiry: '2027-03-11', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1015, type: 'apartment', offer: 'rent', status: 'available', featured: false,
    title: 'شقة مفروشة بإطلالة على الكورنيش',
    city: 'khobar', district: 'الكورنيش', lat: 26.2950, lng: 50.2120,
    price: 9500, rentPeriod: 'monthly', agent: 'a2', createdAt: '2026-11-11',
    images: ['photos/apt-tower.jpg', 'photos/int-bedroom.jpg', 'photos/int-living2.jpg'],
    description: 'شقة غرفتين مفروشة بالكامل بإطلالة بحرية، تشمل الإنترنت والصيانة، عقود شهرية مرنة.',
    specs: { area: 120, builtArea: 120, constructionStatus: 'ready', age: 2, facade: 'east', streetWidth: 30, bedrooms: 2, bathrooms: 2, livingRooms: 1, kitchen: 'fitted', floorNumber: 7, elevators: 2, parking: 1, furnished: 'yes', ac: 'central', security: true, gym: true, payments: '12', deposit: 3000, ejar: true, adLicense: '7200001015', falLicense: '1100000102', licenseExpiry: '2027-05-20' }
  },
  {
    id: 1016, type: 'istiraha', offer: 'rent', status: 'available', featured: false,
    title: 'استراحة بمسبح وبيت شعر للمناسبات',
    city: 'riyadh', district: 'الرمال', lat: 24.8690, lng: 46.8070,
    price: 1500, rentPeriod: 'daily', agent: 'a1', createdAt: '2026-11-09',
    images: ['photos/compound-pool.jpg', 'photos/majlis-out.jpg'],
    description: 'استراحة مسوّرة بمسبح مع مظلات، بيت شعر ومجلسين، ملعب ومساحات خضراء. متاحة للحجز اليومي ونهاية الأسبوع.',
    specs: { area: 2500, builtArea: 300, constructionStatus: 'ready', age: 4, facade: 'north', streetWidth: 20, bathrooms: 4, livingRooms: 1, majlis: 2, kitchen: 'fitted', parking: 15, furnished: 'yes', ac: 'split', pool: true, yard: true, garden: true, playground: true, tent: true, palms: 30, deposit: 1000, adLicense: '7200001016', falLicense: '1100000101', licenseExpiry: '2027-04-30' }
  },
  {
    id: 1017, type: 'farm', offer: 'sale', status: 'available', featured: false,
    title: 'مزرعة نخيل منتجة بصك زراعي',
    city: 'madinah', district: 'شوران', lat: 24.4700, lng: 39.6000,
    price: 6800000, negotiable: true, agent: 'a1', createdAt: '2026-10-12',
    images: ['photos/farm-dates.jpg', 'photos/land-scrub.jpg'],
    description: 'مزرعة بمساحة 18,000 م² فيها 450 نخلة منتجة وبئران، بيت ريفي ومستودع للمعدات.',
    specs: { area: 18000, builtArea: 400, constructionStatus: 'ready', age: 12, facade: 'west', streetWidth: 20, majlis: 1, parking: 6, ac: 'split', garden: true, tent: true, playground: false, wells: 2, palms: 450, landUse: 'agricultural', planNo: '—', adLicense: '7200001017', falLicense: '1100000101', licenseExpiry: '2027-01-15', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1018, type: 'building', offer: 'sale', status: 'available', featured: false,
    title: 'عمارة سكنية قريبة من الحرم',
    city: 'makkah', district: 'العزيزية', lat: 21.4000, lng: 39.8900,
    price: 14500000, agent: 'a3', createdAt: '2026-10-08',
    images: ['photos/townhouse.jpg', 'plan-apartment'],
    description: 'عمارة من 6 أدوار تضم 24 شقة مفروشة، مناسبة للسكن الموسمي وسكن الحجاج والمعتمرين.',
    specs: { area: 800, builtArea: 4200, constructionStatus: 'ready', age: 9, facade: 'north', streetWidth: 30, streetsCount: 2, floors: 6, units: 24, shops: 2, elevators: 2, parking: 12, ac: 'split', basement: true, security: false, civilDefense: true, fireSystem: true, planNo: '—', plotNo: '88', adLicense: '7200001018', falLicense: '1100000103', licenseExpiry: '2027-02-08', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1019, type: 'apartment', offer: 'sale', status: 'reserved', featured: false,
    title: 'شقة جديدة بالقرب من مسجد قباء',
    city: 'madinah', district: 'قباء', lat: 24.4400, lng: 39.6170,
    price: 980000, agent: 'a2', createdAt: '2026-11-06',
    images: ['photos/townhouse.jpg', 'photos/int-living.jpg', 'plan-apartment'],
    description: 'شقة في الدور الأول بمساحة 150 م²، 3 غرف نوم وصالة، في عمارة جديدة بمصعد.',
    specs: { area: 150, builtArea: 150, constructionStatus: 'ready', age: 0, facade: 'south', streetWidth: 15, bedrooms: 3, bathrooms: 2, livingRooms: 1, kitchen: 'not_fitted', floorNumber: 1, elevators: 1, parking: 1, furnished: 'no', ac: 'split', maidRoom: false, adLicense: '7200001019', falLicense: '1100000102', licenseExpiry: '2027-05-06', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1020, type: 'villa', offer: 'sale', status: 'available', featured: false,
    title: 'فيلا درج صالة بحالة ممتازة',
    city: 'riyadh', district: 'قرطبة', lat: 24.8170, lng: 46.7300,
    price: 2750000, negotiable: true, agent: 'a1', createdAt: '2026-10-29',
    images: ['photos/villa-aerial.jpg', 'photos/int-kitchen.jpg', 'photos/majlis-out.jpg', 'plan-villa'],
    description: 'فيلا درج صالة بمساحة 375 م²، صيانة حديثة وتكييف مركزي، قريبة من المدارس والخدمات.',
    specs: { area: 375, builtArea: 480, constructionStatus: 'ready', age: 8, facade: 'east', streetWidth: 15, streetsCount: 1, bedrooms: 5, bathrooms: 5, livingRooms: 2, majlis: 1, kitchen: 'fitted', floors: 2, parking: 2, furnished: 'no', ac: 'central', maidRoom: true, driverRoom: true, annex: false, yard: true, planNo: '1720', plotNo: '531', adLicense: '7200001020', falLicense: '1100000101', licenseExpiry: '2027-04-29', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1021, type: 'land', offer: 'sale', status: 'sold', featured: false,
    title: 'أرض سكنية في مخطط مكتمل الخدمات',
    city: 'riyadh', district: 'النرجس', lat: 24.8650, lng: 46.6800,
    price: 2250000, agent: 'a1', createdAt: '2026-09-20',
    images: ['photos/land-scrub.jpg'],
    description: 'أرض سكنية بواجهة شمالية على شارع 20 م، مخطط مكتمل الخدمات والإنارة.',
    specs: { area: 625, facade: 'north', streetWidth: 20, streetsCount: 1, landUse: 'residential', dimensions: '25 × 25 م', planNo: '3120', plotNo: '940', adLicense: '7200001021', falLicense: '1100000101', licenseExpiry: '2027-03-20', deedType: 'electronic', mortgage: true, mortgaged: false }
  },
  {
    id: 1022, type: 'office', offer: 'sale', status: 'available', featured: false,
    title: 'مكتب تمليك في مجمع أعمال',
    city: 'jeddah', district: 'المحمدية', lat: 21.6280, lng: 39.1400,
    price: 1100000, agent: 'a3', createdAt: '2026-10-15',
    images: ['photos/int-office.jpg', 'photos/office-glass.jpg'],
    description: 'مكتب تمليك بمساحة 140 م² في مجمع أعمال حديث، مواقف مخصصة وخدمات مشتركة.',
    specs: { area: 140, builtArea: 140, constructionStatus: 'ready', age: 4, facade: 'north', streetWidth: 30, bathrooms: 1, floorNumber: 4, elevators: 3, parking: 2, furnished: 'no', ac: 'central', security: true, civilDefense: true, fireSystem: true, adLicense: '7200001022', falLicense: '1100000103', licenseExpiry: '2027-02-15', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1023, type: 'showroom', offer: 'investment', status: 'available', featured: false,
    title: 'مجمع محلات تجارية مؤجّر',
    city: 'khobar', district: 'العليا', lat: 26.2900, lng: 50.1990,
    price: 12800000, agent: 'a3', createdAt: '2026-10-05',
    images: ['photos/commercial-1.jpg', 'photos/int-lobby.jpg'],
    description: 'مجمع من 8 محلات تجارية مؤجّرة لعلامات خدمية ومطاعم، عقود طويلة وموقع على شارع تجاري حيوي.',
    specs: { area: 1600, builtArea: 1400, constructionStatus: 'ready', age: 5, facade: 'three', streetWidth: 40, streetsCount: 3, bathrooms: 8, parking: 40, ceilingHeight: 5, frontage: 80, ac: 'split', civilDefense: true, fireSystem: true, investmentModel: 'income', annualIncome: 1050000, roi: 8.2, occupancy: 100, adLicense: '7200001023', falLicense: '1100000103', licenseExpiry: '2027-01-30', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1024, type: 'warehouse', offer: 'sale', status: 'available', featured: false,
    title: 'مستودع في المدينة الصناعية الثانية',
    city: 'dammam', district: 'المدينة الصناعية الثانية', lat: 26.3800, lng: 50.1300,
    price: 11500000, agent: 'a3', createdAt: '2026-09-28',
    images: ['photos/warehouse.jpg', 'photos/warehouse-2.jpg'],
    description: 'مستودع بمساحة 5,000 م² مع مكاتب إدارية، 6 أرصفة تحميل وارتفاع 12 م.',
    specs: { area: 5000, builtArea: 4300, constructionStatus: 'ready', age: 6, facade: 'four', streetWidth: 40, streetsCount: 4, parking: 25, ceilingHeight: 12, loadingDocks: 6, ac: 'none', security: true, civilDefense: true, fireSystem: true, adLicense: '7200001024', falLicense: '1100000103', licenseExpiry: '2027-03-05', deedType: 'electronic', mortgaged: false }
  },
  {
    id: 1025, type: 'apartment', offer: 'rent', status: 'available', featured: true,
    title: 'شقة فاخرة في مجمع سكني بخدمات',
    city: 'riyadh', district: 'حطين', lat: 24.7600, lng: 46.6100,
    price: 95000, rentPeriod: 'yearly', agent: 'a2', createdAt: '2026-11-13',
    images: ['photos/compound-pool.jpg', 'photos/int-living2.jpg', 'photos/int-kitchen.jpg', 'photos/int-bedroom.jpg', 'plan-apartment'],
    description: 'شقة جديدة في مجمع سكني مسوّر يضم نادياً رياضياً ومسبحاً وحراسة على مدار الساعة. تشطيبات فاخرة ومطبخ مجهّز.',
    specs: { area: 180, builtArea: 180, constructionStatus: 'ready', age: 0, facade: 'north', streetWidth: 20, bedrooms: 3, bathrooms: 3, livingRooms: 1, kitchen: 'fitted', floorNumber: 3, elevators: 2, parking: 2, furnished: 'no', ac: 'central', maidRoom: true, pool: true, security: true, gym: true, smartHome: true, payments: '2', deposit: 6000, familiesOnly: true, ejar: true, adLicense: '7200001025', falLicense: '1100000102', licenseExpiry: '2027-05-13' }
  },
  {
    id: 1026, type: 'townhouse', offer: 'rent', status: 'available', featured: false,
    title: 'تاون هاوس في مجتمع سكني هادئ',
    city: 'jeddah', district: 'الحمدانية', lat: 21.7600, lng: 39.1900,
    price: 120000, rentPeriod: 'yearly', agent: 'a2', createdAt: '2026-11-02',
    images: ['photos/townhouse.jpg', 'photos/int-living.jpg', 'photos/int-bedroom.jpg'],
    description: 'وحدة تاون هاوس من دورين داخل مجتمع سكني بحدائق ومسارات مشي، 4 غرف وسطح خاص.',
    specs: { area: 200, builtArea: 280, constructionStatus: 'ready', age: 1, facade: 'south', streetWidth: 12, bedrooms: 4, bathrooms: 4, livingRooms: 1, majlis: 1, kitchen: 'fitted', floors: 2, parking: 2, furnished: 'no', ac: 'split', maidRoom: true, driverRoom: false, roof: true, security: true, privateEntrance: true, payments: '2', deposit: 6000, familiesOnly: true, ejar: true, adLicense: '7200001026', falLicense: '1100000102', licenseExpiry: '2027-05-02' }
  }
];
