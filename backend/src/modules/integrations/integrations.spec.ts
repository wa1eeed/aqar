import { createHmac } from 'node:crypto';
import { formFor } from './form';
import { assertPublicHttpsUrl } from './gateway.service';
import { PROVIDERS, provider } from './providers';
import { overpassNearby, overpassQuery } from './providers/overpass';
import { verifySvix } from './providers/resend';
import { INTEGRATION_REGISTRY } from './registry';
import type { ProviderCtx } from './types';

describe('provider registry (docs/05 §3)', () => {
  it('contains every documented key, with valid default config', () => {
    const keys = PROVIDERS.map((p) => p.key).sort();
    expect(keys).toEqual(
      [
        'maps.osm',
        'places.overpass',
        'maps.google',
        'places.google',
        'payments.moyasar',
        'payments.rize',
        'email.resend',
        'storage.r2',
        'gov.rega',
        'gov.ejar',
        'identity.nafath',
        'gov.nafith',
        'sms.unifonic',
        'sms.taqnyat',
        'sms.msegat',
      ].sort(),
    );
    for (const p of PROVIDERS) expect(() => p.configSchema.parse({})).not.toThrow();
    expect(
      INTEGRATION_REGISTRY.filter((r) => r.enabled)
        .map((r) => r.key)
        .sort(),
    ).toEqual(['maps.osm', 'places.overpass']);
    expect(PROVIDERS.filter((p) => p.prepared).map((p) => p.key)).toEqual(
      expect.arrayContaining([
        'payments.rize',
        'gov.rega',
        'gov.ejar',
        'identity.nafath',
        'gov.nafith',
        'sms.unifonic',
      ]),
    );
  });

  it('generates admin forms from the schemas', () => {
    const f = formFor(provider('payments.moyasar')!);
    expect(f.config.find((x) => x.key === 'mode')).toMatchObject({
      type: 'select',
      options: expect.arrayContaining([{ value: 'invoice', labelAr: 'صفحة فاتورة ميسر (موصى به)' }]),
    });
    expect(f.config.find((x) => x.key === 'sources')).toMatchObject({ type: 'multiselect' });
    expect(f.config.find((x) => x.key === 'callbackBaseUrl')).toMatchObject({ type: 'url', required: false });
    expect(f.secrets.map((x) => x.key)).toEqual(['secretKey', 'publishableKey', 'webhookSecret']);
  });

  it('validates secrets formats', () => {
    const s = provider('payments.moyasar')!.secretsSchema;
    expect(s.safeParse({ secretKey: 'pk_test_123456789' }).success).toBe(false);
    expect(s.safeParse({ secretKey: 'sk_test_123456789' }).success).toBe(true);
    expect(provider('storage.r2')!.configSchema.safeParse({ uploadsBucket: '../etc' }).success).toBe(false);
    expect(provider('maps.osm')!.configSchema.safeParse({ tilesUrl: 'javascript:alert(1)//{z}{x}{y}' }).success).toBe(
      false,
    );
  });
});

describe('SSRF guard', () => {
  it.each([
    'https://overpass-api.de/api/interpreter',
    'https://api.resend.com/emails',
    'https://places.googleapis.com/v1/x',
  ])('allows %s', (u) => expect(() => assertPublicHttpsUrl(u)).not.toThrow());
  it.each([
    'http://overpass-api.de/api',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://172.20.0.3/x',
    'https://[::1]/x',
    'https://postgres/x',
    'https://user:pass@example.com/x',
    'https://redis.internal/x',
  ])('blocks %s', (u) => expect(() => assertPublicHttpsUrl(u)).toThrow());
});

describe('Resend (Svix) webhook signature', () => {
  const secret = `whsec_${Buffer.from('super-secret-key-material-0123456789').toString('base64')}`;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
      .update(`${id}.${ts}.${body}`)
      .digest('base64')}`;
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });

  it('accepts a valid signature (also among several)', () => {
    const sig = sign('msg_1', String(now), body);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, Buffer.from(body), now)).toBe(
      true,
    );
    expect(
      verifySvix(secret, { id: 'msg_1', timestamp: String(now), signature: `v1,AAAA ${sig}` }, Buffer.from(body), now),
    ).toBe(true);
  });

  it('rejects tampering, wrong secret, missing headers and stale timestamps', () => {
    const sig = sign('msg_1', String(now), body);
    expect(
      verifySvix(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, Buffer.from(body + ' '), now),
    ).toBe(false);
    expect(
      verifySvix(
        'whsec_' + Buffer.from('other').toString('base64'),
        { id: 'msg_1', timestamp: String(now), signature: sig },
        Buffer.from(body),
        now,
      ),
    ).toBe(false);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: String(now) }, Buffer.from(body), now)).toBe(false);
    const old = String(now - 600);
    expect(
      verifySvix(secret, { id: 'msg_1', timestamp: old, signature: sign('msg_1', old, body) }, Buffer.from(body), now),
    ).toBe(false);
  });
});

describe('Overpass adapter', () => {
  it('builds the same query as the frontend did', () => {
    expect(overpassQuery(24.7, 46.6, 2000, ['fuel'])).toBe(
      '[out:json][timeout:20];(nwr["amenity"="fuel"](around:2000,24.7,46.6););out center 400;',
    );
  });

  it('maps elements to categories, Arabic names first, sorted by distance', async () => {
    const ctx = {
      config: { endpoint: 'https://overpass-api.de/api/interpreter', radius: 2000 },
      http: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [
            { type: 'node', id: 1, lat: 24.71, lon: 46.68, tags: { amenity: 'fuel', name: 'Station' } },
            {
              type: 'way',
              id: 2,
              center: { lat: 24.7137, lon: 46.6754 },
              tags: { amenity: 'place_of_worship', religion: 'muslim', 'name:ar': 'جامع الحي' },
            },
            { type: 'node', id: 3, lat: 24.72, lon: 46.67, tags: { amenity: 'bench' } },
          ],
        }),
      }),
    } as unknown as ProviderCtx<never, never>;
    const items = await overpassNearby(ctx, 24.7136, 46.6753, 2000, ['fuel', 'mosque']);
    expect(items.map((i) => [i.cat, i.name])).toEqual([
      ['mosque', 'جامع الحي'],
      ['fuel', 'Station'],
    ]);
    expect(items[0]!.distance).toBeLessThan(items[1]!.distance);
  });
});
