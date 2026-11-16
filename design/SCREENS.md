# Design reference — screens index

These screenshots and the clickable prototype in `prototype/` are the **visual source of truth**.
Implement each screen to match its screenshot (layout, components, copy, states). Behaviour comes from the docs.

Open the prototype: serve `design/prototype/` with any static server, then open `screens.html`.
Fonts in screenshots are Tajawal (render substitute); production uses the fonts in `frontend/assets/css/main.css`.

## Admin panel (`admin/`, React + Vite, route = hash in prototype)

| Screenshot | Screen | Prototype route | Spec |
|---|---|---|---|
| `screenshots/a-login.png` | تسجيل دخول الفريق | `admin/index.html#login` | docs/03 §staff auth, 07 §1 |
| `screenshots/a-login-2fa.png` | التحقق بخطوتين | `admin/index.html#login-2fa` | docs/03 §2FA |
| `screenshots/a-dashboard.png` | الرئيسية | `admin/index.html#dashboard` | docs/07 §2 |
| `screenshots/a-properties.png` | قائمة العقارات | `admin/index.html#properties` | docs/07 §3 |
| `screenshots/a-property-edit.png` | محرر العقار | `admin/index.html#property-edit` | docs/07 §3.2, 08 §licensing |
| `screenshots/a-leads.png` | الطلبات — لوحة كانبان | `admin/index.html#leads` | docs/07 §4 |
| `screenshots/a-lead-drawer.png` | تفاصيل الطلب | `admin/index.html#lead-drawer` | docs/07 §4 |
| `screenshots/a-viewings.png` | تقويم المعاينات | `admin/index.html#viewings` | docs/07 §5 |
| `screenshots/a-bookings.png` | الحجوزات | `admin/index.html#bookings` | docs/04, 07 §6 |
| `screenshots/a-booking-detail.png` | تفاصيل الحجز | `admin/index.html#booking-detail` | docs/04 §state machine, 07 §6 |
| `screenshots/a-payments.png` | المدفوعات | `admin/index.html#payments` | docs/04, 07 §7 |
| `screenshots/a-transfers.png` | مراجعة التحويل البنكي | `admin/index.html#transfers` | docs/04 §bank transfer review |
| `screenshots/a-customers.png` | العملاء | `admin/index.html#customers` | docs/07 §8 |
| `screenshots/a-notifications.png` | مركز الإشعارات | `admin/index.html#notifications` | docs/06 §admin center |
| `screenshots/a-integrations.png` | التكاملات (API Gateway) | `admin/index.html#integrations` | docs/05, 07 §9 |
| `screenshots/a-integration-moyasar.png` | إعداد تكامل ميسر | `admin/index.html#integration-moyasar` | docs/05 §provider detail |
| `screenshots/a-settings-branding.png` | الإعدادات — الهوية والألوان | `admin/index.html#settings-branding` | docs/07 §10.1 |
| `screenshots/a-settings-licensing.png` | الإعدادات — التراخيص (الهيئة/إيجار) | `admin/index.html#settings-licensing` | docs/07 §10.2, 08 §footer badges |
| `screenshots/a-settings-booking.png` | الإعدادات — الحجز والدفع | `admin/index.html#settings-booking` | docs/04 §settings.booking/payments |
| `screenshots/a-settings-bank.png` | الإعدادات — التحويل البنكي | `admin/index.html#settings-bank` | docs/04 §settings.bank_transfer |
| `screenshots/a-settings-notifications.png` | الإعدادات — قنوات الإشعارات | `admin/index.html#settings-notifications` | docs/06 §channels |
| `screenshots/a-seo.png` | SEO — عام وقوالب | `admin/index.html#seo` | docs/07 §11 |
| `screenshots/a-seo-keywords.png` | SEO — الكلمات المفتاحية | `admin/index.html#seo-keywords` | docs/07 §11, §13 |
| `screenshots/a-seo-landing.png` | SEO — صفحات الهبوط | `admin/index.html#seo-landing` | docs/07 §11 |
| `screenshots/a-seo-aeo.png` | AEO — الأسئلة والإجابات | `admin/index.html#seo-aeo` | docs/07 §11 AEO |
| `screenshots/a-seo-geo.png` | GEO — الذكاء الاصطناعي و llms.txt | `admin/index.html#seo-geo` | docs/07 §11 GEO, llms.txt |
| `screenshots/a-seo-redirects.png` | SEO — التوجيهات و404 | `admin/index.html#seo-redirects` | docs/07 §11, §13 |
| `screenshots/a-reports.png` | التقارير | `admin/index.html#reports` | docs/07 |
| `screenshots/a-auctions.png` | المزادات | `admin/index.html#auctions` | docs/09 |
| `screenshots/a-staff.png` | الفريق والصلاحيات | `admin/index.html#staff` | docs/03 §roles |
| `screenshots/a-audit.png` | سجل العمليات | `admin/index.html#audit` | docs/10 |

