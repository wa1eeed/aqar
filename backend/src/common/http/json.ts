/**
 * JSON replacer: BigInt (halalas) → number when safe, otherwise string. Money fields stay exact
 * because amounts beyond 2^53 halalas (≈ 90 trillion SAR) never occur in practice.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  return value;
}
