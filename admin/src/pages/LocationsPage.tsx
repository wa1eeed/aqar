import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import type { CityRow } from '../lib/types';
import { FormError } from './LoginPage';
import { SettingsLayout } from './settings/SettingsLayout';

type District = CityRow['districts'][number];
type Editing = { kind: 'city'; row: CityRow | null } | { kind: 'district'; cityId: string; row: District | null };

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/** docs/07 settings «المدن والأحياء» [settings.locations]: activate/order cities, districts with coordinates. */
export function LocationsPage() {
  const toast = useToast();
  const [cities, setCities] = useState<CityRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: CityRow[] }>('/admin/cities');
      setCities(r.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (path: string, body: Record<string, unknown>, msg: string) => {
    try {
      await api(path, { method: 'PATCH', body });
      toast(msg);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <SettingsLayout
      subtitle="المدن والأحياء — المدن المفعّلة تظهر في البحث وفي نموذج العقار، والإحداثيات تُستخدم لتوسيط الخريطة."
      actions={
        <button
          className="btn btn--primary btn--sm"
          type="button"
          onClick={() => setEditing({ kind: 'city', row: null })}
        >
          إضافة مدينة
        </button>
      }
    >
      <FormError error={error} />
      {!cities ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : !cities.length ? (
        <EmptyState title="لا توجد مدن" />
      ) : (
        <div className="panel2">
          <table className="tbl">
            <thead>
              <tr>
                <th>المدينة</th>
                <th>الترتيب</th>
                <th>الأحياء</th>
                <th>الحالة</th>
                <th aria-label="إجراءات" />
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <CityRows
                  key={c.id}
                  c={c}
                  open={open === c.id}
                  onToggle={() => setOpen(open === c.id ? null : c.id)}
                  onEdit={(e) => setEditing(e)}
                  onPatch={patch}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <LocationModal
          editing={editing}
          onClose={() => setEditing(null)}
          onDone={async (msg) => {
            setEditing(null);
            toast(msg);
            await load();
          }}
        />
      ) : null}
    </SettingsLayout>
  );
}

function CityRows({
  c,
  open,
  onToggle,
  onEdit,
  onPatch,
}: {
  c: CityRow;
  open: boolean;
  onToggle: () => void;
  onEdit: (e: Editing) => void;
  onPatch: (path: string, body: Record<string, unknown>, msg: string) => Promise<void>;
}) {
  return (
    <>
      <tr>
        <td>
          <b>{c.nameAr}</b>
          <div className="s" dir="ltr" style={{ textAlign: 'right' }}>
            {c.id}
          </div>
        </td>
        <td>{c.sort}</td>
        <td>
          <button type="button" className="link-btn" aria-expanded={open} onClick={onToggle}>
            {c.districts.length} حي {open ? '▴' : '▾'}
          </button>
        </td>
        <td>
          <span className={`pill ${c.isActive ? 'p-green' : 'p-gray'}`}>{c.isActive ? 'مفعّلة' : 'معطّلة'}</span>
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <button type="button" className="link-btn" onClick={() => onEdit({ kind: 'city', row: c })}>
            تعديل
          </button>{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              void onPatch(
                `/admin/cities/${c.id}`,
                { isActive: !c.isActive },
                c.isActive ? 'تم تعطيل المدينة' : 'تم تفعيل المدينة',
              )
            }
          >
            {c.isActive ? 'تعطيل' : 'تفعيل'}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5} style={{ background: '#fbf9f5' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {c.districts.map((d) => (
                <span
                  key={d.id}
                  className={`chip${d.isActive ? '' : ' is-off'}`}
                  style={{ opacity: d.isActive ? 1 : 0.55 }}
                >
                  {d.nameAr}
                  {d.lat === null ? <small className="muted"> · بلا إحداثيات</small> : null}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onEdit({ kind: 'district', cityId: c.id, row: d })}
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      void onPatch(
                        `/admin/districts/${d.id}`,
                        { isActive: !d.isActive },
                        d.isActive ? 'تم تعطيل الحي' : 'تم تفعيل الحي',
                      )
                    }
                  >
                    {d.isActive ? 'تعطيل' : 'تفعيل'}
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onEdit({ kind: 'district', cityId: c.id, row: null })}
              >
                إضافة حي
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function LocationModal({
  editing,
  onClose,
  onDone,
}: {
  editing: Editing;
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
}) {
  const row = editing.row;
  const isCity = editing.kind === 'city';
  const [id, setId] = useState(isCity && row ? (row as CityRow).id : '');
  const [nameAr, setName] = useState(row?.nameAr ?? '');
  const [lat, setLat] = useState(row?.lat === null || row?.lat === undefined ? '' : String(row.lat));
  const [lng, setLng] = useState(row?.lng === null || row?.lng === undefined ? '' : String(row.lng));
  const [sort, setSort] = useState(isCity && row ? String((row as CityRow).sort) : '0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const coords = { lat: num(lat), lng: num(lng) };
      if (isCity) {
        if (coords.lat === null || coords.lng === null)
          throw new ApiError(400, 'VALIDATION_FAILED', 'إحداثيات المدينة مطلوبة');
        const body = { nameAr: nameAr.trim(), lat: coords.lat, lng: coords.lng, sort: Number(sort) || 0 };
        if (row) await api(`/admin/cities/${(row as CityRow).id}`, { method: 'PATCH', body });
        else await api('/admin/cities', { body: { id: id.trim(), ...body } });
      } else {
        const body = { nameAr: nameAr.trim(), ...coords };
        if (row) await api(`/admin/districts/${row.id}`, { method: 'PATCH', body });
        else await api('/admin/districts', { body: { cityId: editing.cityId, ...body } });
      }
      await onDone('تم الحفظ');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${row ? 'تعديل' : 'إضافة'} ${isCity ? 'مدينة' : 'حي'}`} onClose={onClose}>
      <form
        className="form2"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="full">
          <FormError error={error} />
        </div>
        {isCity && !row ? (
          <div className="field full">
            <label htmlFor="loc-id">المعرّف (بالإنجليزية)</label>
            <input
              id="loc-id"
              className="input"
              dir="ltr"
              required
              pattern="[a-z_]{2,40}"
              placeholder="riyadh"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </div>
        ) : null}
        <div className="field full">
          <label htmlFor="loc-name">الاسم</label>
          <input
            id="loc-name"
            className="input"
            required
            minLength={2}
            maxLength={60}
            value={nameAr}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-lat">خط العرض</label>
          <input
            id="loc-lat"
            className="input"
            dir="ltr"
            inputMode="decimal"
            required={isCity}
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-lng">خط الطول</label>
          <input
            id="loc-lng"
            className="input"
            dir="ltr"
            inputMode="decimal"
            required={isCity}
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
        {isCity ? (
          <div className="field">
            <label htmlFor="loc-sort">الترتيب</label>
            <input
              id="loc-sort"
              className="input"
              type="number"
              min={0}
              max={999}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            />
          </div>
        ) : null}
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
