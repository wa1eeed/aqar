import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError, fieldMessage } from '../lib/api';
import type { RoleRow, StaffMember } from '../lib/types';
import { FormError } from './LoginPage';

const ROLE_PILL: Record<string, string> = {
  owner: 'p-gold',
  admin: 'p-gold',
  sales_manager: 'p-gold',
  agent: 'p-gold',
  finance: 'p-gold',
  content_editor: 'p-gold',
};

export function useStaffData() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { can } = useSession();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, r] = await Promise.all([
        api<{ items: StaffMember[] }>('/admin/staff'),
        can('roles.manage') ? api<{ items: RoleRow[] }>('/admin/roles') : Promise.resolve({ items: [] as RoleRow[] }),
      ]);
      setStaff(s.items);
      setRoles(r.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تحميل البيانات');
    }
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);
  return { staff, roles, error, reload: load };
}

export function StaffPage() {
  const { me, can } = useSession();
  const toast = useToast();
  const { staff, roles, error, reload } = useStaffData();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  async function toggleActive(m: StaffMember) {
    try {
      await api(`/admin/staff/${m.id}`, { method: 'PATCH', body: { isActive: !m.isActive } });
      toast(m.isActive ? 'تم تعطيل العضو وإنهاء جلساته' : 'تم تفعيل العضو');
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر التحديث');
    }
  }

  const count = staff?.length ?? 0;
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الفريق والصلاحيات</h1>
          <p>{count} أعضاء · المصادقة الثنائية إلزامية للمالك والمدراء والمالية</p>
        </div>
        <div className="acts">
          {can('roles.manage') ? (
            <Link className="btn btn--ghost btn--sm" to="/staff/roles">
              <Icon name="shield" />
              الأدوار والصلاحيات
            </Link>
          ) : null}
          <button
            className="btn btn--primary btn--sm"
            type="button"
            onClick={() => setInviting(true)}
            disabled={!roles.length}
          >
            <Icon name="plus" />
            دعوة عضو
          </button>
        </div>
      </div>

      <section className="panel2">
        {error ? (
          <div className="pb">
            <EmptyState icon="info" title="تعذّر تحميل الفريق">
              {error}{' '}
              <button className="link-btn" type="button" onClick={() => void reload()}>
                إعادة المحاولة
              </button>
            </EmptyState>
          </div>
        ) : !staff ? (
          <div className="pb">
            <EmptyState icon="clock" title="جارٍ التحميل…" />
          </div>
        ) : staff.length === 0 ? (
          <div className="pb">
            <EmptyState icon="user" title="لا يوجد أعضاء بعد" />
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>العضو</th>
                  <th>البريد</th>
                  <th>الدور</th>
                  <th>رخصة فال</th>
                  <th>التحقق الثنائي</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink)' }}
                        onClick={() => setEditing(m)}
                      >
                        <span className="avatar" style={{ width: 30, height: 30, fontSize: 13 }} aria-hidden="true">
                          {m.name.slice(0, 1)}
                        </span>
                        <span className="t">{m.name}</span>
                      </button>
                    </td>
                    <td dir="ltr" style={{ textAlign: 'right' }}>
                      {m.email}
                    </td>
                    <td>
                      <span className={`pill ${ROLE_PILL[m.role.key] ?? 'p-gray'}`}>{m.role.nameAr}</span>
                    </td>
                    <td>{m.falLicense || '—'}</td>
                    <td>
                      {m.invitePending ? (
                        <span className="pill p-blue">دعوة معلّقة</span>
                      ) : m.totpEnabled ? (
                        <span className="pill p-green">✓ مفعّل</span>
                      ) : (
                        <span className="pill p-gray">غير مفعّل</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`switch${m.isActive ? ' on' : ''}`}
                        role="switch"
                        aria-checked={m.isActive}
                        aria-label={m.isActive ? `تعطيل ${m.name}` : `تفعيل ${m.name}`}
                        disabled={m.id === me?.staff.id}
                        onClick={() => void toggleActive(m)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inviting ? (
        <InviteModal
          roles={roles}
          onClose={() => setInviting(false)}
          onDone={async () => {
            setInviting(false);
            toast('أُرسلت الدعوة بالبريد الإلكتروني');
            await reload();
          }}
        />
      ) : null}
      {editing ? (
        <EditModal
          member={editing}
          roles={roles}
          self={editing.id === me?.staff.id}
          onClose={() => setEditing(null)}
          onDone={async (msg) => {
            setEditing(null);
            toast(msg);
            await reload();
          }}
        />
      ) : null}
    </>
  );
}

function useFormState() {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError('حدث خطأ غير متوقع');
    } finally {
      setBusy(false);
    }
  }
  return { error, fields, busy, run };
}

function RoleSelect({ roles, value, onChange }: { roles: RoleRow[]; value: string; onChange: (v: string) => void }) {
  const { me } = useSession();
  return (
    <select id="role" className="select" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">اختر الدور</option>
      {roles
        .filter((r) => r.key !== 'owner' || me?.staff.role.key === 'owner')
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.nameAr}
          </option>
        ))}
    </select>
  );
}

