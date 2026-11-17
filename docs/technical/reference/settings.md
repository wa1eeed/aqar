# Settings sections and defaults

> **Generated** by `pnpm run docs` from the source code — do not edit by hand.
> Regenerate after any change; CI runs `pnpm docs:check`.

Edited in the admin panel (`GET/PUT /api/v1/admin/settings/:section`), validated by the zod schemas in
`backend/src/modules/settings/schemas/`, cached in Redis and audited. Defaults below are what a fresh
installation uses. Money values are halalas.

## `general`

Editable with `settings.general`.

```json
{
  "listingCodePrefix": "MZ",
  "timezone": "Asia/Riyadh",
  "defaultPageSize": 12,
  "maintenanceMode": false,
  "maintenanceMessage": "الموقع تحت الصيانة حالياً، نعود قريباً.",
  "publicUrl": ""
}
```

## `branding`

Editable with `settings.branding`.

```json
{
  "name": "منزلة",
  "fullName": "منزلة العقارية",
  "tagline": "عقارات تليق بمنزلتك",
  "logoUrl": "",
  "logoLightUrl": "",
  "faviconUrl": "",
  "socialImageUrl": "",
  "emailLogoUrl": "",
  "preset": "default",
  "theme": {
    "primary": "#0F4C3A",
    "primaryDark": "#0A2F25",
    "accent": "#C9A86C",
    "accentInk": "#85652F",
    "background": "#FAF7F2",
    "surface": "#FFFFFF",
    "ink": "#14211C",
    "muted": "#5F6B66",
    "statusColors": {
      "available": "#1E7449",
      "negotiation": "#5E47A0",
      "reserved": "#995000",
      "sold": "#A3342B",
      "rented": "#2457A6"
    },
    "offerColors": {
      "sale": "#0F4C3A",
      "rent": "#2457A6",
      "investment": "#85652F"
    }
  },
  "fontDisplay": "Alexandria",
  "fontBody": "IBM Plex Sans Arabic",
  "radius": 16,
  "contrastOverride": false
}
```

## `contact`

Editable with `settings.contact`.

```json
{
  "phone": "+966500000000",
  "phoneDisplay": "050 000 0000",
  "whatsapp": "966500000000",
  "email": "info@example.com",
  "address": "[عنوان المقر الرئيسي]، الرياض",
  "hours": "الأحد – الخميس، 9 ص – 9 م",
  "officeLat": 24.7136,
  "officeLng": 46.6753,
  "social": {
    "x": "",
    "instagram": "",
    "snapchat": "",
    "tiktok": "",
    "linkedin": "",
    "youtube": ""
  }
}
```

## `licensing`

Editable with `settings.licensing`.

```json
{
  "regaFalLicense": "",
  "regaFalExpiry": "",
  "regaVerifyUrl": "",
  "ejarMembership": "",
  "crNumber": "",
  "vatNumber": "",
  "nationalAddress": "",
  "showRegaInFooter": true,
  "showEjarInFooter": true,
  "showOnPropertyPage": true,
  "showEjarOnRentOnly": true
}
```

## `booking`

Editable with `settings.booking`.

```json
{
  "enabled": true,
  "allowedOffers": [
    "sale",
    "rent"
  ],
  "policies": {
    "sale": {
      "paymentTypes": [
        "deposit",
        "full"
      ],
      "defaultPaymentType": "deposit",
      "deposit": {
        "mode": "fixed",
        "fixedAmount": 5000000,
        "percent": 0,
        "min": null,
        "max": null
      },
      "methods": {
        "deposit": [
          "moyasar",
          "bank_transfer"
        ],
        "full": [
          "bank_transfer"
        ]
      }
    },
    "rent": {
      "paymentTypes": [
        "deposit",
        "full"
      ],
      "defaultPaymentType": "deposit",
      "deposit": {
        "mode": "percent",
        "fixedAmount": 0,
        "percent": 10,
        "min": 100000,
        "max": null
      },
      "methods": {
        "deposit": [
          "moyasar",
          "bank_transfer"
        ],
        "full": [
          "moyasar",
          "bank_transfer",
          "rize"
        ]
      }
    },
    "investment": {
      "paymentTypes": [
        "deposit",
        "full"
      ],
      "defaultPaymentType": "deposit",
      "deposit": {
        "mode": "fixed",
        "fixedAmount": 5000000,
        "percent": 0,
        "min": null,
        "max": null
      },
      "methods": {
        "deposit": [
          "moyasar",
          "bank_transfer"
        ],
        "full": [
          "bank_transfer"
        ]
      }
    }
  },
  "holdMinutesOnline": 30,
  "holdHoursTransfer": 48,
  "reviewHoursTransfer": 24,
  "autoConfirmWhenPaid": true,
  "nafathRequiredAbove": null,
  "termsVersion": "1",
  "termsHtml": "<p>تُطبّق شروط الحجز المعتمدة لدى المنشأة.</p>",
  "cancellationPolicyHtml": "<p>تُطبّق سياسة الإلغاء المعتمدة لدى المنشأة.</p>"
}
```

## `payments`

Editable with `settings.payments`.

```json
{
  "moyasar": {
    "enabled": false,
    "labelAr": "الدفع الإلكتروني",
    "mode": "invoice",
    "sources": [
      "creditcard",
      "applepay",
      "stcpay"
    ],
    "statementDescriptor": ""
  },
  "bank_transfer": {
    "enabled": true,
    "labelAr": "تحويل بنكي"
  },
  "rize": {
    "enabled": false,
    "labelAr": "قسّط إيجارك مع رايز",
    "onlyRentPeriods": [
      "yearly"
    ]
  },
  "receiptPrefix": "R",
  "showVatNote": false,
  "vatNoteAr": ""
}
```

