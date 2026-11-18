const SECRET_KEY_PATTERN = /(secret|password|token|apikey|api_key|authorization|privatekey|private_key|webhookkey|webhook_key|totp)/i;
const REDACTED = '••••redacted';

/** يحذف القيم الحساسة من كائن قبل تسجيله في AuditLog أو السجلات. */
export function redact<T>(value: T): T {
  return redactInner(value, 0) as T;
}

function redactInner(value: unknown, depth: number): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactInner(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactInner(val, depth + 1);
  }
  return out;
}
