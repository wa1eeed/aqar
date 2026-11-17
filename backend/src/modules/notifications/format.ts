/** Dates in Gregorian with Latin digits, Riyadh time (CLAUDE.md "Arabic first"). */
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

export const dayLabel = (d: Date): string => DAY.format(d);
export const timeLabel = (d: Date): string => TIME.format(d);

/** Prices: en-US grouping + «ر.س» (CLAUDE.md). Input in halalas. */
export const sarLabel = (halalas: bigint | number): string =>
  `${(Number(halalas) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س`;

/** Riyadh hour of a timestamp → the modal's slot label when it matches one. */
export function slotLabel(d: Date): string {
  const h = (d.getUTCHours() + 3) % 24;
  return h < 12 ? 'صباحاً' : h < 18 ? 'عصراً' : 'مساءً';
}
