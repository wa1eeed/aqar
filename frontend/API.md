# عقد الـ API — عقار أونلاين

هذا الملف يوثّق ما تنتظره الواجهة من الباك إند. عند جاهزية الباك إند:

1. في `assets/js/config.js` غيّر `dataSource` إلى `'api'` واضبط `apiBase` (الافتراضي `/api/v1`).
2. لا يلزم تعديل أي صفحة؛ كل الطلبات تمر عبر `assets/js/api.js`.

كل الردود بصيغة JSON وبترميز UTF-8. الحقول بأسماء camelCase.


## نطاق المشروع (مهم)

الموقع **خاص بمنشأة عقارية واحدة** (شركة أو مكتب عقاري)، وليس منصة متعددة البائعين:

- لا يوجد تسجيل بائعين أو ملّاك، ولا ينشر أي طرف خارجي إعلاناً بنفسه.
- كل العقارات يضيفها ويديرها فريق المنشأة من لوحة التحكم فقط.
- `agent` في نموذج العقار هو **موظف/مستشار لدى المنشأة** (له رخصة فال)، يُدار من لوحة التحكم.
- نموذج "اعرض عقارك" (`POST /leads` بنوع `list`) هو **طلب تواصل** من مالك يرغب أن تسوّق المنشأة عقاره، وليس نشراً مباشراً. يراجعه الفريق ثم يضيف العقار يدوياً إن تم الاتفاق.
- الصلاحيات المقترحة في لوحة التحكم: مدير (كل شيء) · مستشار (عقاراته وطلباته) · محرر محتوى.

---

## نموذج العقار `Property`

```json
{
  "id": 1001,
  "code": "MZ-1001",
  "type": "villa",
  "offer": "sale",
  "status": "available",
  "featured": true,
  "title": "فيلا مودرن بدرج داخلي ومسبح خاص",
  "description": "…",
  "city": "riyadh",
  "cityLabel": "الرياض",
  "district": "الملقا",
  "lat": 24.804,
  "lng": 46.617,
  "price": 4850000,
  "rentPeriod": null,
  "negotiable": true,
  "pricePerMeter": 10778,
  "images": ["https://cdn.example.com/p/1001/1.jpg", "…"],
  "createdAt": "2026-11-10",
  "agent": { "id": "a1", "name": "…", "role": "…", "phone": "+9665…", "whatsapp": "9665…", "fal": "…" },
  "specs": { "area": 450, "bedrooms": 5, "pool": true, "adLicense": "…", "falLicense": "…" }
}
```

> **ملاحظة عن الصور:** في البيانات التجريبية `images` مفاتيح لرسومات محلية (`villa-1`). من الباك إند أرسل روابط كاملة
> (تبدأ بـ `https://` أو `/`) وستعرضها الواجهة كما هي.

### القيم المسموحة

| الحقل | القيم |
|---|---|
| `type` | `land` أرض · `villa` فيلا · `apartment` شقة · `floor` دور · `townhouse` تاون هاوس · `building` عمارة · `tower` برج · `office` مكتب · `showroom` معرض تجاري · `warehouse` مستودع · `istiraha` استراحة · `farm` مزرعة |
| `offer` | `sale` بيع · `rent` إيجار · `investment` استثمار |
| `status` | `available` متاح · `negotiation` قيد التفاوض · `reserved` محجوز · `sold` تم البيع (بيع/استثمار) · `rented` تم التأجير (إيجار) |
| `rentPeriod` | `yearly` · `monthly` · `daily` — مطلوب عند `offer = rent` |
| `city` | `riyadh` · `jeddah` · `dammam` · `khobar` · `makkah` · `madinah` |

### حقول `specs`

القائمة الكاملة، مع النوع وأنواع العقار والعروض التي يظهر فيها كل حقل، موجودة في
`assets/js/schema.js` ضمن `fields`. استخدمها كمصدر واحد للتحقق في الباك إند ولبناء لوحة التحكم:

