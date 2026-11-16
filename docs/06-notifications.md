# 06 — Notifications (in-app centers, real-time, email via Resend)

## 1. Pipeline

```
Domain event (EventEmitter2, after DB commit)
   └─► NotificationsService.dispatch(eventKey, payload)
         ├─ resolve recipients (rules §3)
         ├─ for each recipient: read NotificationPreference (defaults §3)
         ├─ inApp  → insert Notification → Socket.IO `notification.new` + `notification.count`
         ├─ email  → BullMQ `email` queue → EmailService → gateway.email() (Resend) → EmailLog
         └─ sms    → BullMQ `sms` queue (only if an SMS integration is enabled)
```
- Emails are sent by the worker with retries (5 attempts, backoff 1 min → 1 h); idempotency key
  `${eventKey}:${entityId}:${recipientId}`.
- Resend webhook updates `EmailLog.status` (delivered / bounced / complained). Hard bounce →
  disable email channel for that address and notify admins (`email.bounced`).
- Quiet hours (settings.notifications.quietHours, default 22:00–07:00 Asia/Riyadh) delay **SMS only**;
  in-app and email are immediate. `priority = high` ignores quiet hours.

## 2. Notification centers

### Admin (`admin/` top bar bell)
- Bell with unread count (live), dropdown with last 10, «عرض الكل» → page `/admin/notifications`:
  tabs «الكل / غير مقروء / الطلبات / الحجوزات / المدفوعات / النظام», mark read / mark all read,
  archive, each item links to its entity.
- Desktop browser notifications (Notification API) when the tab is hidden — opt-in toggle.
- Sound on `priority = high` (opt-in).

### Customer ("حسابي")
- Bell in the public header when logged in (replaces nothing; sits before the favorites icon) with
  unread dot and dropdown; page `account/notifications.html` with the same actions.
- Preferences page `account/settings.html#notifications`: per event toggles for in-app / email / SMS.

## 3. Events catalog (keys are final)

| eventKey | Trigger | Recipients | Default channels | Title (Arabic, verbatim) |
|---|---|---|---|---|
| `lead.created` | POST /public/leads | assignee + sales managers | in-app, email | طلب جديد: {typeLabel} — {propertyTitle} |
| `lead.assigned` | assign | new assignee | in-app, email | أُسند إليك طلب {number} |
| `lead.stage_changed` | stage change | assignee | in-app | تغيّرت حالة الطلب {number} إلى {stageLabel} |
| `viewing.requested` | lead type viewing | agent | in-app, email | طلب معاينة: {propertyTitle} يوم {date} |
| `viewing.confirmed` | admin confirms | customer | in-app, email, sms | تم تأكيد موعد معاينتك يوم {date} {slot} |
| `viewing.reminder` | job, 24 h & 2 h before | customer + agent | in-app, email (24h), sms (2h) | تذكير: موعد معاينة {propertyTitle} |
| `booking.created` | POST /me/bookings | customer; staff with bookings.view | in-app | تم إنشاء الحجز {number} |
| `booking.confirmed` | confirmed | customer; agent; finance | in-app, email | تم تأكيد حجز {propertyTitle} |
| `booking.expired` | job | customer | in-app, email | انتهت مهلة الحجز {number} |
| `booking.cancelled` | cancel | customer; agent | in-app, email | تم إلغاء الحجز {number} |
| `booking.completed` | complete | customer | in-app, email | مبروك! اكتمل حجز {propertyTitle} |
| `payment.paid` | reconcile | customer (receipt email); finance | in-app, email | تم استلام دفعتك {amount} |
| `payment.failed` | reconcile | customer | in-app, email | لم تكتمل عملية الدفع |
| `payment.transfer_submitted` | receipt upload | finance | in-app, email | إيصال تحويل جديد للحجز {number} |
| `payment.transfer_approved` / `_rejected` | review | customer | in-app, email | تم اعتماد تحويلك / لم يتم اعتماد التحويل: {reason} |
| `payment.refunded` | refund | customer; finance | in-app, email | تم استرداد {amount} |
| `payment.anomaly` | amount mismatch | finance, owner | in-app, email (high) | تنبيه: مبلغ دفع غير مطابق {number} |
| `property.status_changed` | any status change | agent; customers who favorited (only → available / price drop) | in-app | {propertyTitle}: {statusLabel} |
| `property.price_dropped` | price decreased | customers who favorited | in-app, email | انخفض سعر {propertyTitle} |
| `property.matched_saved_search` | publish job | customer with alert | in-app, email (daily digest) | عقارات جديدة تطابق بحثك «{name}» |
| `license.expiring` | daily job, 30/7/1 days | agent + admins | in-app, email | ترخيص إعلان {code} ينتهي خلال {days} يوم |
| `license.rega_invalid` | REGA check | agent + admins | in-app, email (high) | ترخيص الإعلان {code} غير صالح — أُخفي العقار |
| `integration.health_changed` | health job | users with integrations.manage | in-app, email when down | تغيّرت حالة التكامل {name}: {health} |
| `email.bounced` | Resend webhook | admins | in-app | تعذّر تسليم بريد إلى {email} |
| `security.new_login` / `security.session_revoked` | auth | the user | email | تسجيل دخول جديد إلى حسابك |
| `staff.broadcast` | admin broadcast | selected roles | in-app | {title} |
| `auction.*` | docs/09 | registrants | in-app, email, sms | docs/09 |

Customers can disable any event except `payment.*`, `booking.*` transactional emails and `security.*`
(shown disabled with the hint «إشعار أساسي لا يمكن إيقافه»).

## 4. Email (Resend)

- Sender from `email.resend` config: `"{brand.fullName}" <no-reply@{domain}>`, `reply_to` contact email.
  Domain must be verified in Resend (SPF, DKIM); admin integration screen shows verification status.
- Templates in `backend/src/modules/email/templates/*.tsx` (react-email), compiled to HTML; layout:
  `dir="rtl" lang="ar"`, brand logo, theme colours from `settings.branding`, Arabic web-safe font
  stack (`Tajawal, 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif`), 600 px, button-style CTAs,
  footer with company name, CR, REGA FAL license, Ejar membership, address, unsubscribe link for
  non-transactional emails (List-Unsubscribe header).
- Required templates: `otp`, `lead-new-staff`, `lead-assigned`, `viewing-confirmed`,
  `viewing-reminder`, `booking-created`, `booking-confirmed`, `booking-expired`, `booking-cancelled`,
  `booking-completed`, `payment-receipt` (PDF attached), `payment-failed`, `transfer-instructions`,
  `transfer-submitted-staff`, `transfer-approved`, `transfer-rejected`, `refund`,
  `license-expiring`, `saved-search-digest`, `price-drop`, `staff-invite`, `password-reset`,
  `security-new-login`, `integration-down`.
- Admin can override subject + intro paragraph per template (`/admin/email-templates/:key`) with a
  live preview and «إرسال بريد تجريبي».
- Plain-text alternative generated for every email.
