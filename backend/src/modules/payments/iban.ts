/**
 * Saudi IBAN (docs/04 §6): "SA" + 22 characters (2 check digits + 2-digit bank code + 18 account
 * characters), validated with the ISO 13616 mod-97 check. Input may contain spaces.
 */
export function normaliseIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function isValidSaudiIban(input: string): boolean {
  const iban = normaliseIban(input);
  if (!/^SA\d{2}\d{2}[0-9A-Z]{18}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** «SA03 8000 0000 6080 1016 4519» */
export function formatIban(input: string): string {
  return normaliseIban(input)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}
