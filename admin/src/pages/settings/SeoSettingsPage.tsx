import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { FormError } from '../LoginPage';
import { SettingsLayout, Switch } from './SettingsLayout';

interface Seo {
  siteName: string;
  titleTemplate: string;
  defaultDescription: string;
  canonicalDomain: string;
  defaultOgImageKey: string | null;
  xHandle: string;
  language: string;
  indexable: boolean;
  verification: { google: string; bing: string; yandex: string };
  analytics: { ga4: string; gtm: string; metaPixel: string; snapPixel: string; tiktokPixel: string };
  templates: { propertyTitle: string; propertyDescription: string; listingTitle: string };
  summaryTemplate: string;
  crawlerPolicy: Record<string, boolean>;
  llmsTxt: string;
  feedEnabled: boolean;
  metaKeywordsTag: boolean;
}

const BOTS: Array<[string, string]> = [
  ['GPTBot', 'OpenAI — GPTBot'],
  ['OAI-SearchBot', 'OpenAI — بحث'],
  ['ChatGPT-User', 'ChatGPT'],
  ['ClaudeBot', 'Claude'],
  ['PerplexityBot', 'Perplexity'],
  ['Google-Extended', 'Google (ذكاء اصطناعي)'],
  ['Applebot-Extended', 'Apple (ذكاء اصطناعي)'],
  ['Amazonbot', 'Amazon'],
  ['CCBot', 'Common Crawl'],
  ['Bytespider', 'Bytespider'],
];

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
const col2: React.CSSProperties = { gridColumn: '1 / -1' };

