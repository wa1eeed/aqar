# 04 — Booking Journey & Payments

## 1. Concepts

- **Viewing request** (طلب معاينة) stays a free `Lead` + `Viewing` (existing frontend modal). No payment.
- **Booking** (حجز العقار) reserves a property for one customer with a payment: either a **deposit**
  (عربون) or the **full amount** (دفع كامل). Admin decides what is offered.
- Payment methods: **Moyasar** (بوابة ميسر — mada, Visa/Mastercard, Apple Pay, STC Pay),
  **Bank transfer** (تحويل بنكي), **Rize** (رايز — rent instalments; adapter prepared, disabled until
  the company signs with Rize).

## 2. Configuration (admin → الإعدادات → الحجز والدفع)

`settings.booking` (zod-validated):

```ts
{
  enabled: boolean,                         // master switch, default true
  allowedOffers: ('sale'|'rent'|'investment')[],          // default ['sale','rent']
  policies: {                                // one policy per offer
    sale:       Policy, rent: Policy, investment: Policy
  },
  holdMinutesOnline: number,                 // default 30  (Moyasar / Rize)
  holdHoursTransfer: number,                 // default 48  (time to upload a transfer receipt)
  reviewHoursTransfer: number,               // default 24  (admin SLA after upload; extends hold)
  autoConfirmWhenPaid: boolean,              // default true
  nafathRequiredAbove: number | null,        // halalas; null = never
  termsVersion: string,                      // bump forces re-acceptance
  termsHtml: string,                         // شروط الحجز (sanitised HTML)
  cancellationPolicyHtml: string
}
Policy = {
  paymentTypes: ('deposit'|'full')[],        // which choices the customer sees
  defaultPaymentType: 'deposit'|'full',
  deposit: { mode: 'fixed'|'percent', fixedAmount: number /*halalas*/, percent: number, min: number|null, max: number|null },
  methods: { deposit: PaymentMethod[], full: PaymentMethod[] }   // e.g. deposit:[moyasar,bank_transfer], full:[bank_transfer,rize]
}
```

`settings.payments`:

```ts
{
  moyasar:       { enabled: boolean, labelAr: 'الدفع الإلكتروني', mode: 'invoice'|'embedded_form', sources: ('creditcard'|'applepay'|'stcpay')[], statementDescriptor: string },
  bank_transfer: { enabled: boolean, labelAr: 'تحويل بنكي' },
  rize:          { enabled: boolean, labelAr: 'قسّط إيجارك مع رايز', onlyRentPeriods: ('yearly')[] },
  receiptPrefix: 'R',
  showVatNote: boolean, vatNoteAr: string
}
```
A method is offered only if: enabled here **and** its integration is enabled & healthy (docs/05)
**and** listed in the policy for the chosen payment type.

`settings.bank_transfer` (screen "إعدادات التحويل البنكي"):

```ts
{
  bankAccountIds: string[],                  // which BankAccount rows to show, ordered
  instructionsHtml: string,                  // تعليمات الدفع
  nextSteps: string[],                       // ماذا يحدث بعد الدفع (ordered list)
  referenceHintAr: 'اكتب رقم الحجز في خانة الملاحظات عند التحويل',
  requireReceipt: boolean,                   // default true
  acceptedFileTypes: ['application/pdf','image/jpeg','image/png'], maxFileMb: 10
}
```
Per-property override: `Property.paymentPolicy` has the same `Policy` shape; when present it wins.

Deposit amount = fixed or `percent × price` (rent: of the price for one `rentPeriod`), clamped to
min/max, never more than the full amount. Full amount = `price` (rent: one period).

## 3. Customer flow (frontend pages in docs/08)

1. Property page → button **«احجز العقار»** shown when `booking.enabled` and status = `available`
   (if another active booking exists → disabled text «العقار قيد الحجز حالياً»).
2. Not logged in → OTP login modal (docs/03), then continue.
3. `booking.html#p-1001` step 1 **ملخص الحجز**: property card, price, radio «عربون {amount}» /
   «دفع كامل {amount}», amounts from `POST /me/bookings/quote` `{ propertyId, paymentType }` →
   `{ amountDue, priceHalalas, methods: [...], holdMinutes }`.
4. Step 2 **طريقة الدفع**: method cards (Moyasar with card/Apple Pay/mada logos, bank transfer,
   Rize when available) + terms checkbox «أوافق على شروط الحجز وسياسة الإلغاء».
5. `POST /me/bookings` `{ propertyId, paymentType, paymentMethod, termsVersion, notes }`
   → `201 { booking, nextAction }`. Server re-checks availability inside a transaction with
   `SELECT … FOR UPDATE` on the property row; the partial unique index (docs/01) guarantees one
   active booking per property → `409 BOOKING_PROPERTY_UNAVAILABLE`.
