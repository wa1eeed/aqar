import { PERMISSIONS, SYSTEM_ROLES } from './permissions';

const role = (k: string) => SYSTEM_ROLES.find((r) => r.key === k)!;

describe('system roles (docs/03 §3)', () => {
  it('only uses known permission keys, without duplicates', () => {
    for (const r of SYSTEM_ROLES) {
      expect(new Set(r.permissions).size).toBe(r.permissions.length);
      for (const p of r.permissions) expect(PERMISSIONS).toContain(p);
    }
  });

  it('matches key rows of the matrix', () => {
    expect(role('owner').permissions).toHaveLength(PERMISSIONS.length);
    expect(role('admin').permissions).not.toContain('payments.refund');
    expect(role('finance').permissions).toEqual(expect.arrayContaining(['payments.refund', 'payments.review']));
    expect(role('agent').permissions).not.toContain('properties.publish');
    expect(role('agent').permissions).not.toContain('leads.assign');
    expect(role('agent').scope).toBe('own');
    expect(role('content_editor').permissions).toEqual(
      expect.arrayContaining(['settings.branding', 'settings.legal', 'seo.manage']),
    );
    expect(role('content_editor').permissions).not.toContain('settings.licensing');
    expect(role('sales_manager').permissions).not.toContain('properties.delete');
  });

  it('requires 2FA for owner, admin and finance', () => {
    expect(
      SYSTEM_ROLES.filter((r) => r.requires2fa)
        .map((r) => r.key)
        .sort(),
    ).toEqual(['admin', 'finance', 'owner']);
  });
});
