/** «قبل 4 د» style relative time (Gregorian, Latin digits — CLAUDE.md). */
export function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'الآن';
  if (sec < 3600) return `قبل ${Math.round(sec / 60)} د`;
  if (sec < 86_400) return `قبل ${Math.round(sec / 3600)} س`;
  return `قبل ${Math.round(sec / 86_400)} يوم`;
}
