import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodError } from 'zod';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import { defaultsFor } from '../src/modules/settings/schemas';
import { createTestApp } from './helpers';

describe('SettingsService (e2e)', () => {
  let app: NestExpressApplication;
  let settings: SettingsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    settings = app.get(SettingsService);
    prisma = app.get(PrismaService);
    await prisma.settingsSection.deleteMany();
    await prisma.auditLog.deleteMany({ where: { entityType: 'settings' } });
  });
  afterAll(() => app.close());

  it('returns defaults when a section was never saved', async () => {
    expect(await settings.get('branding')).toEqual(defaultsFor('branding'));
  });

  it('validates, stores, audits and invalidates the cache', async () => {
    const next = { ...defaultsFor('contact'), email: 'Sales@Example.SA', hours: 'يومياً' };
    const saved = await settings.update('contact', next, null);
    expect(saved.email).toBe('sales@example.sa');
    expect((await settings.get('contact')).hours).toBe('يومياً');

    const row = await prisma.settingsSection.findUniqueOrThrow({ where: { key: 'contact' } });
    expect((row.value as { hours: string }).hours).toBe('يومياً');

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'settings', entityId: 'contact' } });
    expect(audit.action).toBe('settings.update');
    expect((audit.before as { hours: string }).hours).toBe(defaultsFor('contact').hours);
    expect(audit.actorType).toBe('system');
  });

  it('rejects invalid input and leaves the stored value untouched', async () => {
    await expect(settings.update('branding', { theme: { primary: 'red' } }, null)).rejects.toBeInstanceOf(ZodError);
    await expect(settings.update('branding', { logoUrl: 'javascript:alert(1)' }, null)).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(await prisma.settingsSection.findUnique({ where: { key: 'branding' } })).toBeNull();
  });

  it('sanitises rich text before storing', async () => {
    await settings.update('legal', { aboutHtml: '<p>من نحن</p><script>steal()</script>' }, null);
    const row = await prisma.settingsSection.findUniqueOrThrow({ where: { key: 'legal' } });
    expect((row.value as { aboutHtml: string }).aboutHtml).toBe('<p>من نحن</p>');
  });

  it('ensureDefaults creates only missing sections', async () => {
    const created = await settings.ensureDefaults();
    expect(created).not.toContain('contact');
    expect(created).toContain('branding');
    expect((await settings.get('contact')).hours).toBe('يومياً');
  });
});
