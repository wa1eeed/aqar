import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { FormError } from '../LoginPage';
import { SettingsLayout } from './SettingsLayout';

interface Colors {
  primary: string;
  primaryDark: string;
  accent: string;
  accentInk: string;
  background: string;
  surface: string;
  ink: string;
  muted: string;
}
interface Fonts {
  display: string;
  body: string;
}
interface Branding {
  name: string;
  fullName: string;
  tagline: string;
  logoLightKey: string | null;
  logoDarkKey: string | null;
  faviconSourceKey: string | null;
  socialShareImageKey: string | null;
  emailLogoKey: string | null;
  colors: Colors;
  fonts: Fonts;
  radius: 'sharp' | 'soft' | 'round';
}

const COLOR_FIELDS: Array<[keyof Colors, string]> = [
  ['primary', 'اللون الأساسي'],
  ['primaryDark', 'الأساسي الداكن'],
  ['accent', 'لون التمييز'],
  ['accentInk', 'حبر التمييز'],
  ['background', 'الخلفية'],
  ['surface', 'السطح'],
  ['ink', 'الحبر (النص)'],
  ['muted', 'الباهت'],
];

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };

/** settings.branding — هوية المكتب (الاسم، الألوان، الخطوط) التي تظهر على موقعه. */
export function BrandingSettingsPage() {
  const show = useToast();
  const [b, setB] = useState<Branding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Branding>('/admin/settings/branding')
      .then(setB)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الإعدادات'));
  }, []);

  const save = async () => {
    if (!b) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Branding>('/admin/settings/branding', { method: 'PATCH', body: b });
      setB(saved);
      show('تم حفظ الهوية والعلامة');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setB((p) => (p ? { ...p, [k]: v } : p));
  const setColor = (k: keyof Colors, v: string) => setB((p) => (p ? { ...p, colors: { ...p.colors, [k]: v } } : p));
  const setFont = (k: keyof Fonts, v: string) => setB((p) => (p ? { ...p, fonts: { ...p.fonts, [k]: v } } : p));

  return (
    <SettingsLayout
      subtitle="هوية مكتبك: الاسم، الشعار النصي، الألوان والخطوط التي تظهر على موقعك العام."
      actions={
        <button type="button" className="btn btn--primary btn--sm" disabled={!b || busy} onClick={() => void save()}>
          حفظ
        </button>
      }
    >
      <FormError error={error} />
      {!b ? (
        <div className="panel2">
          <div className="pb">جارٍ التحميل…</div>
        </div>
      ) : (
        <>
          <section className="panel2">
            <div className="ph">
              <h3>الاسم والشعار</h3>
            </div>
            <div className="pb">
              <div style={grid}>
                <div className="field">
                  <label>الاسم المختصر</label>
                  <input className="input" value={b.name} onChange={(e) => set('name', e.target.value)} />
                </div>
                <div className="field">
                  <label>الاسم الكامل</label>
                  <input className="input" value={b.fullName} onChange={(e) => set('fullName', e.target.value)} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>الشعار النصي (tagline)</label>
                  <input className="input" value={b.tagline} onChange={(e) => set('tagline', e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          <section className="panel2">
            <div className="ph">
              <h3>ألوان العلامة</h3>
            </div>
            <div className="pb">
              <div style={grid}>
                {COLOR_FIELDS.map(([k, label]) => (
                  <div className="field" key={k}>
                    <label>{label}</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={b.colors[k]}
                        onChange={(e) => setColor(k, e.target.value)}
                        style={{ width: 46, height: 40, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                        aria-label={label}
                      />
                      <input className="input" dir="ltr" value={b.colors[k]} onChange={(e) => setColor(k, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel2">
            <div className="ph">
              <h3>الخطوط والشكل</h3>
            </div>
            <div className="pb">
              <div style={grid}>
                <div className="field">
                  <label>خط العناوين</label>
                  <input className="input" value={b.fonts.display} onChange={(e) => setFont('display', e.target.value)} />
                </div>
                <div className="field">
                  <label>خط النص</label>
                  <input className="input" value={b.fonts.body} onChange={(e) => setFont('body', e.target.value)} />
                </div>
                <div className="field">
                  <label>زوايا الحواف</label>
                  <select
                    className="input"
                    value={b.radius}
                    onChange={(e) => set('radius', e.target.value as Branding['radius'])}
                  >
                    <option value="sharp">حادة</option>
                    <option value="soft">ناعمة</option>
                    <option value="round">دائرية</option>
                  </select>
                </div>
              </div>
              <p className="muted" style={{ fontSize: '.85rem', marginTop: 12 }}>
                رفع ملفات الشعار والأيقونة وصورة المشاركة (OG) يُدار عبر مكتبة الوسائط — يُضاف قريباً.
              </p>
            </div>
          </section>
        </>
      )}
    </SettingsLayout>
  );
}
