import { describe, expect, it } from 'vitest';
import { NAV, visibleNav } from './nav';

describe('admin navigation (docs/07 §1)', () => {
  it('keeps the documented order and labels', () => {
    expect(NAV.map((n) => n.label)).toEqual([
      'الرئيسية',
      'العقارات',
      'الطلبات',
      'المعاينات',
      'الحجوزات',
      'المدفوعات',
      'العملاء',
      'المزادات',
      'التقارير',
      'تحسين الظهور (SEO)',
      'الإشعارات',
      'التكاملات',
      'الإعدادات',
      'الفريق والصلاحيات',
      'سجل العمليات',
    ]);
  });

  it('filters by permission and feature flag', () => {
    const agent = visibleNav(['dashboard.view', 'properties.view', 'leads.view', 'viewings.manage', 'bookings.view'], {
      auctions: false,
    });
    expect(agent.map((n) => n.to)).toEqual(['/', '/properties', '/leads', '/viewings', '/bookings', '/notifications']);
    const editor = visibleNav(['settings.branding', 'auctions.manage'], { auctions: false });
    expect(editor.map((n) => n.to)).toEqual(['/notifications', '/settings']);
    expect(visibleNav(['auctions.manage'], { auctions: true }).map((n) => n.to)).toContain('/auctions');
  });
});