## Customer account, checkout and public-site changes

| Screenshot | Screen | Prototype URL | Spec |
|---|---|---|---|
| `screenshots/c-login.png` | دخول العميل بالبريد | `account/index.html#login` | docs/08, docs/04 |
| `screenshots/c-otp.png` | رمز التحقق | `account/index.html#otp` | docs/08, docs/04 |
| `screenshots/c-home.png` | حسابي — نظرة عامة | `account/index.html#home` | docs/08, docs/04 |
| `screenshots/c-bookings.png` | حجوزاتي | `account/index.html#bookings` | docs/08, docs/04 |
| `screenshots/c-checkout-deposit.png` | إتمام الحجز — عربون + ميسر | `booking.html?id=1001#pay` | docs/08, docs/04 |
| `screenshots/c-checkout-bank.png` | إتمام الحجز — تحويل بنكي | `booking.html?id=1001#bank` | docs/08, docs/04 |
| `screenshots/c-checkout-rize.png` | إتمام الحجز — إيجار بالتقسيط (رايز) | `booking.html?id=1002#rize` | docs/08, docs/04 |
| `screenshots/c-booking-bank.png` | الحجز — بيانات التحويل ورفع الإيصال | `account/index.html#booking` | docs/08, docs/04 |
| `screenshots/c-booking-paid.png` | الحجز — مؤكد + الإيصال | `account/index.html#booking-paid` | docs/08, docs/04 |
| `screenshots/c-requests.png` | طلباتي ومعايناتي | `account/index.html#requests` | docs/08, docs/04 |
| `screenshots/c-notifications.png` | إشعارات العميل | `account/index.html#notifications` | docs/08, docs/04 |
| `screenshots/c-favorites.png` | المفضلة والبحوث المحفوظة | `account/index.html#favorites` | docs/08, docs/04 |
| `screenshots/c-settings.png` | الملف والإعدادات | `account/index.html#settings` | docs/08, docs/04 |
| `screenshots/c-property-rent.png` | صفحة العقار — شارات الهيئة وإيجار + زر الحجز | `property.html?id=1002` | docs/08, docs/04 |
| `screenshots/c-home-site.png` | الرئيسية مع الفوتر الجديد | `index.html` | docs/08, docs/04 |
| `screenshots/m-home.png` | حسابي — جوال (390px) | `account/index.html#home` | docs/08, docs/04 |
| `screenshots/m-checkout.png` | إتمام الحجز — جوال (390px) | `booking.html?id=1001#pay` | docs/08, docs/04 |
| `screenshots/m-booking-bank.png` | التحويل البنكي — جوال (390px) | `account/index.html#booking` | docs/08, docs/04 |
| `screenshots/m-property.png` | صفحة العقار — جوال (390px) | `property.html?id=1001` | docs/08, docs/04 |

## Rules

- Mock data and numbers in the prototype are placeholders; real values come from the API.
- Every admin list/table screen also needs loading, empty and error states in the same style (not drawn).
- The prototype CSS (`prototype/admin/admin.css`, `prototype/account/account.css`) defines the component styles to port into the admin app and the public frontend.
- Where a screenshot and a doc disagree on behaviour, the doc wins; on appearance, the screenshot wins.
