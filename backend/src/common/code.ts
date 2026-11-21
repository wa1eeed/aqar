import { randomInt } from 'node:crypto';

// أبجدية Crockford Base32 بلا محارف ملتبسة (I, L, O, U).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function yearTwoDigits(date: Date = new Date()): string {
  return String(date.getUTCFullYear()).slice(-2);
}

/**
 * كود عمل بصيغة {PREFIX}-{YY}-{RAND}. مثال: formatCode('MZ') => 'MZ-26-7K4Q2P'.
 * يُستخدم لأكواد العقارات (بادئة المشترك) وأرقام الحجوزات/الطلبات/الإيصالات (B/L/R).
 */
export function formatCode(prefix: string, length = 6, date: Date = new Date()): string {
  return `${prefix}-${yearTwoDigits(date)}-${randomCode(length)}`;
}

/** يولّد كوداً فريداً بالتحقّق عبر دالة exists (خاصّة بالمشترك)، مع إعادة المحاولة عند التصادم. */
export async function uniqueCode(
  prefix: string,
  exists: (code: string) => Promise<boolean>,
  opts: { length?: number; maxTries?: number } = {},
): Promise<string> {
  const length = opts.length ?? 6;
  const maxTries = opts.maxTries ?? 10;
  for (let i = 0; i < maxTries; i++) {
    const code = formatCode(prefix, length);
    if (!(await exists(code))) return code;
  }
  throw new Error('تعذّر توليد كود فريد بعد عدّة محاولات');
}
