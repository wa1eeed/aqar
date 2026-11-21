// بناء CSV بسيط (مع هروب القيم). نقيّ وقابل للاختبار.
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return `${head}\n${body}${body ? '\n' : ''}`;
}
