import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { sar } from '../../lib/format';
import { FormError } from '../LoginPage';
import { SettingsLayout, Switch } from './SettingsLayout';

type Method = 'moyasar' | 'bank_transfer' | 'rize';
type PType = 'deposit' | 'full';
type Offer = 'sale' | 'rent' | 'investment';
interface Policy {
  paymentTypes: PType[];
  defaultPaymentType: PType;
  deposit: { mode: 'fixed' | 'percent'; fixedAmount: number; percent: number; min: number | null; max: number | null };
  methods: Record<PType, Method[]>;
}
interface BookingSettings {
  enabled: boolean;
  allowedOffers: Offer[];
  policies: Record<Offer, Policy>;
  holdMinutesOnline: number;
  holdHoursTransfer: number;
  reviewHoursTransfer: number;
  autoConfirmWhenPaid: boolean;
  nafathRequiredAbove: number | null;
  termsVersion: string;
  termsHtml: string;
  cancellationPolicyHtml: string;
}
interface PaymentsSettings {
  moyasar: { enabled: boolean; labelAr: string; mode: string; sources: string[]; statementDescriptor: string };
  bank_transfer: { enabled: boolean; labelAr: string };
  rize: { enabled: boolean; labelAr: string; onlyRentPeriods: string[] };
  receiptPrefix: string;
  showVatNote: boolean;
  vatNoteAr: string;
}

const OFFERS: Array<[Offer, string]> = [
  ['sale', 'سياسة البيع'],
  ['rent', 'سياسة الإيجار'],
  ['investment', 'سياسة الاستثمار'],
];
const METHOD_LABEL: Record<Method, string> = { moyasar: 'ميسر', bank_transfer: 'تحويل بنكي', rize: 'رايز' };
const EXAMPLE_PRICE = 485_000_000; // 4,850,000 SAR — the screenshot's example

function depositOf(p: Policy, full: number): number {
  let a =
    p.deposit.mode === 'fixed'
      ? p.deposit.fixedAmount
      : Math.floor((full * Math.round(p.deposit.percent * 100)) / 10_000);
  if (p.deposit.min !== null && a < p.deposit.min) a = p.deposit.min;
  if (p.deposit.max !== null && a > p.deposit.max) a = p.deposit.max;
  return Math.min(a, full);
}

