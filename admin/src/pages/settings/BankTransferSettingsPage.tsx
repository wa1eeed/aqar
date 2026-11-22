import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import type { BankAccountRow } from '../../lib/types';
import { FormError } from '../LoginPage';
import { SettingsLayout, Switch } from './SettingsLayout';

interface BankSettings {
  bankAccountIds: string[];
  instructionsHtml: string;
  nextSteps: string[];
  referenceHintAr: string;
  requireReceipt: boolean;
  acceptedFileTypes: string[];
  maxFileMb: number;
}
const FILE_TYPES: Array<[string, string]> = [
  ['application/pdf', 'PDF'],
  ['image/jpeg', 'JPG'],
  ['image/png', 'PNG'],
];
/** Saudi banks for the account form (docs/07 §10 bank select). */
const BANKS = [
  'مصرف الراجحي',
  'البنك الأهلي السعودي',
  'بنك الرياض',
  'البنك السعودي الفرنسي',
  'البنك السعودي البريطاني (ساب)',
  'البنك العربي الوطني',
  'بنك البلاد',
  'بنك الجزيرة',
  'مصرف الإنماء',
  'بنك الاستثمار السعودي',
  'بنك الخليج الدولي',
];
const stripTags = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** docs/04 §2 settings.bank_transfer + bank accounts — design/screenshots/a-settings-bank.png. */
export function BankTransferSettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<BankSettings | null>(null);
  const [accounts, setAccounts] = useState<BankAccountRow[] | null>(null);
  const [editing, setEditing] = useState<BankAccountRow | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAccounts = useCallback(async () => {
    setAccounts((await api<{ items: BankAccountRow[] }>('/admin/bank-accounts')).items);
  }, []);
  useEffect(() => {
    void Promise.all([api<BankSettings>('/admin/settings/bank_transfer').then(setS), loadAccounts()]).catch((e) =>
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل'),
    );
  }, [loadAccounts]);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      setS(
        await api<BankSettings>('/admin/settings/bank_transfer', {
          method: 'PUT',
          body: { ...s, nextSteps: s.nextSteps.map((x) => x.trim()).filter(Boolean) },
        }),
      );
      toast('تم حفظ الإعدادات');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = async (a: BankAccountRow) => {
    try {
      await api(`/admin/bank-accounts/${a.id}`, { method: 'PATCH', body: { isActive: !a.isActive } });
      await loadAccounts();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    }
  };
  const active = (accounts ?? []).filter(
    (a) => a.isActive && (!s?.bankAccountIds.length || s.bankAccountIds.includes(a.id)),
  );

  return (
    <SettingsLayout
      subtitle="التحويل البنكي — الحسابات والتعليمات التي تظهر للعميل"
      actions={
        <button type="button" className="btn btn--primary btn--sm" disabled={!s || busy} onClick={() => void save()}>
          <Icon name="check" />
          حفظ
        </button>
      }
    >
      <FormError error={error} />
      {!s || !accounts ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : (
        <div className="g2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <section className="panel2">
              <div className="ph">
                <h3>الحسابات البنكية</h3>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing('new')}>
                  <Icon name="plus" />
                  إضافة حساب
                </button>
              </div>
              {accounts.length ? (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>المصرف</th>
                        <th>اسم المستفيد</th>
                        <th>الآيبان</th>
                        <th>الحالة</th>
                        <th aria-label="تعديل" />
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => (
                        <tr key={a.id}>
                          <td className="t">{a.bankName}</td>
                          <td>{a.beneficiaryName}</td>
                          <td dir="ltr" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {a.ibanFormatted}
                          </td>
                          <td>
                            <Switch
                              on={a.isActive}
                              label={`تفعيل ${a.bankName}`}
                              onChange={() => void toggleActive(a)}
                            />
                          </td>
                          <td>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(a)}>
                              تعديل
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted" style={{ padding: 18 }}>
                  لا توجد حسابات. أضف حساباً ليظهر خيار التحويل البنكي للعملاء.
                </p>
              )}
            </section>
            <section className="panel2">
              <div className="ph">
                <h3>التعليمات وما بعد الدفع</h3>
              </div>
              <div className="pb" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field">
                  <label htmlFor="bt-ins">تعليمات الدفع</label>
                  <textarea
                    id="bt-ins"
                    className="textarea"
                    style={{ minHeight: 100 }}
                    value={s.instructionsHtml}
                    onChange={(e) => setS({ ...s, instructionsHtml: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bt-ref">تلميح المرجع</label>
                  <input
                    id="bt-ref"
                    className="input"
                    maxLength={200}
                    value={s.referenceHintAr}
                    onChange={(e) => setS({ ...s, referenceHintAr: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>ماذا يحدث بعد التحويل؟ (بالترتيب)</label>
                  {s.nextSteps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
                      <span className="av">{i + 1}</span>
                      <input
                        className="input"
                        aria-label={`الخطوة ${i + 1}`}
                        maxLength={200}
                        value={step}
                        onChange={(e) =>
                          setS({ ...s, nextSteps: s.nextSteps.map((x, j) => (j === i ? e.target.value : x)) })
                        }
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="حذف الخطوة"
                        onClick={() => setS({ ...s, nextSteps: s.nextSteps.filter((_, j) => j !== i) })}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  ))}
                  {s.nextSteps.length < 10 ? (
                    <button
                      type="button"
                      className="link-btn"
                      style={{ marginTop: 8, alignSelf: 'flex-start' }}
                      onClick={() => setS({ ...s, nextSteps: [...s.nextSteps, ''] })}
                    >
                      + إضافة خطوة
                    </button>
                  ) : null}
                </div>
                <div className="form2">
                  <div className="field">
                    <label>أنواع الإيصال المقبولة</label>
                    <div className="chips">
                      {FILE_TYPES.map(([t, l]) => (
                        <button
                          key={t}
                          type="button"
                          className={`chip${s.acceptedFileTypes.includes(t) ? ' is-on' : ''}`}
                          aria-pressed={s.acceptedFileTypes.includes(t)}
                          onClick={() => {
                            const next = s.acceptedFileTypes.includes(t)
                              ? s.acceptedFileTypes.filter((x) => x !== t)
                              : [...s.acceptedFileTypes, t];
                            if (next.length) setS({ ...s, acceptedFileTypes: next });
                          }}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="bt-max">الحد الأقصى للحجم (ميجابايت)</label>
                    <input
                      id="bt-max"
                      className="input"
                      type="number"
                      min={1}
                      max={10}
                      value={s.maxFileMb}
                      onChange={(e) =>
                        setS({ ...s, maxFileMb: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })
                      }
                    />
                  </div>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.requireReceipt}
                    onChange={(e) => setS({ ...s, requireReceipt: e.target.checked })}
                  />
                  رفع الإيصال إلزامي
                </label>
              </div>
            </section>
          </div>
          <section className="panel2" style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
            <div className="ph">
              <h3>معاينة ما يراه العميل</h3>
            </div>
            <div className="pb" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--green-50)', borderRadius: 14, padding: 16 }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  المبلغ المستحق
                </span>
                <b style={{ display: 'block', fontSize: 26 }}>75,000 ر.س</b>
                <span className="muted" style={{ fontSize: 13 }}>
                  المرجع: <b dir="ltr">B-2026-000040</b>
                </span>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {stripTags(s.instructionsHtml)}
              </p>
              {active.map((a) => (
                <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
                  <b>{a.bankName}</b>
                  <div className="muted" style={{ fontSize: 13 }}>
                    اسم المستفيد: {a.beneficiaryName}
                  </div>
                  <b dir="ltr" style={{ display: 'block', textAlign: 'right', fontSize: 13 }}>
                    {a.ibanFormatted}
                  </b>
                </div>
              ))}
              <div className="dropzone" style={{ padding: 14 }}>
                ارفع إيصال التحويل
              </div>
            </div>
          </section>
        </div>
      )}
      {editing ? (
        <AccountModal
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            toast('تم حفظ الحساب');
            await loadAccounts();
          }}
        />
      ) : null}
    </SettingsLayout>
  );
}

function AccountModal({
  account,
  onClose,
  onDone,
}: {
  account: BankAccountRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [f, setF] = useState({
    bankName: account?.bankName ?? BANKS[0]!,
    beneficiaryName: account?.beneficiaryName ?? '',
    iban: account?.ibanFormatted ?? '',
    accountNumber: account?.accountNumber ?? '',
    swift: account?.swift ?? '',
    sort: String(account?.sort ?? 0),
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const fieldErr = (k: string) =>
    fields[k] ? (
      <span className="field-error">
        {{
          invalid_iban: 'رقم الآيبان غير صحيح (SA + 22 رقماً)',
          invalid_swift: 'رمز SWIFT غير صحيح',
          invalid_account_number: 'رقم الحساب غير صحيح',
        }[fields[k]!] ?? 'قيمة غير صحيحة'}
      </span>
    ) : null;
  return (
    <Modal title={account ? 'تعديل حساب بنكي' : 'إضافة حساب بنكي'} onClose={onClose}>
      <form
        className="form2"
        style={{ marginTop: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setFields({});
          const body = {
            bankName: f.bankName,
            beneficiaryName: f.beneficiaryName.trim(),
            iban: f.iban,
            accountNumber: f.accountNumber.trim(),
            swift: f.swift.trim().toUpperCase(),
            sort: Number(f.sort) || 0,
          };
          try {
            if (account) await api(`/admin/bank-accounts/${account.id}`, { method: 'PATCH', body });
            else await api('/admin/bank-accounts', { body });
            await onDone();
          } catch (e2) {
            if (e2 instanceof ApiError) {
              setError(e2.message);
              setFields(e2.fields);
            } else setError('تعذّر الحفظ');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="full">
          <FormError error={error} />
        </div>
        <div className="field">
          <label htmlFor="ba-bank">المصرف</label>
          <select id="ba-bank" className="select" value={f.bankName} onChange={(e) => set('bankName', e.target.value)}>
            {[...new Set([f.bankName, ...BANKS])].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ba-ben">اسم المستفيد *</label>
          <input
            id="ba-ben"
            className="input"
            required
            minLength={2}
            maxLength={120}
            value={f.beneficiaryName}
            onChange={(e) => set('beneficiaryName', e.target.value)}
          />
        </div>
        <div className="field full">
          <label htmlFor="ba-iban">الآيبان *</label>
          <input
            id="ba-iban"
            className="input"
            dir="ltr"
            required
            placeholder="SA00 0000 0000 0000 0000 0000"
            value={f.iban}
            onChange={(e) => set('iban', e.target.value.toUpperCase())}
          />
          {fieldErr('iban')}
        </div>
        <div className="field">
          <label htmlFor="ba-acc">رقم الحساب</label>
          <input
            id="ba-acc"
            className="input"
            dir="ltr"
            value={f.accountNumber}
            onChange={(e) => set('accountNumber', e.target.value)}
          />
          {fieldErr('accountNumber')}
        </div>
        <div className="field">
          <label htmlFor="ba-swift">SWIFT</label>
          <input
            id="ba-swift"
            className="input"
            dir="ltr"
            value={f.swift}
            onChange={(e) => set('swift', e.target.value)}
          />
          {fieldErr('swift')}
        </div>
        <div className="field">
          <label htmlFor="ba-sort">الترتيب</label>
          <input
            id="ba-sort"
            className="input"
            type="number"
            min={0}
            max={999}
            value={f.sort}
            onChange={(e) => set('sort', e.target.value)}
          />
        </div>
        <div className="full" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}