## `bank_transfer`

Editable with `settings.payments`.

```json
{
  "bankAccountIds": [],
  "instructionsHtml": "<p>حوّل المبلغ المطلوب إلى أحد الحسابات التالية ثم ارفع إيصال التحويل.</p>",
  "nextSteps": [
    "نراجع الإيصال خلال 24 ساعة عمل",
    "نؤكد الحجز ويصلك إشعار وبريد",
    "يتواصل معك المستشار لإكمال الإجراءات"
  ],
  "referenceHintAr": "اكتب رقم الحجز في خانة الملاحظات عند التحويل",
  "requireReceipt": true,
  "acceptedFileTypes": [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ],
  "maxFileMb": 10
}
```

## `notifications`

Editable with `settings.notifications`.

```json
{
  "leadRouting": "round_robin",
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "07:00"
  },
  "channels": {
    "lead.created": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "lead.assigned": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "lead.stage_changed": {
      "inApp": true,
      "email": false,
      "sms": false
    },
    "viewing.requested": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "viewing.confirmed": {
      "inApp": true,
      "email": true,
      "sms": true
    },
    "viewing.reminder": {
      "inApp": true,
      "email": true,
      "sms": true
    },
    "booking.created": {
      "inApp": true,
      "email": false,
      "sms": false
    },
    "booking.confirmed": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "booking.expired": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "booking.cancelled": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "booking.completed": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "payment.paid": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "payment.failed": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "payment.transfer_submitted": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "payment.transfer_approved": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "payment.transfer_rejected": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "payment.refunded": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "payment.anomaly": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "property.status_changed": {
      "inApp": true,
      "email": false,
      "sms": false
    },
    "property.price_dropped": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "property.matched_saved_search": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "license.expiring": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "license.rega_invalid": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "integration.health_changed": {
      "inApp": true,
      "email": true,
      "sms": false
    },
    "email.bounced": {
      "inApp": true,
      "email": false,
      "sms": false
    },
    "security.new_login": {
      "inApp": false,
      "email": true,
      "sms": false
    },
    "security.session_revoked": {
      "inApp": false,
      "email": true,
      "sms": false
    },
    "staff.broadcast": {
      "inApp": true,
      "email": false,
      "sms": false
    }
  },
  "senderName": "",
  "templateOverrides": {}
}
```

## `maps`

Editable with `settings.maps`.

```json
{
  "provider": "osm",
  "defaultCenter": {
    "lat": 24.7136,
    "lng": 46.6753
  },
  "defaultZoom": 11,
  "nearbyRadius": 2000,
  "nearbyCategories": [
    "mosque",
    "school",
    "health",
    "pharmacy",
    "grocery",
    "mall",
    "food",
    "park",
    "fuel",
    "bank"
  ],
  "nearbyCacheDays": 30
}
```

## `locations`

Editable with `settings.locations`.

```json
{
  "defaultCityId": "riyadh"
}
```

## `features`

Editable with `settings.features`.

```json
{
  "auctions": false,
  "customerAccounts": true,
  "savedSearches": true,
  "booking": true,
  "compare": false
}
```

## `legal`

Editable with `settings.legal`.

```json
{
  "aboutHtml": "",
  "privacyHtml": "",
  "termsHtml": "",
  "cookieNotice": "نستخدم ملفات تعريف الارتباط الضرورية لتشغيل الموقع، ولا نفعّل أدوات التحليل إلا بموافقتك."
}
```

## `seo`

Editable with `seo.manage`.

```json
{
  "siteName": "منزلة العقارية",
  "titleTemplate": "{page} | {brand}",
  "defaultDescription": "منزلة العقارية — عقارات للبيع والإيجار والاستثمار في المملكة العربية السعودية.",
  "canonicalDomain": "",
  "defaultOgImageUrl": "",
  "xHandle": "",
  "language": "ar-SA",
  "indexingEnabled": true,
  "metaKeywordsEnabled": false,
  "verification": {
    "google": "",
    "bing": "",
    "yandex": ""
  },
  "analytics": {
    "ga4Id": "",
    "gtmId": "",
    "metaPixelId": "",
    "snapPixelId": "",
    "tiktokPixelId": ""
  },
  "templates": {
    "propertyTitle": "{type} {offer} في حي {district}، {city} — {area} م² | {brand}",
    "propertyDescription": "{type} {offer} في {district} بمساحة {area} م²{bedrooms? ، {bedrooms} غرف} بسعر {price}. {firstSentence}",
    "listingTitle": "{type_plural} {offer} في {city} | {brand}"
  },
  "summaryTemplate": "{type} {offer} في حي {district} ب{city}، المساحة {area} م²{bedrooms?، {bedrooms} غرف نوم}، السعر {price}، الحالة: {status}",
  "aiCrawlers": {
    "GPTBot": "deny",
    "OAI-SearchBot": "allow",
    "ChatGPT-User": "allow",
    "ClaudeBot": "deny",
    "Claude-User": "allow",
    "PerplexityBot": "allow",
    "Google-Extended": "deny",
    "Applebot-Extended": "deny",
    "CCBot": "deny",
    "Bytespider": "deny",
    "Amazonbot": "allow"
  },
  "llmsTxt": "",
  "feedEnabled": false,
  "organization": {
    "foundingYear": null,
    "serviceAreas": [],
    "specialties": [],
    "googleBusinessUrl": ""
  }
}
```