function InviteModal({ roles, onClose, onDone }: { roles: RoleRow[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', roleId: '', phone: '', title: '', falLicense: '' });
  const { error, fields, busy, run } = useFormState();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const phone = form.phone.trim() ? `+966${form.phone.trim().replace(/^0/, '')}` : undefined;
      await api('/admin/staff', {
        body: {
          name: form.name,
          email: form.email,
          roleId: form.roleId,
          ...(phone ? { phone } : {}),
          ...(form.title ? { title: form.title } : {}),
          ...(form.falLicense ? { falLicense: form.falLicense } : {}),
        },
      });
      onDone();
    });
  }

  return (
    <Modal title="دعوة عضو جديد" onClose={onClose}>
      <form onSubmit={submit} className="form2" style={{ marginTop: 16 }}>
        <div className="full">
          <FormError error={error} />
        </div>
        <div className="field">
          <label htmlFor="name">الاسم</label>
          <input id="name" className="input" required value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input
            id="email"
            className="input"
            type="email"
            dir="ltr"
            required
            value={form.email}
            onChange={set('email')}
          />
          {fields.email ? <span className="field-error">{fieldMessage(fields.email)}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="role">الدور</label>
          <RoleSelect roles={roles} value={form.roleId} onChange={(v) => setForm({ ...form, roleId: v })} />
        </div>
        <div className="field">
          <label htmlFor="phone">الجوال (اختياري)</label>
          <input
            id="phone"
            className="input"
            dir="ltr"
            inputMode="tel"
            placeholder="05XXXXXXXX"
            value={form.phone}
            onChange={set('phone')}
          />
          {fields.phone ? <span className="field-error">{fieldMessage(fields.phone)}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="title">المسمى الوظيفي (اختياري)</label>
          <input id="title" className="input" value={form.title} onChange={set('title')} />
        </div>
        <div className="field">
          <label htmlFor="fal">رخصة فال الشخصية (اختياري)</label>
          <input
            id="fal"
            className="input"
            dir="ltr"
            inputMode="numeric"
            value={form.falLicense}
            onChange={set('falLicense')}
          />
          {fields.falLicense ? <span className="field-error">{fieldMessage(fields.falLicense)}</span> : null}
        </div>
        <div className="full">
          <p className="hint">يصل العضو بريد برابط لإنشاء كلمة المرور، صالح لمدة 72 ساعة.</p>
        </div>
        <div className="full">
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            إرسال الدعوة
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({
  member,
  roles,
  self,
  onClose,
  onDone,
}: {
  member: StaffMember;
  roles: RoleRow[];
  self: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: member.name,
    roleId: member.role.id,
    title: member.title ?? '',
    falLicense: member.falLicense ?? '',
    showOnWebsite: member.showOnWebsite,
  });
  const { error, fields, busy, run } = useFormState();

  function save(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api(`/admin/staff/${member.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          title: form.title,
          falLicense: form.falLicense,
          showOnWebsite: form.showOnWebsite,
          ...(!self && form.roleId !== member.role.id ? { roleId: form.roleId } : {}),
        },
      });
      onDone('تم حفظ التعديلات');
    });
  }

  return (
    <Modal title={member.name} onClose={onClose}>
      <form onSubmit={save} className="form2" style={{ marginTop: 16 }}>
        <div className="full">
          <FormError error={error} />
        </div>
        <div className="field">
          <label htmlFor="e-name">الاسم</label>
          <input
            id="e-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="role">الدور</label>
          {self ? (
            <input className="input" value={member.role.nameAr} disabled />
          ) : (
            <RoleSelect roles={roles} value={form.roleId} onChange={(v) => setForm({ ...form, roleId: v })} />
          )}
        </div>
        <div className="field">
          <label htmlFor="e-title">المسمى الوظيفي</label>
          <input
            id="e-title"
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="e-fal">رخصة فال</label>
          <input
            id="e-fal"
            className="input"
            dir="ltr"
            value={form.falLicense}
            onChange={(e) => setForm({ ...form, falLicense: e.target.value })}
          />
          {fields.falLicense ? <span className="field-error">{fieldMessage(fields.falLicense)}</span> : null}
        </div>
        <label className="check full">
          <input
            type="checkbox"
            checked={form.showOnWebsite}
            onChange={(e) => setForm({ ...form, showOnWebsite: e.target.checked })}
          />
          يظهر كمستشار في صفحات العقارات
        </label>
        <div className="full" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            حفظ
          </button>
          {!self && member.totpEnabled ? (
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/admin/staff/${member.id}/reset-2fa`, { method: 'POST', body: {} });
                  onDone('أُعيد ضبط التحقق بخطوتين، سيُطلب منه إعداده من جديد');
                })
              }
            >
              إعادة ضبط التحقق بخطوتين
            </button>
          ) : null}
          {member.invitePending || (!member.lastLoginAt && !self) ? (
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/admin/staff/${member.id}/resend-invite`, { method: 'POST', body: {} });
                  onDone('أُعيد إرسال الدعوة');
                })
              }
            >
              إعادة إرسال الدعوة
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
