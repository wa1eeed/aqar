# 05 — API Gateway & Integrations

All third-party traffic goes through `IntegrationsGateway` (NestJS module `integrations`). Business
modules depend on **capability interfaces**, never on a vendor.

## 1. Architecture

```
PropertiesService ─┐                         ┌─ providers/osm-tiles.ts        (maps)
BookingsService ───┤   IntegrationsGateway   ├─ providers/overpass.ts         (places)
NotificationsSvc ──┼──► .maps()  .places()   ├─ providers/google-maps.ts      (maps, places)
MediaService ──────┤    .payments(method)    ├─ providers/moyasar.ts          (payments)
AuthService ───────┤    .email() .storage()  ├─ providers/rize.ts             (payments, prepared)
RegaService ───────┤    .sms() .gov.rega()   ├─ providers/resend.ts           (email)
LeasingService ────┘    .gov.ejar()          ├─ providers/r2.ts               (storage)
                        .identity.nafath()   ├─ providers/rega.ts             (government, prepared)
                        .gov.nafith()        ├─ providers/ejar.ts             (government, prepared)
                                             ├─ providers/nafath.ts           (identity, prepared)
                                             ├─ providers/nafith.ts           (government, prepared)
                                             └─ providers/sms-*.ts            (sms, optional: unifonic | taqnyat | msegat)
```

Gateway responsibilities (implemented once, applied to every provider call):

1. **Resolution** — pick the active provider for a capability from settings (e.g.
   `settings.maps.provider = osm|google`), check `Integration.enabled`, environment and health.
2. **Credentials** — load `config` + decrypt `secretsEnc` (AES-256-GCM, key `APP_ENCRYPTION_KEY`,
   32 bytes base64, random 12-byte IV per write; store `iv|tag|ciphertext`). Cache decrypted
   config in memory 60 s; invalidate on update via Redis pub/sub.
3. **Resilience** — per-call timeout (default 8 s), retries with exponential backoff + jitter for
   idempotent operations only (GET / provider-idempotent POST with idempotency key), circuit breaker
   (open after 5 consecutive failures for 60 s → `health = down`, fallback if defined).
4. **Rate limiting** — token bucket per integration (config `rateLimitPerMin`).
5. **Caching** — capability-specific (nearby 30 days in `NearbyCache` + Redis; geocode 90 days).
6. **Logging** — `IntegrationCallLog` row per call with correlation id, latency, status, redacted
   request/response (see §6). Pino log line as well.
7. **Fallbacks** — places: google → overpass → empty list with `source: "none"`; maps tiles:
   google → osm. Payments never fall back silently.
8. **Health checks** — `testConnection()` on demand from admin and every 15 min for enabled
   integrations (BullMQ repeatable job); status changes emit `integration.health_changed` to admins.

## 2. Provider contract

```ts
export interface ProviderDefinition<C, S> {
  key: string;                               // 'payments.moyasar'
  category: 'maps'|'places'|'payments'|'email'|'storage'|'government'|'identity'|'sms';
  nameAr: string;                            // shown in admin
  descriptionAr: string;
  docsUrl?: string;
  configSchema: ZodType<C>;                  // non-secret fields → admin form (rendered automatically)
  secretsSchema: ZodType<S>;                 // secret fields → password inputs, write-only
  uiHints: Record<string, { labelAr: string; helpAr?: string; placeholder?: string; type?: 'url'|'text'|'select'|'number'|'boolean'|'textarea' }>;
  supportsSandbox: boolean;
  webhookPath?: string;                      // shown to admin with copy button
  testConnection(ctx: ProviderCtx<C,S>): Promise<{ ok: boolean; messageAr: string; details?: unknown }>;
}
```
The admin integration screen is **generated from `configSchema` + `secretsSchema` + `uiHints`**, so a
new provider appears in the admin with no UI code.

## 3. Registry (seed all rows; enabled = false unless noted)

