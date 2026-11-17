/**
 * One quoted CSV cell. Values starting with = + - @ (or tab/CR) are prefixed with ' so spreadsheet
 * apps do not evaluate them as formulas (CSV/formula injection, OWASP).
 */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