/** seo.manage — تحسين ظهور موقع المكتب في محركات البحث ومحركات الذكاء الاصطناعي. */
export function SeoSettingsPage() {
  const show = useToast();
  const [s, setS] = useState<Seo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Seo>('/admin/settings/seo')
      .then(setS)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الإعدادات'));
  }, []);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Seo>('/admin/settings/seo', { method: 'PATCH', body: s });
      setS(saved);
      show('تم حفظ إعدادات الظهور');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof Seo>(k: K, v: Seo[K]) => setS((p) => (p ? { ...p, [k]: v } : p));
  const setVer = (k: keyof Seo['verification'], v: string) =>
    setS((p) => (p ? { ...p, verification: { ...p.verification, [k]: v } } : p));
  const setAn = (k: keyof Seo['analytics'], v: string) =>
    setS((p) => (p ? { ...p, analytics: { ...p.analytics, [k]: v } } : p));
  const setTpl = (k: keyof Seo['templates'], v: string) =>
    setS((p) => (p ? { ...p, templates: { ...p.templates, [k]: v } } : p));
  const setBot = (bot: string, v: boolean) =>
    setS((p) => (p ? { ...p, crawlerPolicy: { ...p.crawlerPolicy, [bot]: v } } : p));

  return (
    <SettingsLayout
      subtitle="تحسين ظهور موقعك في محركات البحث (SEO) ومحركات الإجابة والذكاء الاصطناعي (AEO/GEO)."
      actions={
        <button type="button" className="btn btn--primary btn--sm" disabled={!s || busy} onClick={() => void save()}>
          حفظ
        </button>
      }
    >
      <FormError error={error} />
      {!s ? (
        <div className="panel2">
          <div className="pb">جارٍ التحميل…</div>
        </div>
      ) : (
        <>
          <section className="panel2">
            <div className="ph">
              <h3>الأساسيات</h3>
            </div>
            <div className="pb">
              <div style={grid}>
                <div className="field">
                  <label>اسم الموقع</label>
                  <input className="input" value={s.siteName} onChange={(e) => set('siteName', e.target.value)} />
                </div>
                <div className="field">
                  <label>قالب العنوان</label>
                  <input className="input" dir="ltr" value={s.titleTemplate} onChange={(e) => set('titleTemplate', e.target.value)} />
                </div>
                <div className="field" style={col2}>
                  <label>الوصف الافتراضي (meta description)</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={s.defaultDescription}
                    onChange={(e) => set('defaultDescription', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>النطاق الأساسي (canonical)</label>
                  <input className="input" dir="ltr" value={s.canonicalDomain} onChange={(e) => set('canonicalDomain', e.target.value)} />
                </div>
                <div className="field">
                  <label>اللغة</label>
                  <input className="input" dir="ltr" value={s.language} onChange={(e) => set('language', e.target.value)} />
                </div>
                <div className="field">
                  <label>حساب X / تويتر</label>
                  <input className="input" dir="ltr" value={s.xHandle} onChange={(e) => set('xHandle', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Switch on={s.indexable} onChange={(v) => set('indexable', v)} label="السماح بالفهرسة" />
                  السماح بفهرسة الموقع
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Switch on={s.metaKeywordsTag} onChange={(v) => set('metaKeywordsTag', v)} label="وسم الكلمات المفتاحية" />
                  إظهار وسم الكلمات المفتاحية
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Switch on={s.feedEnabled} onChange={(v) => set('feedEnabled', v)} label="تغذية RSS" />
                  تفعيل خلاصة العقارات (feed)
                </label>
              </div>
            </div>
          </section>

          <section className="panel2">
            <div className="ph">
              <h3>قوالب عناوين العقارات</h3>
            </div>
            <div className="pb">
              <div style={grid}>
                <div className="field" style={col2}>
                  <label>عنوان صفحة العقار</label>
                  <input className="input" dir="ltr" value={s.templates.propertyTitle} onChange={(e) => setTpl('propertyTitle', e.target.value)} />
                </div>
                <div className="field" style={col2}>
                  <label>وصف صفحة العقار</label>
                  <input className="input" dir="ltr" value={s.templates.propertyDescription} onChange={(e) => setTpl('propertyDescription', e.target.value)} />
                </div>
                <div className="field" style={col2}>
                  <label>عنوان صفحة القوائم</label>
                  <input className="input" dir="ltr" value={s.templates.listingTitle} onChange={(e) => setTpl('listingTitle', e.target.value)} />
                </div>
              </div>
              <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
                المتغيرات المتاحة: {'{type} {offer} {district} {city} {area} {price} {brand}'}
              </p>
            </div>
          </section>

          <section className="panel2">
            <div className="ph">
              <h3>التحقق والتحليلات</h3>
            </div>
            <div className="pb">
              <div style={grid}>
                <div className="field">
                  <label>Google Search Console</label>
                  <input className="input" dir="ltr" value={s.verification.google} onChange={(e) => setVer('google', e.target.value)} />
                </div>
                <div className="field">
                  <label>Bing Webmaster</label>
                  <input className="input" dir="ltr" value={s.verification.bing} onChange={(e) => setVer('bing', e.target.value)} />
                </div>
                <div className="field">
                  <label>Google Analytics (GA4)</label>
                  <input className="input" dir="ltr" value={s.analytics.ga4} onChange={(e) => setAn('ga4', e.target.value)} />
                </div>
                <div className="field">
                  <label>Google Tag Manager</label>
                  <input className="input" dir="ltr" value={s.analytics.gtm} onChange={(e) => setAn('gtm', e.target.value)} />
                </div>
                <div className="field">
                  <label>Meta Pixel</label>
                  <input className="input" dir="ltr" value={s.analytics.metaPixel} onChange={(e) => setAn('metaPixel', e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          <section className="panel2">
            <div className="ph">
              <h3>محركات الذكاء الاصطناعي (GEO / AEO)</h3>
            </div>
            <div className="pb">
              <p className="muted" style={{ fontSize: '.85rem', marginBottom: 14 }}>
                تحكّم في وصول روبوتات الذكاء الاصطناعي لمحتوى موقعك ليظهر في إجاباتها.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {BOTS.map(([bot, label]) => (
                  <label key={bot} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    <Switch on={s.crawlerPolicy?.[bot] ?? false} onChange={(v) => setBot(bot, v)} label={label} />
                  </label>
                ))}
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label>محتوى llms.txt (تعليمات لمحركات الذكاء الاصطناعي)</label>
                <textarea className="input" rows={4} value={s.llmsTxt} onChange={(e) => set('llmsTxt', e.target.value)} />
              </div>
            </div>
          </section>
        </>
      )}
    </SettingsLayout>
  );
}
