import { defaultsFor, SETTINGS_KEYS, SETTINGS_SECTIONS } from '.';

describe('settings sections (docs/07 §10)', () => {
  it.each(SETTINGS_KEYS)('%s: defaults are complete and valid', (key) => {
    const d = defaultsFor(key);
    expect(SETTINGS_SECTIONS[key].schema.parse(d)).toEqual(d);
  });

  it('defaults carry the current brand values from config.js', () => {
    expect(defaultsFor('branding')).toMatchObject({
      name: 'منزلة',
      fullName: 'منزلة العقارية',
      tagline: 'عقارات تليق بمنزلتك',
      theme: { primary: '#0F4C3A', accent: '#C9A86C', background: '#FAF7F2' },
      fontDisplay: 'Alexandria',
      radius: 16,
    });
    expect(defaultsFor('general').listingCodePrefix).toBe('MZ');
    expect(defaultsFor('contact').whatsapp).toBe('966500000000');
  });

  it('rejects unknown keys and unsafe values', () => {
    const branding = SETTINGS_SECTIONS.branding.schema;
    expect(branding.safeParse({ ...defaultsFor('branding'), extra: 1 }).success).toBe(false);
    expect(branding.safeParse({ fontBody: "x'); @import url(//evil)" }).success).toBe(false);
    expect(branding.safeParse({ logoUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(SETTINGS_SECTIONS.contact.schema.safeParse({ phone: '0500000000' }).success).toBe(false);
    expect(SETTINGS_SECTIONS.general.schema.safeParse({ timezone: 'Mars/Base' }).success).toBe(false);
  });

  it('validates booking policies', () => {
    const booking = SETTINGS_SECTIONS.booking.schema;
    const bad = defaultsFor('booking');
    bad.policies.sale.defaultPaymentType = 'full';
    bad.policies.sale.paymentTypes = ['deposit'];
    expect(booking.safeParse(bad).success).toBe(false);
    const minMax = defaultsFor('booking');
    minMax.policies.rent.deposit.min = 500;
    minMax.policies.rent.deposit.max = 100;
    expect(booking.safeParse(minMax).success).toBe(false);
    expect(booking.safeParse({ termsHtml: '<script>x</script><p>ok</p>' }).success).toBe(true);
    expect(booking.parse({ termsHtml: '<script>x</script><p>ok</p>' }).termsHtml).toBe('<p>ok</p>');
  });

  it('notifications: fills default channels and rejects unknown events', () => {
    const n = SETTINGS_SECTIONS.notifications.schema;
    expect(n.parse({}).channels['lead.created']).toEqual({ inApp: true, email: true, sms: false });
    expect(n.safeParse({ channels: { 'evil.event': { inApp: true, email: true, sms: true } } }).success).toBe(false);
  });

  it('seo: AI crawler policy defaults', () => {
    const seo = defaultsFor('seo');
    expect(seo.aiCrawlers.GPTBot).toBe('deny');
    expect(seo.aiCrawlers.PerplexityBot).toBe('allow');
  });
});