| Key | Category | Config (non-secret) | Secrets | Notes |
|---|---|---|---|---|
| `maps.osm` | maps | tilesUrl, attribution | – | **enabled by default**; tiles loaded by browser |
| `places.overpass` | places | endpoint (`https://overpass-api.de/api/interpreter`), radius default, categories map | – | **enabled by default**; called server-side only |
| `maps.google` | maps | mapId, language `ar`, region `SA` | browserKey (referrer-restricted, exposed via /public/config), serverKey | |
| `places.google` | places | — | serverKey (can reuse) | Places API (New) nearby search |
| `payments.moyasar` | payments | mode, sources, callbackBaseUrl | secretKey, publishableKey, webhookSecret | webhook `/api/v1/webhooks/moyasar` |
| `payments.rize` | payments | baseUrl, partnerId | apiKey, webhookSecret | prepared stub |
| `email.resend` | email | fromName, fromEmail, replyTo, domain | apiKey, webhookSigningSecret | **required for go-live** |
| `storage.r2` | storage | accountId, uploadsBucket, mediaBucket, publicBaseUrl (`https://cdn.<domain>`) | accessKeyId, secretAccessKey | values default from env; admin may override; changing requires re-auth and shows a warning |
| `gov.rega` | government | baseUrl, clientId, environment | clientSecret, certificate (PEM, optional) | ad-license validation + publish hooks, prepared |
| `gov.ejar` | government | baseUrl, brokerageMembershipNo, clientId | clientSecret | contract drafting hooks, prepared |
| `identity.nafath` | identity | baseUrl, appId, serviceType | apiKey | identity verification, prepared |
| `gov.nafith` | government | baseUrl, entityId | apiKey | promissory notes for auctions, prepared |
| `sms.unifonic` / `sms.taqnyat` / `sms.msegat` | sms | senderName | appSid / apiKey | optional; enables SMS OTP + SMS notifications |

"Prepared" = adapter class, schemas, admin screen, webhook route and capability interface exist and are
unit-tested with mocks; HTTP calls are implemented when the company obtains the provider's partner
documentation and credentials. Until then `testConnection` returns
`{ ok:false, messageAr:'بانتظار بيانات الربط من الجهة المزوّدة' }` and the capability is hidden.

## 4. Capability interfaces

```ts
interface MapsCapability   { publicConfig(): { provider: 'osm'|'google'; tilesUrl?: string; attribution?: string; browserKey?: string } }
interface PlacesCapability { nearby(lat: number, lng: number, radius: number, cats: NearbyCat[]): Promise<NearbyItem[]>; geocode?(q: string): Promise<GeoPoint[]> }
interface EmailCapability  { send(msg: { to: string; subject: string; html: string; text: string; tags?: Record<string,string>; idempotencyKey: string }): Promise<{ id: string }> }
interface StorageCapability{ presignPut(bucket: 'uploads'|'media', key: string, contentType: string, maxBytes: number): Promise<{ url: string; headers: Record<string,string> }>;
                             put(bucket, key, body, contentType): Promise<void>; signedGet(bucket, key, ttlSec): Promise<string>; delete(bucket, key): Promise<void>; publicUrl(key): string }
interface SmsCapability    { send(to: string, textAr: string): Promise<{ id: string }> }
interface RegaCapability   { validateAdLicense(p: { adLicenseNo: string; falLicenseNo: string }): Promise<{ status: 'valid'|'expired'|'invalid'; expiresAt?: string; raw: unknown }> }
interface EjarCapability   { createContractDraft(bookingId: string): Promise<{ referenceNo: string; url?: string }>; getContractStatus(ref: string): Promise<string> }
interface NafathCapability { startVerification(nationalId: string): Promise<{ transactionId: string; randomNumber: string }>; getStatus(transactionId: string): Promise<'waiting'|'completed'|'rejected'|'expired'> }
interface NafithCapability { createNote(p: { customerId: string; amount: bigint; auctionId: string }): Promise<{ noteId: string; url: string }>; getNote(noteId: string): Promise<{ status: string }> }
```

Nearby categories and OSM tag filters come from `packages/schema` `nearby` (same as the current
frontend `api.js` Overpass query). Move that query server-side; the browser only calls
`/public/properties/:id/nearby`.

## 5. Admin UX for integrations (summary; full screen in docs/07 §9)

- Card grid grouped by category, each card: logo/name, status pill (مفعّل / معطّل), environment
  (تجريبي / مباشر), health (سليم / متذبذب / متوقف / غير معروف), last check time.
- Detail page: generated form; secrets shown as `••••a1b2` with «تغيير» button; «حفظ»,
  «اختبار الاتصال», «تفعيل/تعطيل», environment switch with confirmation when moving to live,
  webhook URL with copy button, last 50 call logs (filterable), health history.
- Every save → AuditLog (`integration.config.update` / `integration.secrets.update`, secrets redacted).

## 6. Redaction rules

Before logging, remove/mask keys matching `/(key|secret|token|password|authorization|iban|nationalId|card|cvc|otp)/i`
(keep last 4 chars), truncate bodies to 8 KB, never log full request headers.
