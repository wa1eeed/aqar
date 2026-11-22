import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { schemaData } from './data.js';

const here = dirname(fileURLToPath(import.meta.url));
// packages/schema/src -> جذر المستودع
export const OUTPUT_PATH = resolve(here, '../../../frontend/assets/js/schema.js');

/** يولّد محتوى frontend/assets/js/schema.js كـ IIFE مطابق سلوكياً للملف اليدوي السابق. */
export function renderFrontend(): string {
  const data = JSON.stringify(schemaData, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');

  return `/* =========================================================
   عقار أونلاين — نموذج البيانات (Schema)
   GENERATED — عدّل المصدر في packages/schema ثم شغّل:
     pnpm --filter @manzilah/schema build:frontend
   لا تُعدّل هذا الملف يدوياً.
   ========================================================= */
window.MZ = window.MZ || {};

(function (MZ) {
  var ALL = '*';

  var schema = ${data};

  function match(list, v) { return list === ALL || list.indexOf(v) !== -1; }

  schema.fieldsFor = function (type, offer) {
    return schema.fields.filter(function (f) { return match(f.types, type) && match(f.offers, offer); });
  };
  schema.field = function (key) {
    for (var i = 0; i < schema.fields.length; i++) if (schema.fields[i].key === key) return schema.fields[i];
    return null;
  };
  schema.statusesFor = function (offer) {
    return Object.keys(schema.statuses).filter(function (s) { return schema.statuses[s].offers.indexOf(offer) !== -1; });
  };
  schema.city = function (id) {
    for (var i = 0; i < schema.cities.length; i++) if (schema.cities[i].id === id) return schema.cities[i];
    return null;
  };
  schema.isClosed = function (status) { return schema.closedStatuses.indexOf(status) !== -1; };

  MZ.schema = schema;
})(window.MZ);
`;
}
