import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { renderFrontendSchema } from '../src/render-frontend';
import { OFFER_KEYS, STATUS_KEYS, TYPE_KEYS, cities, fields } from '../src/data';

type BrowserSchema = Record<string, unknown> & {
  fieldsFor(t: string, o: string): Array<{ key: string }>;
  field(k: string): unknown;
  statusesFor(o: string): string[];
  city(id: string): unknown;
  isClosed(s: string): boolean;
};

function load(source: string): BrowserSchema {
  const window: { MZ?: { schema: BrowserSchema } } = {};
  vm.runInNewContext(source, { window });
  if (!window.MZ) throw new Error('script did not define window.MZ');
  return window.MZ.schema;
}

const original = load(readFileSync(resolve(__dirname, 'fixtures/schema.original.js'), 'utf8'));
const generated = load(renderFrontendSchema());
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('generated frontend schema.js', () => {
  it('exposes the same keys in the same order', () => {
    expect(Object.keys(generated)).toEqual(Object.keys(original));
  });

  it('has identical data', () => {
    for (const key of Object.keys(original)) {
      if (typeof original[key] === 'function') continue;
      expect(plain(generated[key]), key).toEqual(plain(original[key]));
    }
  });

  it('helpers behave identically for every type/offer/status/city/field', () => {
    const probeTypes = [...TYPE_KEYS, 'unknown'];
    const probeOffers = [...OFFER_KEYS, 'unknown'];
    for (const t of probeTypes) {
      for (const o of probeOffers) {
        expect(plain(generated.fieldsFor(t, o)), `${t}/${o}`).toEqual(plain(original.fieldsFor(t, o)));
      }
    }
    for (const o of probeOffers) expect(generated.statusesFor(o)).toEqual(original.statusesFor(o));
    for (const s of [...STATUS_KEYS, 'x']) expect(generated.isClosed(s)).toBe(original.isClosed(s));
    for (const c of [...cities.map((x) => x.id), 'nowhere'])
      expect(plain(generated.city(c))).toEqual(plain(original.city(c)));
    for (const f of [...fields.map((x) => x.key), 'nope'])
      expect(plain(generated.field(f))).toEqual(plain(original.field(f)));
  });

  it('is not stale (frontend/assets/js/schema.js equals the generator output)', () => {
    const current = readFileSync(resolve(__dirname, '../../../frontend/assets/js/schema.js'), 'utf8');
    expect(current).toBe(renderFrontendSchema());
  });
});
