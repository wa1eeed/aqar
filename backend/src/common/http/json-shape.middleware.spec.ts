import { exceedsJsonShape, MAX_ARRAY_LENGTH, MAX_DEPTH } from './json-shape.middleware';

describe('exceedsJsonShape', () => {
  it('accepts normal payloads', () => {
    expect(exceedsJsonShape({ ids: Array(MAX_ARRAY_LENGTH).fill(1), a: { b: [{ c: 1 }] } })).toBe(false);
  });
  it('rejects oversized arrays at any depth', () => {
    expect(exceedsJsonShape(Array(MAX_ARRAY_LENGTH + 1).fill(1))).toBe(true);
    expect(exceedsJsonShape({ a: { b: Array(MAX_ARRAY_LENGTH + 1).fill('x') } })).toBe(true);
  });
  it('rejects deep nesting without blowing the stack', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 10_000; i++) deep = { n: deep };
    expect(exceedsJsonShape(deep)).toBe(true);
    let ok: unknown = 1;
    for (let i = 0; i < MAX_DEPTH; i++) ok = [ok];
    expect(exceedsJsonShape(ok)).toBe(false);
  });
});
