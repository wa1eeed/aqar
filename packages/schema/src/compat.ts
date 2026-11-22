// طبقة توافق: تُصدّر رموز المخطّط العقارية مسطّحةً (offers, statuses, types, …) مشتقّةً من
// `schemaData`، لتوافق واجهة لوحة الإدارة التي تستوردها فُرادى (كما في حزمة @nx/schema سابقاً).
// المصدر الوحيد للحقيقة يبقى `schemaData` (packages/schema/src/data.ts).
import { schemaData } from './data.js';

export const offers = schemaData.offers;
export const statuses = schemaData.statuses;
export const closedStatuses = schemaData.closedStatuses;
export const categories = schemaData.categories;
export const types = schemaData.types;
export const rentPeriods = schemaData.rentPeriods;
export const cities = schemaData.cities;
export const fieldGroups = schemaData.fieldGroups;
export const fields = schemaData.fields;
export const nearby = schemaData.nearby;
