import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Browser } from 'playwright-core';
import { AppException } from '../../common/errors/app-exception';
import { escapeHtml } from '../../common/security/html';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { FileStore } from './file-store.service';

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
const sar = (h: bigint) =>
  `${(Number(h) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

/**
 * The site's body font (IBM Plex Sans Arabic, OFL) embedded as data URIs, so the PDF looks the same on
 * any server — no system fonts and no network access needed while rendering.
 */
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
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
    fontCss = [
      face('arabic', 400, ARABIC),
      face('arabic', 700, ARABIC),
      face('latin', 400, LATIN),
      face('latin', 700, LATIN),
    ].join('');
  } catch {
    fontCss = '';
  }
  return fontCss;
}

export const receiptKey = (paymentId: string) => `uploads/receipts/${paymentId}.pdf`;

/**
 * Payment receipts (docs/04 §8): an Arabic RTL HTML template rendered to PDF by headless Chromium in
 * the worker, stored privately, emailed to the customer and downloadable from «حسابي». The page has
 * JavaScript disabled and every network request blocked; all values are HTML-escaped.
 */
@Injectable()
export class ReceiptsService implements OnApplicationShutdown {
  private readonly logger = new Logger(ReceiptsService.name);
  private browser: Promise<Browser> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly files: FileStore,
    private readonly email: EmailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get enabled(): boolean {
    return !!this.env.CHROMIUM_PATH;
  }

  async html(paymentId: string): Promise<string> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            customer: { select: { name: true, email: true, phone: true } },
            property: { select: { code: true, title: true } },
          },
        },
      },
    });
    if (!p?.receiptNumber || !p.paidAt) throw new AppException('NOT_FOUND', 404, 'لا يوجد إيصال لهذه الدفعة');
    const [branding, licensing, contact, payments] = await Promise.all([
      this.settings.get('branding'),
      this.settings.get('licensing'),
      this.settings.get('contact'),
      this.settings.get('payments'),
    ]);
    const e = escapeHtml;
    const row = (k: string, v: string) => (v ? `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>` : '');
    const legal = [
      licensing.crNumber ? `السجل التجاري: ${licensing.crNumber}` : '',
      licensing.vatNumber ? `الرقم الضريبي: ${licensing.vatNumber}` : '',
      licensing.regaFalLicense ? `رخصة فال: ${licensing.regaFalLicense}` : '',
      licensing.ejarMembership ? `عضوية إيجار: ${licensing.ejarMembership}` : '',
    ].filter(Boolean);
    const primary = /^#[0-9a-fA-F]{6}$/.test(branding.theme.primary) ? branding.theme.primary : '#0F4C3A';
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
<header><div><h1>${e(branding.fullName)}</h1><div class="muted">${legal.map(e).join('<br>')}<br>${e(contact.address)}</div></div>
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
<footer class="muted">${e(branding.fullName)} · ${e(contact.phoneDisplay)} · ${e(contact.email)}<br>هذا الإيصال صادر إلكترونياً ولا يحتاج إلى توقيع.</footer>
</body></html>`;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const { chromium } = await import('playwright-core');
      this.browser = chromium.launch({
        executablePath: this.env.CHROMIUM_PATH,
        headless: true,
        // Container without user namespaces; the page is our own escaped HTML with JS off and no network.
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none'],
        // Containers run with a read-only filesystem: Chromium's profile/cache go to the /tmp tmpfs.
        env: { ...process.env, HOME: '/tmp', XDG_CONFIG_HOME: '/tmp', XDG_CACHE_HOME: '/tmp' },
      });
      this.browser.catch(() => (this.browser = null));
    }
    return this.browser;
  }

  async renderPdf(paymentId: string): Promise<Buffer> {
    if (!this.enabled) throw new AppException('RECEIPT_UNAVAILABLE', 503, 'الإيصال غير متاح حالياً');
    const html = await this.html(paymentId);
    const browser = await this.getBrowser();
    const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
    try {
      const page = await ctx.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally {
      await ctx.close();
    }
  }

  /** Worker job: render + store the PDF, then email the receipt to the customer (with the PDF). */
  async generateAndSend(paymentId: string): Promise<void> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: { include: { customer: { select: { email: true } }, property: { select: { title: true } } } },
      },
    });
    if (!p?.receiptNumber) return;
    let pdf: Buffer | null = null;
    if (this.enabled) {
      pdf = await this.renderPdf(paymentId);
      await this.files.put(receiptKey(paymentId), pdf, 'application/pdf');
    } else {
      this.logger.warn({ paymentId }, 'CHROMIUM_PATH not set: receipt emailed without a PDF');
    }
    if (!p.booking.customer.email) return;
    const title = `تم استلام دفعتك ${sar(p.amount)}`;
    await this.email.sendNotification(
      'payment-receipt',
      p.booking.customer.email,
      {
        subject: `إيصال الدفع ${p.receiptNumber}`,
        title,
        intro: 'استلمنا دفعتك بنجاح، وتجد الإيصال مرفقاً بهذه الرسالة ومتاحاً في صفحة الحجز.',
        details: [
          ['رقم الإيصال', p.receiptNumber],
          ['رقم الحجز', p.booking.number],
          ['العقار', p.booking.property.title],
          ['المبلغ', sar(p.amount)],
        ],
        cta: { label: 'عرض الحجز', url: `${this.env.PUBLIC_URL}/account/booking?b=${encodeURIComponent(p.bookingId)}` },
      },
      { type: 'payment', id: p.id },
      pdf
        ? {
            attachments: [
              { filename: `${p.receiptNumber}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' },
            ],
          }
        : {},
    );
  }

  /** Stored PDF for downloads (rendered on demand if the job has not run yet). */
  async file(paymentId: string): Promise<Buffer> {
    try {
      return await this.files.get(receiptKey(paymentId));
    } catch {
      const pdf = await this.renderPdf(paymentId);
      await this.files.put(receiptKey(paymentId), pdf, 'application/pdf');
      return pdf;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const b = await this.browser?.catch(() => null);
    await b?.close().catch(() => undefined);
  }
}
