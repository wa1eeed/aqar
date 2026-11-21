// التحقّق من IBAN سعودي: SA + 22 رقماً، ISO 13616 mod-97.
export function isValidSaudiIban(input: string): boolean {
  const s = input.replace(/\s/g, '').toUpperCase();
  if (!/^SA\d{22}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  // استبدال الأحرف بأرقام (A=10 … Z=35)
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const digit of code) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/** تنسيق IBAN في مجموعات رباعية للعرض. */
export function formatIban(input: string): string {
  return input.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}
