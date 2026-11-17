import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HealthPill } from '../components/HealthPill';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError, fieldMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { CallLog, FormField, IntegrationDetail } from '../lib/types';
import { FormError } from './LoginPage';

type Values = Record<string, unknown>;

function ConfigField({
  f,
  value,
  onChange,
  error,
}: {
  f: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const id = `cfg-${f.key}`;
  let control;
  if (f.type === 'boolean') {
    control = (
      <button
        type="button"
        id={id}
        className={`switch${value ? ' on' : ''}`}
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
      />
    );
  } else if (f.type === 'select') {
    control = (
      <select id={id} className="select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.labelAr}
          </option>
        ))}
      </select>
    );
  } else if (f.type === 'multiselect') {
    const list = Array.isArray(value) ? (value as string[]) : [];
    control = (
      <div className="chips" role="group" aria-labelledby={`${id}-l`}>
        {f.options?.map((o) => {
          const on = list.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              className={`chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(on ? list.filter((x) => x !== o.value) : [...list, o.value])}
            >
              {on ? '✓ ' : ''}
              {o.labelAr}
            </button>
          );
        })}
      </div>
    );
  } else if (f.type === 'textarea') {
    control = (
      <textarea
        id={id}
        className="textarea"
        dir="ltr"
        rows={4}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else {
    const isNum = f.type === 'number';
    control = (
      <input
        id={id}
        className="input"
        type={isNum ? 'number' : 'text'}
        dir={f.type === 'url' || isNum ? 'ltr' : undefined}
        placeholder={f.placeholder}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) =>
          onChange(isNum ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)
        }
      />
    );
  }
  return (
    <div className={`field${f.type === 'textarea' || f.type === 'multiselect' ? ' full' : ''}`}>
      <label htmlFor={id} id={`${id}-l`}>
        {f.labelAr}
      </label>
      {control}
      {f.helpAr ? <span className="hint">{f.helpAr}</span> : null}
      {error ? <span className="field-error">{fieldMessage(error)}</span> : null}
    </div>
  );
}

function SecretField({
  f,
  state,
  value,
  onChange,
}: {
  f: FormField;
  state: { set: boolean; hint: string | null };
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const editing = value !== undefined;
  const id = `sec-${f.key}`;
  return (
    <div className="field">
      <label htmlFor={id}>{f.labelAr}</label>
      <div className="secret">
        {editing ? (
          <input
            id={id}
            className="input"
            type={f.type === 'textarea' ? 'text' : 'password'}
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
        ) : (
          <input id={id} className="input" value={state.set ? (state.hint ?? '••••') : 'غير مضبوط'} disabled />
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(editing ? undefined : '')}>
          {editing ? 'إلغاء' : 'تغيير'}
        </button>
      </div>
      {f.helpAr ? <span className="hint">{f.helpAr}</span> : null}
    </div>
  );
}

export function IntegrationDetailPage() {
  const { key = '' } = useParams();
  const toast = useToast();
  const [data, setData] = useState<IntegrationDetail | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [config, setConfig] = useState<Values>({});
  const [secrets, setSecrets] = useState<Record<string, string | undefined>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; messageAr: string; latencyMs: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([
        api<IntegrationDetail>(`/admin/integrations/${key}`),
        api<{ items: CallLog[] }>(`/admin/integrations/${key}/logs?limit=20`),
      ]);
      setData(d);
      setConfig(d.config);
      setSecrets({});
      setLogs(l.items);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [key]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(extra: Record<string, unknown> = {}) {
    if (!data) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const changedSecrets = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== undefined));
      const body: Record<string, unknown> = { config, ...extra };
      if (Object.keys(changedSecrets).length) body.secrets = changedSecrets;
      const d = await api<IntegrationDetail>(`/admin/integrations/${key}`, { method: 'PUT', body });
      setData(d);
      setConfig(d.config);
      setSecrets({});
      toast('تم الحفظ');
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError('تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setBusy(true);
    try {
      setTest(await api(`/admin/integrations/${key}/test`, { method: 'POST', body: {} }));
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر الاختبار');
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(on: boolean) {
    try {
      await api(`/admin/integrations/${key}/${on ? 'enable' : 'disable'}`, { method: 'POST', body: {} });
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر التحديث');
    }
  }

  function switchEnv(env: 'sandbox' | 'live') {
    if (!data || env === data.environment) return;
    if (env === 'live' && !window.confirm('التبديل إلى البيئة المباشرة يعني عمليات حقيقية. هل أنت متأكد؟')) return;
    void save({ environment: env, ...(env === 'live' ? { confirmLive: true } : {}) });
  }

  if (loadError) {
    return (
      <section className="panel2">
        <div className="pb">
          <EmptyState title="تعذّر تحميل التكامل">{loadError}</EmptyState>
        </div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel2">
        <div className="pb">
          <EmptyState icon="clock" title="جارٍ التحميل…" />
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="adm-head">
        <div>
          <div className="crumb">
            <Link to="/integrations">التكاملات</Link> / {data.nameAr}
          </div>
          <h1>{data.nameAr}</h1>
          <p>{data.descriptionAr}</p>
        </div>
        <div className="acts">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void runTest()} disabled={busy}>
            <Icon name="check" />
            اختبار الاتصال
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void save()} disabled={busy}>
            <Icon name="check" />
            حفظ
          </button>
        </div>
      </div>

      <div className="g2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="panel2">
            <div className="ph">
              <h3>الحالة</h3>
            </div>
            <div className="pb">
              <div className="trow">
                <div>
                  <b>تفعيل التكامل</b>
                  <small>
                    {data.prepared
                      ? 'بانتظار بيانات الربط من الجهة المزوّدة'
                      : 'عند التعطيل تتوقف كل الاتصالات بهذه الخدمة'}
                  </small>
                </div>
                <button
                  type="button"
                  className={`switch${data.enabled ? ' on' : ''}`}
                  role="switch"
                  aria-checked={data.enabled}
                  aria-label="تفعيل التكامل"
                  disabled={data.prepared}
                  onClick={() => void setEnabled(!data.enabled)}
                />
              </div>
              {data.supportsSandbox ? (
                <div className="trow">
                  <div>
                    <b>البيئة</b>
                    <small>التبديل إلى «مباشر» يتطلب تأكيداً</small>
                  </div>
                  <div className="seg">
                    <button
                      type="button"
                      aria-pressed={data.environment === 'sandbox'}
                      onClick={() => switchEnv('sandbox')}
                    >
                      تجريبي
                    </button>
                    <button type="button" aria-pressed={data.environment === 'live'} onClick={() => switchEnv('live')}>
                      مباشر
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="trow">
                <div>
                  <b>الحالة الصحية</b>
                  <small>
                    آخر فحص {timeAgo(data.healthCheckedAt)}
                    {data.lastError ? ` · ${data.lastError}` : ''}
                  </small>
                </div>
                <HealthPill health={data.health} enabled={data.enabled} prepared={data.prepared} />
              </div>
              {test ? (
                <div className={`test-result ${test.ok ? 'ok' : 'bad'}`} role="status">
                  {test.messageAr}
                  {test.latencyMs ? ` · ${test.latencyMs}ms` : ''}
                </div>
              ) : null}
            </div>
          </section>

          {data.form.config.length ? (
            <section className="panel2">
              <div className="ph">
                <h3>الإعدادات</h3>
              </div>
              <div className="pb">
                <FormError error={error} />
                <div className="form2" style={{ marginTop: error ? 12 : 0 }}>
                  {data.form.config.map((f) => (
                    <ConfigField
                      key={f.key}
                      f={f}
                      value={config[f.key]}
                      error={fields[`config.${f.key}`] ?? fields[f.key]}
                      onChange={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
                    />
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {data.form.secrets.length || data.webhookUrl ? (
            <section className="panel2">
              <div className="ph">
                <h3>المفاتيح السرية</h3>
              </div>
              <div className="pb">
                <div className="form2">
                  {data.form.secrets.map((f) => (
                    <SecretField
                      key={f.key}
                      f={f}
                      state={data.secrets[f.key] ?? { set: false, hint: null }}
                      value={secrets[f.key]}
                      onChange={(v) => setSecrets((s) => ({ ...s, [f.key]: v }))}
                    />
                  ))}
                  {data.webhookUrl ? (
                    <div className="field full">
                      <label>رابط الـ Webhook (انسخه في لوحة المزوّد)</label>
                      <div className="copy-row">
                        <input className="input" value={data.webhookUrl} readOnly />
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() =>
                            void navigator.clipboard?.writeText(data.webhookUrl!).then(() => toast('تم النسخ'))
                          }
                        >
                          <Icon name="copy" />
                          نسخ
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <p className="hint" style={{ marginTop: 12 }}>
                  تغيير المفاتيح يتطلب إعادة إدخال كلمة المرور أو رمز التحقق، ويُسجَّل في سجل العمليات.
                </p>
              </div>
            </section>
          ) : null}
        </div>

        <section className="panel2">
          <div className="ph">
            <h3>آخر الاتصالات</h3>
          </div>
          {logs.length === 0 ? (
            <div className="pb">
              <EmptyState icon="list" title="لا توجد اتصالات بعد" />
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>العملية</th>
                    <th>HTTP</th>
                    <th>الزمن</th>
                    <th>النتيجة</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td dir="ltr" style={{ textAlign: 'right' }}>
                        {l.operation}
                      </td>
                      <td>
                        {l.httpStatus ? (
                          <span className={`pill ${l.success ? 'p-green' : 'p-red'}`}>{l.httpStatus}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="s">{l.latencyMs}ms</td>
                      <td className="s">{l.success ? 'نجاح' : 'فشل'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
