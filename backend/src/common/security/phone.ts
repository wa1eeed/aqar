/** Saudi mobile numbers (docs/02 §2.2): accepts 05…, 5…, 9665…, +9665… → E.164 +9665XXXXXXXX. */
export const SAUDI_MOBILE = /^(?:\+?966|0)?5\d{8}$/;

export function normaliseSaudiMobile(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!SAUDI_MOBILE.test(digits)) return null;
  return `+9665${digits.slice(-8)}`;
}
