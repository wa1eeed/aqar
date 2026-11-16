/**
 * Generates frontend/assets/js/schema.js from packages/schema (docs/00 §5).
 *   pnpm --filter @nx/schema build:frontend          write the file
 *   pnpm --filter @nx/schema check:frontend          fail (exit 1) if the file is stale — used in CI
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderFrontendSchema } from '../src/render-frontend';

const target = resolve(__dirname, '../../../frontend/assets/js/schema.js');
const output = renderFrontendSchema();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    current = '';
  }
  if (current !== output) {
    console.error('frontend/assets/js/schema.js is stale. Run: pnpm schema:frontend');
    process.exit(1);
  }
  console.log('frontend/assets/js/schema.js is up to date');
} else {
  writeFileSync(target, output, 'utf8');
  console.log(`wrote ${target}`);
}
