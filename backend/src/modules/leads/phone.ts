// تطبيع الجوال السعودي إلى E.164 (+9665XXXXXXXX). يرفض غير الجوال السعودي.
const SAUDI = /^(?:\+?966|0)?5\d{8}$/;

export function normalizeSaudiPhone(value: string): string | null {
  const s = String(value).replace(/[\s-]/g, '');
  if (!SAUDI.test(s)) return null;
  const m = s.match(/5\d{8}$/);
  return m ? `+966${m[0]}` : null;
}