- `kind`: `number` · `money` · `select` (القيم في `options`) · `bool` · `text` · `date`
- `types` / `offers`: `'*'` أو قائمة؛ الدالة `MZ.schema.fieldsFor(type, offer)` تعيد الحقول المطلوبة لكل حالة.
- `required: true`: `area`، `adLicense` (رقم ترخيص الإعلان)، `falLicense` (رقم رخصة فال) — إلزامية حسب اشتراطات الهيئة العامة للعقار.

---

## النقاط (Endpoints)

### `GET /properties`
قائمة العقارات مع الفلترة والترتيب والتقسيم إلى صفحات.

| Query | الوصف |
|---|---|
| `offer` | `sale` / `rent` / `investment` |
| `city`, `district` | |
| `types` | قائمة مفصولة بفواصل: `villa,apartment` |
| `status` | قائمة مفصولة بفواصل |
| `hideClosed` | `true` لإخفاء `sold` و`rented` |
| `priceMin`, `priceMax`, `areaMin`, `areaMax` | أرقام |
| `bedrooms`, `bathrooms` | الحد الأدنى |
| `furnished`, `landUse`, `facade`, `constructionStatus`, `rentPeriod` | قيم `select` |
| `roiMin` | الحد الأدنى للعائد % |
| `features` | قائمة مفاتيح حقول `bool` يجب أن تكون `true`: `pool,maidRoom` |
| `featured` | `true` |
| `q` | بحث نصي في العنوان والحي والمدينة والكود والوصف |
| `ids` | قائمة معرّفات (تستخدمها صفحة المفضلة) |
| `sort` | `newest` · `price_asc` · `price_desc` · `area_desc` · `roi_desc` |
| `page`, `pageSize` | الافتراضي 1 و 12 |

**الترتيب:** العقارات المنتهية (`sold`, `rented`) تأتي دائماً بعد غيرها. عند الترتيب بالسعر تُقارن الإيجارات بقيمتها السنوية.

```json
{ "items": [Property], "total": 26, "page": 1, "pageSize": 12, "pages": 3 }
```

### `GET /properties/:id`
يعيد `Property` كاملاً، أو `404`.

### `GET /properties/:id/similar?limit=4`
مصفوفة `Property` — نفس النوع ثم نفس العرض ثم نفس المدينة، بدون المنتهية.

### `GET /properties/:id/nearby?radius=2000`
الخدمات القريبة (تُستخدم عندما `nearby.source = 'api'` في الإعدادات). هذه النقطة هي مكان الـ gateway الذي يختار المزوّد (OpenStreetMap افتراضياً ثم Google Places).

```json
{ "items": [ { "id": "n/123", "cat": "mosque", "name": "جامع …", "lat": 24.8, "lng": 46.6, "distance": 420 } ] }
```
`cat`: `mosque` · `school` · `health` · `pharmacy` · `grocery` · `mall` · `food` · `park` · `fuel` · `bank` — `distance` بالمتر، والنتائج مرتبة تصاعدياً.

### `GET /stats`
```json
{ "total": 23, "byType": { "villa": 3 }, "byCity": { "riyadh": 12 }, "byOffer": { "sale": 11 } }
```
الأعداد للعقارات غير المنتهية فقط.

### `POST /leads`
كل نماذج التواصل (معاينة، قائمة انتظار، طلب عقار، عرض عقار).

```json
{
  "type": "viewing | waitlist | buy | rent | list | invest | manage",
  "propertyId": 1001,
  "name": "…", "phone": "05XXXXXXXX", "email": "",
  "date": "2026-11-20", "slot": "morning | afternoon | evening",
  "city": "", "propertyType": "", "budget": "", "message": "", "notes": ""
}
```
الرد: `{ "ok": true, "id": "L-123456" }`

---

## الخرائط

- `map.provider`: `'osm'` (Leaflet + OpenStreetMap، الافتراضي) أو `'google'` مع `googleApiKey`.
- عند فشل Google (مفتاح ناقص أو خطأ) تعود الواجهة تلقائياً إلى OpenStreetMap.
- الخدمات القريبة: `nearby.source = 'osm'` يستعلم Overpass API مباشرة من المتصفح. للإنتاج يُفضّل `'api'` مع تخزين مؤقت في الباك إند لتفادي حدود الاستخدام.