/** docs/04 §2 settings.booking + settings.payments — design/screenshots/a-settings-booking.png. */
export function BookingSettingsPage() {
  const toast = useToast();
  const [b, setB] = useState<BookingSettings | null>(null);
  const [p, setP] = useState<PaymentsSettings | null>(null);
  const [status, setStatus] = useState<{ ready: Record<Method, boolean>; activeBankAccounts: number } | null>(null);
  const [offer, setOffer] = useState<Offer>('sale');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<BookingSettings>('/admin/settings/booking'),
      api<PaymentsSettings>('/admin/settings/payments'),
      api<{ ready: Record<Method, boolean>; activeBankAccounts: number }>('/admin/payments/methods-status').catch(
        () => null,
      ),
    ])
      .then(([bs, ps, st]) => {
        setB(bs);
        setP(ps);
        setStatus(st);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'تعذّر التحميل'));
  }, []);

  const policy = b?.policies[offer];
  const setPolicy = (patch: Partial<Policy>) =>
    setB((x) => (x ? { ...x, policies: { ...x.policies, [offer]: { ...x.policies[offer], ...patch } } } : x));
  const setDeposit = (patch: Partial<Policy['deposit']>) =>
    policy && setPolicy({ deposit: { ...policy.deposit, ...patch } });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const example = useMemo(() => {
    if (!b || !p) return null;
    const pol = b.policies.sale;
    const methods = [...new Set(pol.paymentTypes.flatMap((t) => pol.methods[t]))].filter(
      (m) => p[m].enabled && (status?.ready[m] ?? true),
    );
    return { deposit: depositOf(pol, EXAMPLE_PRICE), methods };
  }, [b, p, status]);

  const save = async () => {
    if (!b || !p) return;
    setBusy(true);
    setError(null);
    try {
      const [bs, ps] = await Promise.all([
        api<BookingSettings>('/admin/settings/booking', { method: 'PUT', body: b }),
        api<PaymentsSettings>('/admin/settings/payments', { method: 'PUT', body: p }),
      ]);
      setB(bs);
      setP(ps);
      toast('تم حفظ الإعدادات');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `${e.message}${Object.keys(e.fields).length ? ` (${Object.keys(e.fields).join('، ')})` : ''}`
          : 'تعذّر الحفظ',
      );
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const halalas = (v: string) => Math.max(0, Math.round((Number(v.replace(/,/g, '')) || 0) * 100));

  return (
    <SettingsLayout
      subtitle="الحجز وطرق الدفع — ما يراه العميل عند الضغط على «احجز العقار»"
      actions={
        <button type="button" className="btn btn--primary btn--sm" disabled={!b || busy} onClick={() => void save()}>
          <Icon name="check" />
          حفظ
        </button>
      }
    >
      <FormError error={error} />
      {!b || !p || !policy ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : (
        <div className="g2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <section className="panel2">
              <div className="ph">
                <h3>عام</h3>
              </div>
              <div className="pb">
                <div className="trow">
                  <div>
                    <b>تفعيل الحجز في الموقع</b>
                    <small>زر «احجز العقار» في صفحات العقارات المتاحة</small>
                  </div>
                  <Switch on={b.enabled} label="تفعيل الحجز" onChange={(v) => setB({ ...b, enabled: v })} />
                </div>
                <div className="trow">
                  <div>
                    <b>تأكيد الحجز تلقائياً عند اكتمال الدفع</b>
                    <small>يغيّر حالة العقار إلى «محجوز»</small>
                  </div>
                  <Switch
                    on={b.autoConfirmWhenPaid}
                    label="تأكيد تلقائي"
                    onChange={(v) => setB({ ...b, autoConfirmWhenPaid: v })}
                  />
                </div>
                <div className="trow">
                  <div>
                    <b>العروض التي يمكن حجزها</b>
                  </div>
                  <div className="chips">
                    {OFFERS.map(([k]) => (
                      <button
                        key={k}
                        type="button"
                        className={`chip${b.allowedOffers.includes(k) ? ' is-on' : ''}`}
                        aria-pressed={b.allowedOffers.includes(k)}
                        onClick={() => setB({ ...b, allowedOffers: toggle(b.allowedOffers, k) })}
                      >
                        {{ sale: 'للبيع', rent: 'للإيجار', investment: 'للاستثمار' }[k]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form3" style={{ marginTop: 14 }}>
                  <div className="field">
                    <label htmlFor="h-online">مهلة الدفع الإلكتروني (دقيقة)</label>
                    <input
                      id="h-online"
                      className="input"
                      type="number"
                      min={5}
                      max={1440}
                      value={b.holdMinutesOnline}
                      onChange={(e) => setB({ ...b, holdMinutesOnline: num(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="h-transfer">مهلة رفع إيصال التحويل (ساعة)</label>
                    <input
                      id="h-transfer"
                      className="input"
                      type="number"
                      min={1}
                      max={336}
                      value={b.holdHoursTransfer}
                      onChange={(e) => setB({ ...b, holdHoursTransfer: num(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="h-review">مهلة مراجعة التحويل (ساعة)</label>
                    <input
                      id="h-review"
                      className="input"
                      type="number"
                      min={1}
                      max={336}
                      value={b.reviewHoursTransfer}
                      onChange={(e) => setB({ ...b, reviewHoursTransfer: num(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="panel2">
              <nav className="tabs2" aria-label="السياسة حسب العرض">
                {OFFERS.map(([k, l]) => (
                  <a
                    key={k}
                    href={`#${k}`}
                    className={offer === k ? 'on' : ''}
                    onClick={(e) => (e.preventDefault(), setOffer(k))}
                  >
                    {l}
                  </a>
                ))}
              </nav>
              <div className="pb" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label>خيارات الدفع المتاحة للعميل</label>
                  <div className="chips">
                    {(['deposit', 'full'] as PType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`chip${policy.paymentTypes.includes(t) ? ' is-on' : ''}`}
                        aria-pressed={policy.paymentTypes.includes(t)}
                        onClick={() => {
                          const types = toggle(policy.paymentTypes, t);
                          if (!types.length) return;
                          setPolicy({
                            paymentTypes: types,
                            defaultPaymentType: types.includes(policy.defaultPaymentType)
                              ? policy.defaultPaymentType
                              : types[0]!,
                          });
                        }}
                      >
                        {policy.paymentTypes.includes(t) ? '✓ ' : ''}
                        {t === 'deposit' ? 'عربون' : 'دفع كامل'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form3">
                  <div className="field">
                    <label>طريقة حساب العربون</label>
                    <div className="seg">
                      <button
                        type="button"
                        aria-pressed={policy.deposit.mode === 'fixed'}
                        onClick={() => setDeposit({ mode: 'fixed' })}
                      >
                        مبلغ ثابت
                      </button>
                      <button
                        type="button"
                        aria-pressed={policy.deposit.mode === 'percent'}
                        onClick={() => setDeposit({ mode: 'percent' })}
                      >
                        نسبة من السعر
                      </button>
                    </div>
                  </div>
                  {policy.deposit.mode === 'fixed' ? (
                    <div className="field">
                      <label htmlFor="d-fixed">مبلغ العربون (ر.س)</label>
                      <input
                        id="d-fixed"
                        className="input"
                        inputMode="decimal"
                        value={policy.deposit.fixedAmount / 100}
                        onChange={(e) => setDeposit({ fixedAmount: halalas(e.target.value) })}
                      />
                    </div>
                  ) : (
                    <div className="field">
                      <label htmlFor="d-pct">النسبة (%)</label>
                      <input
                        id="d-pct"
                        className="input"
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={policy.deposit.percent}
                        onChange={(e) =>
                          setDeposit({ percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
                        }
                      />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="d-max">الحد الأقصى (ر.س)</label>
                    <input
                      id="d-max"
                      className="input"
                      inputMode="decimal"
                      placeholder="بدون حد"
                      value={policy.deposit.max === null ? '' : policy.deposit.max / 100}
                      onChange={(e) => setDeposit({ max: e.target.value.trim() ? halalas(e.target.value) : null })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="d-min">الحد الأدنى (ر.س)</label>
                    <input
                      id="d-min"
                      className="input"
                      inputMode="decimal"
                      placeholder="بدون حد"
                      value={policy.deposit.min === null ? '' : policy.deposit.min / 100}
                      onChange={(e) => setDeposit({ min: e.target.value.trim() ? halalas(e.target.value) : null })}
                    />
                  </div>
                </div>
                <div className="form2">
                  {(['deposit', 'full'] as PType[]).map((t) => (
                    <div className="field" key={t}>
                      <label>{t === 'deposit' ? 'طرق دفع العربون' : 'طرق الدفع الكامل'}</label>
                      <div className="chips">
                        {(['moyasar', 'bank_transfer', 'rize'] as Method[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`chip${policy.methods[t].includes(m) ? ' is-on' : ''}`}
                            aria-pressed={policy.methods[t].includes(m)}
                            onClick={() =>
                              setPolicy({ methods: { ...policy.methods, [t]: toggle(policy.methods[t], m) } })
                            }
                          >
                            {policy.methods[t].includes(m) ? '✓ ' : ''}
                            {METHOD_LABEL[m]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel2">
              <div className="ph">
                <h3>طرق الدفع</h3>
              </div>
              <div className="pb">
                <div className="trow">
                  <div>
                    <b>ميسر — الدفع الإلكتروني</b>
                    <small>
                      مدى · فيزا · Apple Pay ·{' '}
                      {status
                        ? status.ready.moyasar
                          ? 'التكامل سليم'
                          : 'التكامل غير مفعّل أو بلا مفاتيح (التكاملات ← ميسر)'
                        : ''}
                    </small>
                  </div>
                  <Switch
                    on={p.moyasar.enabled}
                    label="ميسر"
                    onChange={(v) => setP({ ...p, moyasar: { ...p.moyasar, enabled: v } })}
                  />
                </div>
                <div className="trow">
                  <div>
                    <b>تحويل بنكي</b>
                    <small>{status ? `${status.activeBankAccounts} حسابات بنكية مفعّلة` : ''}</small>
                  </div>
                  <Switch
                    on={p.bank_transfer.enabled}
                    label="تحويل بنكي"
                    onChange={(v) => setP({ ...p, bank_transfer: { ...p.bank_transfer, enabled: v } })}
                  />
                </div>
                <div className="trow">
                  <div>
                    <b>رايز — قسّط إيجارك</b>
                    <small>بانتظار بيانات الربط من رايز</small>
                  </div>
                  <Switch on={false} disabled label="رايز" onChange={() => undefined} />
                </div>
              </div>
            </section>

            <section className="panel2">
              <div className="ph">
                <h3>الشروط</h3>
              </div>
              <div className="pb form2">
                <div className="field">
                  <label htmlFor="t-ver">إصدار شروط الحجز</label>
                  <input
                    id="t-ver"
                    className="input"
                    dir="ltr"
                    maxLength={20}
                    value={b.termsVersion}
                    onChange={(e) => setB({ ...b, termsVersion: e.target.value })}
                  />
                  <small className="muted">غيّر الإصدار عند تعديل الشروط ليوافق العملاء عليها من جديد.</small>
                </div>
                <div className="field">
                  <label htmlFor="t-nafath">يتطلب التحقق عبر نفاذ عند مبلغ يزيد عن (ر.س)</label>
                  <input
                    id="t-nafath"
                    className="input"
                    inputMode="decimal"
                    placeholder="غير مطلوب"
                    value={b.nafathRequiredAbove === null ? '' : b.nafathRequiredAbove / 100}
                    onChange={(e) =>
                      setB({ ...b, nafathRequiredAbove: e.target.value.trim() ? halalas(e.target.value) : null })
                    }
                  />
                </div>
                <div className="field full">
                  <label htmlFor="t-html">شروط الحجز</label>
                  <small className="muted">
                    نص منسّق بوسوم HTML بسيطة (فقرات، قوائم، روابط)؛ تُنظَّف الوسوم غير المسموحة عند الحفظ.
                  </small>
                  <textarea
                    id="t-html"
                    className="textarea"
                    style={{ minHeight: 120 }}
                    value={b.termsHtml}
                    onChange={(e) => setB({ ...b, termsHtml: e.target.value })}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="t-cancel">سياسة الإلغاء</label>
                  <textarea
                    id="t-cancel"
                    className="textarea"
                    style={{ minHeight: 100 }}
                    value={b.cancellationPolicyHtml}
                    onChange={(e) => setB({ ...b, cancellationPolicyHtml: e.target.value })}
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="panel2" style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
            <div className="ph">
              <h3>مثال حي</h3>
            </div>
            <div className="pb">
              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 16,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <span className="muted">فيلا مودرن — {sar(EXAMPLE_PRICE)}</span>
                {b.policies.sale.paymentTypes.includes('deposit') && example ? (
                  <b style={{ fontSize: 24, color: 'var(--green)' }}>
                    {sar(example.deposit)} <small style={{ fontSize: 14 }}>عربون</small>
                  </b>
                ) : null}
                {(
                  [
                    ['أو الدفع الكامل', sar(EXAMPLE_PRICE)],
                    ['طرق الدفع', example?.methods.map((m) => METHOD_LABEL[m]).join(' · ') || '—'],
                    ['مهلة الحجز', `${b.holdMinutesOnline} دقيقة`],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 0',
                      borderTop: '1px dashed var(--line)',
                    }}
                  >
                    <span className="muted">{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </SettingsLayout>
  );
}
