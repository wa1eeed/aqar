// حجب الأسرار قبل التسجيل (docs/05 §6): إبقاء آخر 4 محارف، اقتطاع الأجسام إلى 8KB.
const SECRET_RE = /(key|secret|token|password|authorization|iban|nationalid|card|cvc|otp)/i;
const MAX_BYTES = 8 * 1024;

function maskString(s: string): string {
  const tail = s.length <= 4 ? s : s.slice(-4);
  return `••••${tail}`;
}

export function redactIntegration(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactIntegration(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_RE.test(k)) out[k] = typeof v === 'string' ? maskString(v) : '••••';
    else out[k] = redactIntegration(v, depth + 1);
  }
  return out;
}

/** يحجب ثم يقتطع إلى 8KB لتخزينه في IntegrationCallLog.response. */
export function redactAndTruncate(value: unknown): unknown {
  const redacted = redactIntegration(value);
  const json = JSON.stringify(redacted ?? null);
  if (json.length <= MAX_BYTES) return redacted;
  return { _truncated: true, preview: json.slice(0, MAX_BYTES) };
}