6. `nextAction`:
   - `{ type: 'redirect', url }` for Moyasar invoice / Rize.
   - `{ type: 'moyasar_form', publishableKey, amount, description, callbackUrl, metadata }` when
     `mode = embedded_form` (frontend loads Moyasar's script; card data never touches our server).
   - `{ type: 'bank_transfer', accounts, amount, reference, deadline, instructionsHtml, nextSteps }`.
7. Result page `account/booking.html#b-{id}` shows live status (WebSocket `booking.updated`).

## 4. Booking state machine

```
pending_payment ──(payment paid & autoConfirm)──────────────► confirmed ──(admin complete)──► completed
      │  │                                                         │
      │  └─(transfer receipt uploaded)──► awaiting_transfer_review ─┤(admin approve) → confirmed
      │                                         │(admin reject) → pending_payment (until hold expiry)
      ├─(hold expired, job)──► expired                              │
      ├─(customer/admin cancel)──► cancelled                        ├─(admin cancel)──► cancelled ──(refund)──► refunded
```
Hold: Moyasar/Rize `holdMinutesOnline`; bank transfer `holdHoursTransfer`, extended by
`reviewHoursTransfer` when a receipt is uploaded. Admin can `extend-hold`.

Property status side effects (in the same DB transaction, with `PropertyStatusHistory`):
| Booking event | Property status |
|---|---|
| confirmed | `reserved` (reason `booking_confirmed`) |
| completed | `sold` (sale, investment) / `rented` (rent) |
| cancelled / refunded after confirmed | back to `available` **only if** it is still `reserved` by this booking |
| pending / expired | unchanged |

Every transition: AuditLog + domain event (`booking.created|confirmed|completed|cancelled|expired`).

## 5. Moyasar (via `payments.moyasar` adapter)

Verify every call against the official docs (https://docs.moyasar.com) at implementation time; the
adapter interface below is fixed, the HTTP details live only inside the adapter.

```ts
interface PaymentProvider {
  createCheckout(p: { paymentId: string; amount: bigint; currency: 'SAR'; descriptionAr: string;
                      callbackUrl: string; metadata: Record<string,string> }): Promise<{ providerId: string; url?: string; formConfig?: object }>;
  fetchPayment(providerId: string): Promise<{ status: 'paid'|'failed'|'pending'|'refunded'; amount: bigint; currency: string; raw: unknown }>;
  refund(providerPaymentId: string, amount: bigint): Promise<{ status: string; raw: unknown }>;
  verifyWebhook(req: RawRequest): Promise<{ valid: boolean; externalId: string; type: string; data: unknown }>;
}
```
- Secrets: `secretKey` (server), `publishableKey` (browser, embedded form only), `webhookSecret`.
- Amounts are sent in halalas. `metadata`: `{ bookingId, paymentId, bookingNumber }`.
- `callbackUrl` = `${PUBLIC_URL}/account/booking.html#b-{bookingId}` + provider params.
- Confirmation rule (both webhook and callback paths call `PaymentsService.reconcile(paymentId)`):
  fetch from provider → require `status = paid`, `amount === payment.amount`, `currency === 'SAR'`
  and metadata.paymentId match → mark `paid` once (idempotent; row lock) → `booking.amountPaid += amount`
  → if `amountPaid ≥ amountDue` and `autoConfirmWhenPaid` → confirm booking.
- Mismatch → payment `failed` with `failureReason = 'AMOUNT_MISMATCH'`, alert finance
  (`payment.anomaly`).
- Reconciliation job every 5 min for payments `initiated|pending` younger than 24 h.
- Refunds from admin (full or partial) through `refund()`; status `refunded|partially_refunded`.

## 6. Bank transfer

Screen content (customer), in this order:
1. Amount due (large), booking number as **transfer reference**, deadline countdown.
2. Each selected `BankAccount`: bank name, beneficiary name «اسم المستفيد», IBAN (copy button,
   grouped `SA12 3456 …`), account number, SWIFT (if set).
3. `instructionsHtml`.
4. Upload form → `POST /me/payments/:id/transfer` (multipart): `bankAccountId`, `senderName`,
   `senderBank`, `transferReference`, `transferredAt`, `amount` (SAR, must equal amount due),
   `receipt` (pdf/jpg/png ≤ 10 MB; stored in R2 **private** bucket `uploads/transfers/{paymentId}/…`;
   virus-scan hook optional).
5. `nextSteps` list «ماذا يحدث بعد التحويل؟» (e.g. نراجع الإيصال خلال 24 ساعة عمل ← نؤكد الحجز
   ويصلك إشعار وبريد ← يتواصل معك المستشار لإكمال الإجراءات).

Admin review (permission `payments.review`): side-by-side receipt preview (signed URL 5 min) and the
expected data; approve → payment `paid`, booking confirmed; reject → reason required, customer
notified, can re-upload until hold expiry. IBAN validated (`SA` + 22 digits, ISO 13616 mod-97).

## 7. Rize (rent instalments) — prepared, disabled

- Integration key `payments.rize`; adapter implements the same `PaymentProvider` interface plus
  `checkEligibility(customer, booking)`; HTTP specifics to be filled when the company receives
  Rize's partner API documentation. Until then the adapter throws `INTEGRATION_NOT_CONFIGURED` and
  the method is hidden.
- Offered only for `offer = rent`, `rentPeriod ∈ settings.payments.rize.onlyRentPeriods`, payment
  type `full`. Customer sees «قسّط إيجارك على 12 دفعة شهرية مع رايز» and is redirected to Rize.
- Rize approval webhook → payment `paid` (company receives the annual amount) → booking confirmed.

## 8. Receipts

On `paid`: allocate `receiptNumber` (`R-2026-000123`, `Counter` table), render an Arabic RTL receipt
(HTML template → PDF in the worker with headless Chromium, company logo/name/CR/VAT, REGA/Ejar numbers
from settings.licensing) → R2 private → email to customer (Resend) + downloadable from حسابي.

## 9. Tests that must exist

- Quote calculation (fixed/percent/min/max, rent periods, per-property override).
- Concurrency: two customers booking the same property simultaneously → one 201, one 409.
- Moyasar reconcile idempotency (webhook + callback race), amount mismatch, expiry job.
- Bank transfer approve/reject paths and hold extension.
- Property status side-effects and history rows for every transition.
