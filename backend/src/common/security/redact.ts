/**
 * Redaction rules (docs/05 §6): mask values whose key matches the sensitive pattern (keep last 4
 * chars), cap depth and size. Used for audit entries, integration call logs and structured logs.
 */
export const SENSITIVE_KEY = /(key|secret|token|password|authorization|iban|nationalId|card|cvc|otp|cookie)/i;
export const MASK = '••••';
const MAX_DEPTH = 8;
export const MAX_LOG_BYTES = 8 * 1024;

export function maskValue(value: unknown): string {
  if (typeof value === 'string' && value.length > 8) return `${MASK}${value.slice(-4)}`;
  return MASK;
}

export function redact<T>(input: T, depth = 0): T {
  if (input === null || input === undefined) return input;
  if (depth > MAX_DEPTH) return '[depth-limit]' as unknown as T;
  if (typeof input === 'bigint') return input.toString() as unknown as T;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1)) as unknown as T;
  if (input instanceof Date) return input;
  if (Buffer.isBuffer(input)) return '[binary]' as unknown as T;
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] =
        SENSITIVE_KEY.test(k) && v !== null && v !== undefined && typeof v !== 'boolean'
          ? maskValue(v)
          : redact(v, depth + 1);
    }
    return out as T;
  }
  return input;
}

/** Redact then truncate to `maxBytes` of JSON (docs/05 §6: bodies truncated to 8 KB). */
export function redactForLog(input: unknown, maxBytes = MAX_LOG_BYTES): unknown {
  const redacted = redact(input);
  const json = JSON.stringify(redacted) ?? 'null';
  if (Buffer.byteLength(json, 'utf8') <= maxBytes) return redacted;
  return { truncated: true, preview: Buffer.from(json, 'utf8').subarray(0, maxBytes).toString('utf8') };
}
