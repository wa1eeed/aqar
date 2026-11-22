import { Injectable, Logger, NotFoundException, ServiceUnavailableException, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Browser } from 'playwright-core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { SettingsService } from '../settings/settings.service.js';
import { FileStore } from './file-store.service.js';
import { escapeHtml, receiptKey } from './receipt-utils.js';

const METHOD: Record<string, string> = {
  moyasar: 'الدفع الإلكتروني (ميسر)',
  bank_transfer: 'تحويل بنكي',
  rize: 'رايز',
};
const TYPE: Record<string, string> = { deposit: 'عربون', full: 'دفع كامل' };
const DATE = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});
const sar = (h: bigint | number) =>
  `${(Number(h) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

// خطّ الموقع (IBM Plex Sans Arabic, OFL) مُضمَّن data URI حتى يبدو الـPDF نفسه على أيّ خادم بلا خطوط نظام ولا شبكة.
let fontCss: string | null = null;
function embeddedFonts(): string {
  if (fontCss !== null) return fontCss;
  try {
    const dir = join(dirname(require.resolve('@fontsource/ibm-plex-sans-arabic/package.json')), 'files');
    const face = (subset: string, weight: number, range: string) =>
      `@font-face{font-family:'IBM Plex Sans Arabic';font-weight:${weight};font-style:normal;unicode-range:${range};` +
      `src:url(data:font/woff2;base64,${readFileSync(join(dir, `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2`)).toString('base64')}) format('woff2');}`;
    const ARABIC =
      'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
    const LATIN =
      'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD';
    fontCss = [face('arabic', 400, ARABIC), face('arabic', 700, ARABIC), face('latin', 400, LATIN), face('latin', 700, LATIN)].join('');
  } catch {
    fontCss = '';
  }
  return fontCss;
}

/**
 * إيصالات الدفع (docs/04 §8): قالب HTML عربي RTL يُعرَض إلى PDF عبر Chromium بلا واجهة.
 * العزل: يُفعَّل فقط حيث يُضبط `CHROMIUM_PATH` (العامل الخلفي / التطوير)، فحاويات الـAPI تبقى خفيفة.
 * الصفحة بلا JavaScript وبلا شبكة، وكلّ القيم مُهرَّبة HTML.
 */
@Injectable()
export class ReceiptsService implements OnApplicationShutdown {
  private readonly logger = new Logger(ReceiptsService.name);
  private browser: Promise<Browser> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly settings: SettingsService,
    private readonly files: FileStore,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return !!this.config.get<string>('CHROMIUM_PATH');
  }

  private key(paymentId: string): string {
    return receiptKey(this.tenant.requireTenantId(), paymentId);
  }

  async html(paymentId: string): Promise<string> {
    const p = await this.prisma.scoped.payment.findFirst({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            customer: { select: { name: true, email: true } },
            property: { select: { code: true, title: true } },
          },
        },
      },
    });
    if (!p?.receiptNumber || !p.paidAt) throw new NotFoundException('لا يوجد إيصال لهذه الدفعة');
    const [branding, licensing, contact, payments] = (await Promise.all([
      this.settings.get('branding'),
      this.settings.get('licensing'),
      this.settings.get('contact'),
      this.settings.get('payments'),
    ])) as [
      { fullName?: string; theme?: { primary?: string } },
      { crNumber?: string; vatNumber?: string; regaFalLicense?: string; ejarMembership?: string },
      { address?: string; phoneDisplay?: string; email?: string },
      { showVatNote?: boolean; vatNoteAr?: string },
    ];
    const e = escapeHtml;
    const row = (k: string, v: string) => (v ? `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>` : '');
    const legal = [
      licensing.crNumber ? `السجل التجاري: ${licensing.crNumber}` : '',
      licensing.vatNumber ? `الرقم الضريبي: ${licensing.vatNumber}` : '',
      licensing.regaFalLicense ? `رخصة فال: ${licensing.regaFalLicense}` : '',
      licensing.ejarMembership ? `عضوية إيجار: ${licensing.ejarMembership}` : '',
    ].filter(Boolean);
    const brandName = branding.fullName ?? 'عقار أونلاين';
    const primary = /^#[0-9a-fA-F]{6}$/.test(branding.theme?.primary ?? '') ? branding.theme!.primary! : '#0F4C3A';
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${e(p.receiptNumber)}</title>
<style>
${embeddedFonts()}
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'IBM Plex Sans Arabic', 'Noto Sans Arabic', sans-serif; color: #14211C; font-size: 12pt; }
header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primary}; padding-bottom: 12px; }
h1 { color: ${primary}; font-size: 20pt; margin: 0 0 4px; }
.muted { color: #5F6B66; font-size: 10pt; line-height: 1.7; }
.no { text-align: left; direction: ltr; }
.no b { display: block; font-size: 14pt; }
h2 { font-size: 15pt; margin: 22px 0 10px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 9px 10px; border-bottom: 1px solid #E4DBCC; text-align: right; }
th { width: 38%; color: #5F6B66; font-weight: 600; }
.total { margin-top: 18px; background: #F3EDE3; border-radius: 10px; padding: 14px 16px; display: flex; justify-content: space-between; font-size: 15pt; }
.total b { color: ${primary}; }
footer { margin-top: 28px; border-top: 1px solid #E4DBCC; padding-top: 10px; }
</style></head><body>
<header><div><h1>${e(brandName)}</h1><div class="muted">${legal.map(e).join('<br>')}<br>${e(contact.address ?? '')}</div></div>
<div class="no"><span class="muted">Receipt / إيصال دفع</span><b>${e(p.receiptNumber)}</b><span class="muted">${e(DATE.format(p.paidAt))}</span></div></header>
<h2>إيصال دفع</h2>
<table>
${row('اسم العميل', p.booking.customer.name)}
${row('رقم الحجز', p.booking.number)}
${row('العقار', `${p.booking.property.title} (${p.booking.property.code})`)}
${row('نوع الدفع', TYPE[p.booking.paymentType] ?? '')}
${row('طريقة الدفع', METHOD[p.method] ?? p.method)}
${row('تاريخ الدفع', DATE.format(p.paidAt))}
${row('رقم العملية', p.providerPaymentId ?? '')}
</table>
<div class="total"><span>المبلغ المدفوع</span><b>${e(sar(p.amount))}</b></div>
${payments.showVatNote && payments.vatNoteAr ? `<p class="muted">${e(payments.vatNoteAr)}</p>` : ''}
<footer class="muted">${e(brandName)} · ${e(contact.phoneDisplay ?? '')} · ${e(contact.email ?? '')}<br>هذا الإيصال صادر إلكترونياً ولا يحتاج إلى توقيع.</footer>
</body></html>`;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const { chromium } = await import('playwright-core');
      this.browser = chromium.launch({
        executablePath: this.config.get<string>('CHROMIUM_PATH'),
        headless: true,
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none'],
        env: { ...process.env, HOME: '/tmp', XDG_CONFIG_HOME: '/tmp', XDG_CACHE_HOME: '/tmp' },
      });
      this.browser.catch(() => (this.browser = null));
    }
    return this.browser;
  }

  async renderPdf(paymentId: string): Promise<Buffer> {
    if (!this.enabled) throw new ServiceUnavailableException('الإيصال غير متاح حالياً');
    const html = await this.html(paymentId);
    const browser = await this.getBrowser();
    const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
    try {
      const page = await ctx.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
    } finally {
      await ctx.close();
    }
  }

  /** مهمّة العامل: عرض + تخزين الإيصال (داخل سياق المشترك). */
  async generate(paymentId: string): Promise<void> {
    const pdf = await this.renderPdf(paymentId);
    await this.files.put(this.key(paymentId), pdf, 'application/pdf');
  }

  /** يولّد الإيصال إن لم يكن مخزَّناً بعد (لا شيء إن كان العرض معطّلاً). */
  async ensure(paymentId: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.files.get(this.key(paymentId));
      return;
    } catch {
      // غير مخزَّن بعد
    }
    await this.generate(paymentId);
  }

  /** PDF المخزَّن للتنزيل (يُعرَض عند الطلب إن لم تُشغَّل المهمّة بعد، حيث العرض مُفعَّل). */
  async file(paymentId: string): Promise<Buffer> {
    const key = this.key(paymentId);
    try {
      return await this.files.get(key);
    } catch {
      if (!this.enabled) throw new ServiceUnavailableException('الإيصال قيد التجهيز، حاول لاحقاً');
      const pdf = await this.renderPdf(paymentId);
      await this.files.put(key, pdf, 'application/pdf');
      return pdf;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const b = await this.browser?.catch(() => null);
    await b?.close().catch(() => undefined);
  }
}
