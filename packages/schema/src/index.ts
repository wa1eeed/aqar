export * from './types.js';
export { schemaData } from './data.js';
export { fieldsFor, field, statusesFor, city, isClosed } from './helpers.js';
export { buildSpecsZod } from './specs-zod.js';
export * from './crm.js';
export * from './compat.js';
// ملاحظة: renderFrontend/OUTPUT_PATH في frontend-template.ts يُستخدمان عبر tsx/الاختبارات فقط
// (يعتمدان على import.meta)، فلا يُصدَّران من مكتبة CommonJS.
