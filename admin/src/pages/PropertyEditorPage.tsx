import { fieldGroups, fieldsFor, offers, rentPeriods, statuses, types, type FieldDef } from '@manzilah/schema';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { MapPicker } from '../components/MapPicker';
import { LicensePill, StatusPill, VisibilityPill } from '../components/Pills';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError, fieldMessage } from '../lib/api';
import { date, timeAgo } from '../lib/format';
import type { AdminProperty, CityRow, StaffMember } from '../lib/types';
import { FormError } from './LoginPage';
import { StatusModal } from './PropertiesPage';

const MONEY_SPECS = new Set(['annualIncome', 'deposit']);
const SECTIONS = [
  ['basics', 'الأساسيات'],
  ['location', 'الموقع'],
  ['specs', 'المواصفات'],
  ['price', 'السعر والحجز'],
  ['media', 'الصور والملفات'],
  ['license', 'الترخيص'],
  ['seo', 'SEO'],
  ['history', 'السجل'],
] as const;

interface Form {
  type: string;
  offer: 'sale' | 'rent' | 'investment';
  title: string;
  description: string;
  featured: boolean;
  agentId: string;
  cityId: string;
  districtId: string;
  lat: number;
  lng: number;
  showExactLocation: boolean;
  priceSar: string;
  rentPeriod: 'yearly' | 'monthly' | 'daily' | null;
  negotiable: boolean;
  bookingEnabled: boolean;
  specs: Record<string, unknown>;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  keywords: string;
  noindex: boolean;
  slug: string;
}

const BLANK: Form = {
  type: 'villa',
  offer: 'sale',
  title: '',
  description: '',
  featured: false,
  agentId: '',
  cityId: 'riyadh',
  districtId: '',
  lat: 24.7136,
  lng: 46.6753,
  showExactLocation: true,
  priceSar: '',
  rentPeriod: null,
  negotiable: false,
  bookingEnabled: true,
  specs: {},
  seoTitle: '',
  seoDescription: '',
  focusKeyword: '',
  keywords: '',
  noindex: false,
  slug: '',
};

function fromProperty(p: AdminProperty): Form {
  const specs: Record<string, unknown> = { ...p.specs };
  for (const k of MONEY_SPECS) if (typeof specs[k] === 'number') specs[k] = (specs[k] as number) / 100;
  return {
    type: p.type,
    offer: p.offer,
    title: p.title,
    description: p.description,
    featured: p.featured,
    agentId: p.agentId,
    cityId: p.cityId,
    districtId: p.districtId,
    lat: p.lat,
    lng: p.lng,
    showExactLocation: p.showExactLocation,
    priceSar: String(p.price / 100),
    rentPeriod: p.rentPeriod,
    negotiable: p.negotiable,
    bookingEnabled: p.bookingEnabled,
    specs,
    seoTitle: p.seoTitle ?? '',
    seoDescription: p.seoDescription ?? '',
    focusKeyword: p.focusKeyword ?? '',
    keywords: p.keywords.join('، '),
    noindex: p.noindex,
    slug: p.slug,
  };
}

/** Form → API body (money in halalas, unknown/empty specs dropped). */
function toBody(f: Form, isNew: boolean) {
  const allowed = new Set(fieldsFor(f.type, f.offer).map((x) => x.key));
  const specs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f.specs)) {
    if (!allowed.has(k) || v === '' || v === null || v === undefined) continue;
    specs[k] = MONEY_SPECS.has(k) ? Math.round(Number(v) * 100) : v;
  }
  const price = Math.round(Number(String(f.priceSar).replace(/[^\d.]/g, '')) * 100);
  const body: Record<string, unknown> = {
    type: f.type,
    offer: f.offer,
    title: f.title.trim(),
    description: f.description.trim(),
    featured: f.featured,
    cityId: f.cityId,
    districtId: f.districtId,
    lat: f.lat,
    lng: f.lng,
    showExactLocation: f.showExactLocation,
    price: Number.isFinite(price) ? price : 0,
    rentPeriod: f.offer === 'rent' ? (f.rentPeriod ?? 'yearly') : null,
    negotiable: f.negotiable,
    bookingEnabled: f.bookingEnabled,
    specs,
    seoTitle: f.seoTitle.trim() || null,
    seoDescription: f.seoDescription.trim() || null,
    focusKeyword: f.focusKeyword.trim() || null,
    keywords: f.keywords
      .split(/[،,]/)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20),
    noindex: f.noindex,
  };
  if (f.agentId) body.agentId = f.agentId;
  if (!isNew && f.slug) body.slug = f.slug;
  return body;
}

