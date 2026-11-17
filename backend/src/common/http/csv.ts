/**
 * CSV for staff exports: UTF-8 BOM (Excel shows Arabic), CRLF, every cell quoted, and values that a
 * spreadsheet would evaluate (= + - @ tab CR) prefixed with ' (CSV/formula injection, OWASP).
 */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(head: string[], rows: unknown[][]): string {
  return `\uFEFF${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
