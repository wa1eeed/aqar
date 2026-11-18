import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { OUTPUT_PATH, renderFrontend } from '../src/frontend-template.js';

describe('frontend schema sync', () => {
  it('المولّد frontend/assets/js/schema.js مطابق للملف المُلتزَم', () => {
    const current = readFileSync(OUTPUT_PATH, 'utf8');
    expect(current).toBe(renderFrontend());
  });
});