function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="panel2 editor-section" id={`sec-${id}`} aria-labelledby={`h-${id}`}>
      <div className="ph">
        <h3 id={`h-${id}`}>{title}</h3>
        {aside}
      </div>
      <div className="pb">{children}</div>
    </section>
  );
}

function Err({ fields, k }: { fields: Record<string, string>; k: string }) {
  const m = fields[k];
  return m ? <span className="field-error">{fieldMessage(m)}</span> : null;
}

function SpecInput({
  f,
  value,
  onChange,
  error,
}: {
  f: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const id = `spec-${f.key}`;
  const label = `${f.label}${f.unit ? ` (${f.unit})` : ''}${MONEY_SPECS.has(f.key) ? ' (ر.س)' : ''}${f.required ? ' *' : ''}`;
  let input: ReactNode;
  if (f.kind === 'select') {
    input = (
      <select
        id={id}
        className="select"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">—</option>
        {Object.entries(f.options ?? {}).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    );
  } else if (f.kind === 'date') {
    input = (
      <input
        id={id}
        className="input"
        type="date"
        dir="ltr"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  } else if (f.kind === 'text') {
    input = (
      <input
        id={id}
        className="input"
        dir={f.group === 'legal' || f.key.endsWith('No') ? 'ltr' : undefined}
        value={String(value ?? '')}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else {
    input = (
      <input
        id={id}
        className="input"
        type="number"
        min={0}
        step={f.kind === 'money' ? '0.01' : 'any'}
        dir="ltr"
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {input}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

export function PropertyEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const { can, me } = useSession();
  const [p, setP] = useState<AdminProperty | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [agents, setAgents] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [history, setHistory] = useState<{
    status: Array<{ id: string; from: string; to: string; reason: string | null; createdAt: string }>;
    audit: Array<{ id: string; action: string; createdAt: string }>;
  } | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  const editable = isNew ? can('properties.create') : !!p?.canEdit && can('properties.edit');

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const data = await api<AdminProperty>(`/admin/properties/${id}`);
      setP(data);
      setForm(fromProperty(data));
      setDirty(false);
      setSavedAt(data.updatedAt);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [id, isNew]);

  useEffect(() => {
    void load();
    void api<{ items: CityRow[] }>('/admin/cities').then((r) => setCities(r.items));
    if (can('staff.manage'))
      void api<{ items: StaffMember[] }>('/admin/staff').then((r) => setAgents(r.items.filter((a) => a.isActive)));
  }, [load, can]);

  // New listings start with the first district of the city and the current user as agent.
  useEffect(() => {
    if (!isNew || form.districtId || !cities.length) return;
    const c = cities.find((x) => x.id === form.cityId) ?? cities[0]!;
    setForm((f) => ({
      ...f,
      cityId: c.id,
      lat: c.lat,
      lng: c.lng,
      districtId: c.districts[0]?.id ?? '',
      agentId: f.agentId || me?.staff.id || '',
    }));
  }, [isNew, cities, form.cityId, form.districtId, me]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const setSpec = (k: string, v: unknown) => {
    setForm((f) => ({ ...f, specs: { ...f.specs, [k]: v } }));
    setDirty(true);
  };

  const save = useCallback(
    async (opts: { silent?: boolean; toEditor?: boolean } = {}) => {
      if (!opts.silent) setBusy(true);
      setError(null);
      setFields({});
      try {
        const body = toBody(formRef.current, isNew);
        if (isNew) {
          const created = await api<AdminProperty>('/admin/properties', { body });
          toast('تم إنشاء المسودة');
          navigate(opts.toEditor ? `/properties/${created.id}/edit#sec-media` : `/properties/${created.id}`, {
            replace: true,
          });
          return true;
        }
        const updated = await api<AdminProperty>(`/admin/properties/${id}`, { method: 'PATCH', body });
        setP(updated);
        setDirty(false);
        setSavedAt(updated.updatedAt);
        if (!opts.silent) toast('تم الحفظ');
        return true;
      } catch (e) {
        if (e instanceof ApiError) {
          setError(e.message);
          setFields(e.fields);
        } else setError('تعذّر الحفظ');
        return false;
      } finally {
        if (!opts.silent) setBusy(false);
      }
    },
    [id, isNew, navigate, toast],
  );

  // Autosave drafts every 20 s (docs/07 §3).
  useEffect(() => {
    if (isNew || !editable || p?.visibility !== 'draft') return;
    const t = window.setInterval(() => {
      if (dirty) void save({ silent: true });
    }, 20_000);
    return () => window.clearInterval(t);
  }, [isNew, editable, p?.visibility, dirty, save]);

  async function action(path: string, msg: string, method = 'POST') {
    setBusy(true);
    setError(null);
    try {
      if (dirty && path.endsWith('/publish') && !(await save({ silent: true }))) return;
      const r = await api<AdminProperty>(`/admin/properties/${id}${path}`, {
        method,
        body: method === 'POST' ? {} : undefined,
      });
      toast(msg);
      if (path === '/duplicate') navigate(`/properties/${r.id}`);
      else if (method === 'DELETE') navigate('/properties');
      else await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  }

  const city = cities.find((c) => c.id === form.cityId);
  const specFields = useMemo(
    () => (types[form.type as keyof typeof types]?.offers.includes(form.offer) ? fieldsFor(form.type, form.offer) : []),
    [form.type, form.offer],
  );
  const specErr = (k: string) => fieldMessage(fields[`specs.${k}`]);

  if (loadError) {
    return (
      <section className="panel2">
        <div className="pb">
          <EmptyState title="تعذّر تحميل العقار">{loadError}</EmptyState>
        </div>
      </section>
    );
  }
  if (!isNew && !p) {
    return (
      <section className="panel2">
        <div className="pb">
          <EmptyState icon="clock" title="جارٍ التحميل…" />
        </div>
      </section>
    );
  }

  const publicUrl = p ? `/property/${p.id}-${encodeURIComponent(p.slug)}` : null;

  return (
    <>
      <div className="adm-head">
        <div>
          <div className="crumb">
            <Link to="/properties">العقارات</Link> / {isNew ? 'إضافة' : 'تعديل'}
          </div>
          <h1>{isNew ? 'عقار جديد' : p!.title}</h1>
          <p>
            {p ? (
              <>
                {p.code} · <VisibilityPill v={p.visibility} /> · <StatusPill status={p.status} /> ·{' '}
                {dirty ? 'تعديلات غير محفوظة' : `آخر حفظ ${timeAgo(savedAt)}`}
              </>
            ) : (
              'احفظ المسودة لتتمكن من رفع الصور'
            )}
          </p>
        </div>
        <div className="acts">
          {p && publicUrl ? (
            <a
              className="btn btn--ghost btn--sm"
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={p.visibility !== 'published'}
            >
              <Icon name="eye" />
              معاينة
            </a>
          ) : null}
          {p && editable && can('properties.status') ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStatusOpen(true)}>
              تغيير الحالة
            </button>
          ) : null}
          {p && editable && can('properties.create') ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void action('/duplicate', 'تم إنشاء نسخة')}
              disabled={busy}
            >
              <Icon name="copy" />
              نسخ
            </button>
          ) : null}
          {p && can('properties.delete') ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() =>
                window.confirm('حذف العقار؟ يُخفى من الموقع ويُنقل للأرشيف.') &&
                void action('', 'تم حذف العقار', 'DELETE')
              }
            >
              حذف
            </button>
          ) : null}
          {editable ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void save()} disabled={busy}>
              <Icon name="check" />
              حفظ
            </button>
          ) : null}
          {p && can('properties.publish') ? (
            p.visibility === 'published' ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void action('/unpublish', 'أُلغي نشر العقار')}
                disabled={busy}
              >
                إلغاء النشر
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void action('/publish', 'تم نشر العقار')}
                disabled={busy}
              >
                <Icon name="check" />
                حفظ ونشر
              </button>
            )
          ) : null}
        </div>
      </div>

      <nav className="tabs2 editor-tabs" aria-label="أقسام المحرر">
        {SECTIONS.filter(([k]) => !isNew || !['history'].includes(k)).map(([k, l]) => (
          <a
            key={k}
            href={`#sec-${k}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`sec-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {l}
          </a>
        ))}
      </nav>

      <FormError error={error} />
      {p && p.publishProblems.length && p.visibility !== 'published' ? (
        <div className="notice" role="status">
          <b>قبل النشر:</b> {p.publishProblems.map((x) => x.message).join(' · ')}
        </div>
      ) : null}
      {!editable ? <div className="notice">هذا العقار ليس ضمن عقاراتك، يمكنك عرضه فقط.</div> : null}

      <fieldset disabled={!editable} className="editor">
        <Section id="basics" title="الأساسيات">
          <div className="field">
            <span className="label">نوع العقار</span>
            <div className="chips type-chips" role="radiogroup" aria-label="نوع العقار">
              {Object.entries(types).map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.type === k}
                  className={`chip${form.type === k ? ' is-on' : ''}`}
                  onClick={() => {
                    const allowed = t.offers as string[];
                    setForm((f) => ({
                      ...f,
                      type: k,
                      offer: allowed.includes(f.offer) ? f.offer : (allowed[0] as Form['offer']),
                    }));
                    setDirty(true);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form2" style={{ marginTop: 16 }}>
            <div className="field">
              <span className="label">نوع العرض</span>
              <div className="seg" role="radiogroup" aria-label="نوع العرض">
                {(types[form.type as keyof typeof types].offers as Array<Form['offer']>).map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={form.offer === o}
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        offer: o,
                        rentPeriod: o === 'rent' ? (f.rentPeriod ?? 'yearly') : null,
                      }));
                      setDirty(true);
                    }}
                  >
                    {offers[o].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="agent">المستشار المسؤول</label>
              {agents.length ? (
                <select
                  id="agent"
                  className="select"
                  value={form.agentId}
                  onChange={(e) => set('agentId', e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input" value={p?.agent.name ?? me?.staff.name ?? ''} disabled />
              )}
            </div>
            <div className="field full">
              <label htmlFor="title">عنوان الإعلان *</label>
              <input
                id="title"
                className="input"
                maxLength={140}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
              <Err fields={fields} k="title" />
            </div>
            <div className="field full">
              <label htmlFor="desc">الوصف *</label>
              <textarea
                id="desc"
                className="textarea"
                rows={5}
                maxLength={10000}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
              <Err fields={fields} k="description" />
            </div>
            <label className="check full">
              <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
              عقار مميز (يظهر في الرئيسية)
            </label>
          </div>
        </Section>

        <Section id="location" title="الموقع">
          <div className="form3">
            <div className="field">
              <label htmlFor="city">المدينة</label>
              <select
                id="city"
                className="select"
                value={form.cityId}
                onChange={(e) => {
                  const c = cities.find((x) => x.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    cityId: e.target.value,
                    districtId: c?.districts[0]?.id ?? '',
                    lat: c?.lat ?? f.lat,
                    lng: c?.lng ?? f.lng,
                  }));
                  setDirty(true);
                }}
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="district">الحي</label>
              <select
                id="district"
                className="select"
                value={form.districtId}
                onChange={(e) => set('districtId', e.target.value)}
              >
                {city?.districts
                  .filter((d) => d.isActive || d.id === form.districtId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nameAr}
                    </option>
                  ))}
              </select>
              <Err fields={fields} k="districtId" />
              <button
                type="button"
                className="link-btn"
                style={{ alignSelf: 'flex-start' }}
                onClick={async () => {
                  const name = window.prompt('اسم الحي الجديد')?.trim();
                  if (!name) return;
                  try {
                    const d = await api<{ id: string }>('/admin/districts', {
                      body: { cityId: form.cityId, nameAr: name },
                    });
                    const r = await api<{ items: CityRow[] }>('/admin/cities');
                    setCities(r.items);
                    set('districtId', d.id);
                    toast('أُضيف الحي');
                  } catch (e) {
                    toast(e instanceof ApiError ? e.message : 'تعذّر إضافة الحي');
                  }
                }}
              >
                + إضافة حي
              </button>
            </div>
            <label className="check" style={{ alignSelf: 'center' }}>
              <input
                type="checkbox"
                checked={form.showExactLocation}
                onChange={(e) => set('showExactLocation', e.target.checked)}
              />
              إظهار الموقع الدقيق للزوار
            </label>
          </div>
          <MapPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(lat, lng) => {
              setForm((f) => ({ ...f, lat, lng }));
              setDirty(true);
            }}
          />
          <p className="hint" dir="ltr" style={{ textAlign: 'right' }}>
            {form.lat.toFixed(6)}, {form.lng.toFixed(6)}
          </p>
          {!form.showExactLocation ? <p className="hint">يظهر للزوار موقع تقريبي ضمن 250 متراً.</p> : null}
        </Section>

        <Section id="specs" title="المواصفات">
          {fieldGroups
            .filter((g) => g.id !== 'legal')
            .map((g) => {
              const list = specFields.filter((f) => f.group === g.id);
              if (!list.length) return null;
              const bools = list.filter((f) => f.kind === 'bool');
              const rest = list.filter((f) => f.kind !== 'bool');
              return (
                <div key={g.id} className="spec-group">
                  <h4>{g.label}</h4>
                  {rest.length ? (
                    <div className="form3">
                      {rest.map((f) => (
                        <SpecInput
                          key={f.key}
                          f={f}
                          value={form.specs[f.key]}
                          error={specErr(f.key)}
                          onChange={(v) => setSpec(f.key, v)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {bools.length ? (
                    <div className="chips" style={{ marginTop: rest.length ? 12 : 0 }}>
                      {bools.map((f) => {
                        const on = form.specs[f.key] === true;
                        return (
                          <button
                            key={f.key}
                            type="button"
                            className={`chip${on ? ' is-on' : ''}`}
                            aria-pressed={on}
                            onClick={() => setSpec(f.key, on ? undefined : true)}
                          >
                            {on ? '✓ ' : ''}
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
        </Section>

        <Section id="price" title="السعر والحجز">
          <div className="form3">
            <div className="field">
              <label htmlFor="price">السعر (ر.س) *</label>
              <input
                id="price"
                className="input"
                inputMode="decimal"
                dir="ltr"
                value={form.priceSar}
                onChange={(e) => set('priceSar', e.target.value)}
              />
              <Err fields={fields} k="price" />
            </div>
            {form.offer === 'rent' ? (
              <div className="field">
                <label htmlFor="rp">مدة الإيجار</label>
                <select
                  id="rp"
                  className="select"
                  value={form.rentPeriod ?? 'yearly'}
                  onChange={(e) => set('rentPeriod', e.target.value as Form['rentPeriod'])}
                >
                  {Object.entries(rentPeriods).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <label className="check" style={{ alignSelf: 'center' }}>
              <input type="checkbox" checked={form.negotiable} onChange={(e) => set('negotiable', e.target.checked)} />
              السعر قابل للتفاوض
            </label>
            <label className="check" style={{ alignSelf: 'center' }}>
              <input
                type="checkbox"
                checked={form.bookingEnabled}
                onChange={(e) => set('bookingEnabled', e.target.checked)}
              />
              تفعيل الحجز لهذا العقار
            </label>
          </div>
          <p className="hint">قيمة العربون وطرق الدفع تُضبط من إعدادات الحجز (المرحلة 5).</p>
        </Section>

        {p ? (
          <MediaSection p={p} editable={editable} onChanged={load} />
        ) : (
          <Section id="media" title="الصور والملفات">
            <div className="media-gate">
              <div className="media-gate__icon" aria-hidden>
                <Icon name="layers" />
              </div>
              <p className="media-gate__title">احفظ المسودة أولاً لرفع صور العقار</p>
              <p className="hint">
                بعد حفظ الأساسيات نُنشئ مسودة للعقار، ثم تظهر لك أداة رفع الصور والمخططات ومقاطع الفيديو. تُخزَّن الصور بأمان على مساحة المكتب الخاصة.
              </p>
              <button
                type="button"
                className="btn btn--p"
                disabled={!editable || busy}
                onClick={() => void save({ toEditor: true })}
              >
                <Icon name="check" />
                حفظ المسودة ومتابعة إضافة الصور
              </button>
            </div>
          </Section>
        )}

        <Section id="license" title="الترخيص" aside={p ? <LicensePill p={p} /> : null}>
          <div className="form3">
            {specFields
              .filter((f) => f.group === 'legal' && f.kind !== 'bool' && f.kind !== 'select')
              .map((f) => (
                <SpecInput
                  key={f.key}
                  f={f}
                  value={form.specs[f.key]}
                  error={specErr(f.key)}
                  onChange={(v) => setSpec(f.key, v)}
                />
              ))}
          </div>
          <div className="form3" style={{ marginTop: 12 }}>
            {specFields
              .filter((f) => f.group === 'legal' && f.kind === 'select')
              .map((f) => (
                <SpecInput
                  key={f.key}
                  f={f}
                  value={form.specs[f.key]}
                  error={specErr(f.key)}
                  onChange={(v) => setSpec(f.key, v)}
                />
              ))}
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {specFields
              .filter((f) => f.group === 'legal' && f.kind === 'bool')
              .map((f) => {
                const on = form.specs[f.key] === true;
                return (
                  <button
                    key={f.key}
                    type="button"
                    className={`chip${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setSpec(f.key, on ? undefined : true)}
                  >
                    {on ? '✓ ' : ''}
                    {f.label}
                  </button>
                );
              })}
          </div>
          {p ? (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={async () => {
                  try {
                    await api(`/admin/properties/${p.id}/rega-check`, { body: {} });
                  } catch (e) {
                    toast(e instanceof ApiError ? e.message : 'تعذّر التحقق');
                  }
                }}
              >
                <Icon name="shield" />
                التحقق من الهيئة
              </button>
            </div>
          ) : null}
          <p className="hint">لا يمكن نشر العقار بدون رقم ترخيص الإعلان ورقم رخصة فال، أو إذا انتهى الترخيص.</p>
        </Section>

        <Section id="seo" title="SEO">
          <div className="form2">
            <div className="field">
              <label htmlFor="fk">الكلمة المفتاحية الرئيسية</label>
              <input
                id="fk"
                className="input"
                maxLength={60}
                value={form.focusKeyword}
                onChange={(e) => set('focusKeyword', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="kw">كلمات إضافية (افصلها بفاصلة)</label>
              <input
                id="kw"
                className="input"
                value={form.keywords}
                onChange={(e) => set('keywords', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="st">عنوان SEO ({form.seoTitle.length}/60)</label>
              <input
                id="st"
                className="input"
                maxLength={70}
                value={form.seoTitle}
                onChange={(e) => set('seoTitle', e.target.value)}
                placeholder={form.title}
              />
            </div>
            <div className="field">
              <label htmlFor="slug">الرابط المختصر</label>
              <input
                id="slug"
                className="input"
                maxLength={80}
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                disabled={isNew}
              />
              <Err fields={fields} k="slug" />
            </div>
            <div className="field full">
              <label htmlFor="sd">الوصف التعريفي ({form.seoDescription.length}/160)</label>
              <textarea
                id="sd"
                className="textarea"
                rows={2}
                maxLength={170}
                value={form.seoDescription}
                onChange={(e) => set('seoDescription', e.target.value)}
              />
            </div>
            <label className="check full">
              <input type="checkbox" checked={form.noindex} onChange={(e) => set('noindex', e.target.checked)} />
              منع محركات البحث من فهرسة هذه الصفحة (noindex)
            </label>
          </div>
          <div className="snippet" aria-label="معاينة نتيجة البحث">
            <span className="snippet__url" dir="ltr">
              {window.location.host}/property/{p?.id ?? '…'}-{form.slug || '…'}
            </span>
            <b>{form.seoTitle || form.title || 'عنوان العقار'}</b>
            <p>{form.seoDescription || form.description.slice(0, 155)}</p>
          </div>
          <p className="hint">تقييم SEO التفصيلي والقوالب التلقائية تأتي في المرحلة 6.</p>
        </Section>

        {p ? (
          <Section
            id="history"
            title="السجل"
            aside={
              !history ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={async () => setHistory(await api(`/admin/properties/${p.id}/history`))}
                >
                  عرض السجل
                </button>
              ) : null
            }
          >
            {history ? (
              <div className="feed">
                {history.status.map((h) => (
                  <div className="it" key={h.id}>
                    <span className="dot">
                      <Icon name="clock" />
                    </span>
                    <div>
                      <b>
                        {statuses[h.from as keyof typeof statuses]?.label} ←{' '}
                        {statuses[h.to as keyof typeof statuses]?.label}
                      </b>
                      <small>
                        {date(h.createdAt)}
                        {h.reason ? ` · ${h.reason}` : ''}
                      </small>
                    </div>
                  </div>
                ))}
                {history.audit.map((a) => (
                  <div className="it" key={a.id}>
                    <span className="dot">
                      <Icon name="list" />
                    </span>
                    <div>
                      <b dir="ltr" style={{ textAlign: 'right' }}>
                        {a.action}
                      </b>
                      <small>{timeAgo(a.createdAt)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">تغييرات الحالة وسجل العمليات على هذا العقار.</p>
            )}
          </Section>
        ) : null}
      </fieldset>

      {statusOpen && p ? (
        <StatusModal
          p={p}
          onClose={() => setStatusOpen(false)}
          onDone={async () => {
            setStatusOpen(false);
            toast('تم تحديث الحالة');
            await load();
          }}
        />
      ) : null}
    </>
  );
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

function MediaSection({
  p,
  editable,
  onChanged,
}: {
  p: AdminProperty;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [uploads, setUploads] = useState<Array<{ name: string; state: string }>>([]);
  const [video, setVideo] = useState('');
  const [drag, setDrag] = useState(false);
  const photos = p.media.filter((m) => m.kind !== 'video_url').sort((a, b) => a.sort - b.sort);
  const videos = p.media.filter((m) => m.kind === 'video_url');
  const processing = photos.some((m) => m.status === 'processing');

  // Poll while the worker renders variants.
  useEffect(() => {
    if (!processing) return;
    const t = window.setTimeout(() => void onChanged(), 3000);
    return () => window.clearTimeout(t);
  }, [processing, onChanged, p.media]);

  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const mark = (state: string) =>
        setUploads((u) => [...u.filter((x) => x.name !== file.name), { name: file.name, state }]);
      if (!ACCEPT.split(',').includes(file.type)) {
        mark('نوع غير مدعوم');
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        mark('أكبر من 15 ميجابايت');
        continue;
      }
      try {
        mark('جارٍ الرفع…');
        const pre = await api<{ mediaId: string; uploadUrl: string; headers: Record<string, string> }>(
          '/admin/media/presign',
          {
            body: { propertyId: p.id, kind: 'photo', contentType: file.type, size: file.size },
          },
        );
        const { ['Content-Length']: _len, ...headers } = pre.headers;
        const put = await fetch(pre.uploadUrl, { method: 'PUT', body: file, headers });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        await api(`/admin/media/${pre.mediaId}/complete`, { body: {} });
        mark('قيد المعالجة');
      } catch (e) {
        mark(e instanceof ApiError ? e.message : 'تعذّر الرفع');
      }
    }
    await onChanged();
  }

  async function act(fn: () => Promise<unknown>, msg?: string) {
    try {
      await fn();
      if (msg) toast(msg);
      await onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر تنفيذ الإجراء');
    }
  }

  function move(i: number, dir: -1 | 1) {
    const order = photos.map((m) => m.id).concat(videos.map((v) => v.id));
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    void act(() => api(`/admin/properties/${p.id}/media/reorder`, { body: { ids: order } }));
  }

  return (
    <Section id="media" title="الصور والملفات">
      {editable ? (
        <label
          className={`dropzone${drag ? ' is-drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void uploadFiles(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
          />
          <Icon name="plus" />
          <span>
            اسحب الصور هنا أو <b>اختر من جهازك</b>
          </span>
          <small>حتى 40 صورة · 15 ميجابايت للصورة · تُحوّل تلقائياً إلى WebP وتُزال بيانات الموقع منها</small>
        </label>
      ) : null}
      {uploads.length ? (
        <ul className="upload-list">
          {uploads.map((u) => (
            <li key={u.name}>
              {u.name} — {u.state}
            </li>
          ))}
        </ul>
      ) : null}
      {photos.length ? (
        <div className="media-grid">
          {photos.map((m, i) => {
            const src = m.variants?.webpThumb ?? m.variants?.thumb;
            return (
              <figure key={m.id} className={`media-item media-item--${m.status}`}>
                {src ? (
                  <img src={src} alt={m.altAr ?? ''} loading="lazy" />
                ) : (
                  <div className="media-ph">{m.status === 'failed' ? 'ملف غير صالح' : 'قيد المعالجة…'}</div>
                )}
                {m.isCover ? <span className="cover-badge">الغلاف</span> : null}
                {m.kind === 'floor_plan' ? <span className="cover-badge">مخطط</span> : null}
                {editable ? (
                  <figcaption>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="تقديم"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="تأخير"
                      onClick={() => move(i, 1)}
                      disabled={i === photos.length - 1}
                    >
                      ›
                    </button>
                    {!m.isCover && m.status === 'ready' ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          void act(
                            () => api(`/admin/media/${m.id}`, { method: 'PATCH', body: { isCover: true } }),
                            'تم تعيين الغلاف',
                          )
                        }
                      >
                        غلاف
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        const alt = window.prompt('النص البديل للصورة (لمحركات البحث وقارئات الشاشة)', m.altAr ?? '');
                        if (alt !== null)
                          void act(
                            () => api(`/admin/media/${m.id}`, { method: 'PATCH', body: { altAr: alt.trim() || null } }),
                            'تم الحفظ',
                          );
                      }}
                    >
                      نص بديل
                    </button>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() =>
                        window.confirm('حذف الصورة؟') &&
                        void act(() => api(`/admin/media/${m.id}`, { method: 'DELETE' }), 'تم الحذف')
                      }
                    >
                      حذف
                    </button>
                  </figcaption>
                ) : null}
              </figure>
            );
          })}
        </div>
      ) : (
        <p className="hint">لا توجد صور بعد. يلزم صورة واحدة على الأقل للنشر.</p>
      )}
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="video">رابط فيديو (YouTube أو Vimeo)</label>
        <div className="copy-row">
          <input
            id="video"
            className="input"
            dir="ltr"
            placeholder="https://www.youtube.com/watch?v=…"
            value={video}
            onChange={(e) => setVideo(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!video.trim() || !editable}
            onClick={() =>
              void act(
                () => api('/admin/media/video', { body: { propertyId: p.id, url: video.trim() } }),
                'أُضيف الفيديو',
              ).then(() => setVideo(''))
            }
          >
            إضافة
          </button>
        </div>
        {videos.map((v) => (
          <div key={v.id} className="hint" dir="ltr" style={{ textAlign: 'right' }}>
            {v.externalUrl}{' '}
            {editable ? (
              <button
                type="button"
                className="link-btn danger"
                onClick={() => void act(() => api(`/admin/media/${v.id}`, { method: 'DELETE' }), 'تم الحذف')}
              >
                حذف
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}
