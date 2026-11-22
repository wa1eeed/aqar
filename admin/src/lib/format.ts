/** «قبل 4 د» style relative time (Gregorian, Latin digits — CLAUDE.md). */
export function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'الآن';
  if (sec < 3600) return `قبل ${Math.round(sec / 60)} د`;
  if (sec < 86_400) return `قبل ${Math.round(sec / 3600)} س`;
  return `قبل ${Math.round(sec / 86_400)} يوم`;
}

/** Prices: en-US digits + «ر.س» (CLAUDE.md). Input in halalas. */
export function sar(halalas: number | null | undefined): string {
  if (halalas === null || halalas === undefined) return '—';
  return `${(halalas / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س`;
}

export function date(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '—';
}

const DAY = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Riyadh',
});
const TIME = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});
/** «الخميس، 19 نوفمبر» in Riyadh time. */
export const dayLabel = (iso: string | Date): string => DAY.format(new Date(iso));
/** «4:00 م» in Riyadh time. */
export const timeLabel = (iso: string | Date): string => TIME.format(new Date(iso));

/** +966 55 123 4567 */
export function phoneLabel(e164: string | null | undefined): string {
  if (!e164) return '—';
  const m = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164);
  return m ? `+966 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
