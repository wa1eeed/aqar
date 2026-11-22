import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { PERMISSION_GROUPS } from '../lib/permissions';
import type { RoleRow } from '../lib/types';
import { FormError } from './LoginPage';
import { useStaffData } from './StaffPage';

export function RolesPage() {
  const { roles, error, reload } = useStaffData();
  const [open, setOpen] = useState<RoleRow | 'new' | null>(null);
  const toast = useToast();

  return (
    <>
      <div className="adm-head">
        <div>
          <div className="crumb">
            <Link to="/staff">الفريق والصلاحيات</Link> / الأدوار
          </div>
          <h1>الأدوار والصلاحيات</h1>
          <p>أدوار النظام ثابتة، ويمكنك إنشاء أدوار مخصّصة بالصلاحيات التي تحتاجها.</p>
        </div>
        <div className="acts">
          <button className="btn btn--primary btn--sm" type="button" onClick={() => setOpen('new')}>
            <Icon name="plus" />
            دور مخصّص
          </button>
        </div>
      </div>
      <section className="panel2">
        {error ? (
          <div className="pb">
            <EmptyState title="تعذّر التحميل">{error}</EmptyState>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الدور</th>
                  <th>النوع</th>
                  <th>الصلاحيات</th>
                  <th>الأعضاء</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td className="t">{r.nameAr}</td>
                    <td>
                      {r.isSystem ? (
                        <span className="pill p-gray">نظام</span>
                      ) : (
                        <span className="pill p-gold">مخصّص</span>
                      )}
                    </td>
                    <td>{r.permissions.length}</td>
                    <td>{r.members}</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setOpen(r)}>
                        {r.isSystem ? 'عرض' : 'تعديل'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open ? (
        <RoleModal
          role={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onDone={async () => {
            setOpen(null);
            toast('تم حفظ الدور');
            await reload();
          }}
        />
      ) : null}
    </>
  );
}

function RoleModal({ role, onClose, onDone }: { role: RoleRow | null; onClose: () => void; onDone: () => void }) {
  const readOnly = !!role?.isSystem;
  const [name, setName] = useState(role?.nameAr ?? '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (p: string) =>
    setPerms((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { nameAr: name, permissions: [...perms] };
      if (role) await api(`/admin/roles/${role.id}`, { method: 'PATCH', body });
      else await api('/admin/roles', { body });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={role ? role.nameAr : 'دور مخصّص جديد'} onClose={onClose} wide>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
        <FormError error={error} />
        {readOnly ? <p className="hint">أدوار النظام محددة في سياسة الصلاحيات ولا يمكن تعديلها.</p> : null}
        {role?.key === 'agent' ? <p className="hint">المستشار يرى عقاراته وطلباته المسندة إليه فقط.</p> : null}
        <div className="field">
          <label htmlFor="role-name">اسم الدور</label>
          <input
            id="role-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
            required
          />
        </div>
        <div className="perm-grid">
          {PERMISSION_GROUPS.map((g) => (
            <fieldset className="perm-group" key={g.label} disabled={readOnly}>
              <b>{g.label}</b>
              {g.items.map(([key, label]) => (
                <label className="check" key={key}>
                  <input type="checkbox" checked={perms.has(key)} onChange={() => toggle(key)} />
                  {label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {!readOnly ? (
          <button className="btn btn--primary" type="submit" disabled={busy || name.trim().length < 2}>
            حفظ الدور
          </button>
        ) : null}
      </form>
    </Modal>
  );
}
