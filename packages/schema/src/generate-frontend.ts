/**
 * CLI: يكتب (أو يتحقق من) frontend/assets/js/schema.js من المصدر المشترك.
 *   pnpm --filter @manzilah/schema build:frontend           # يكتب الملف
 *   pnpm --filter @manzilah/schema build:frontend -- --check # يفشل إن كان قديماً
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { OUTPUT_PATH, renderFrontend } from './frontend-template.js';

const content = renderFrontend();
const check = process.argv.includes('--check');

if (check) {
  let current = '';
  try {
    current = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    current = '';
  }
  if (current !== content) {
    console.error(
      'frontend/assets/js/schema.js قديم — شغّل: pnpm --filter @manzilah/schema build:frontend',
    );
    process.exit(1);
  }
  console.log('schema.js محدّث.');
} else {
  writeFileSync(OUTPUT_PATH, content, 'utf8');
  console.log('تم كتابة', OUTPUT_PATH);
}
