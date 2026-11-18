/** المال يُخزَّن بالهللات كأعداد صحيحة (BigInt). 1 ريال = 100 هللة. العملة SAR. */
export const HALALAS_PER_SAR = 100n;

export function sarToHalalas(sar: number): bigint {
  return BigInt(Math.round(sar * 100));
}

export function halalasToSar(halalas: bigint): number {
  return Number(halalas) / 100;
}

/** تنسيق المبلغ للعرض: أرقام لاتينية en-US + "ر.س". */
export function formatSar(halalas: bigint): string {
  return `${new Intl.NumberFormat('en-US').format(halalasToSar(halalas))} ر.س`;
}

/** تحويل BigInt إلى رقم ريال للعرض في حمولات الواجهة (priceSar). */
export function toPriceSar(halalas: bigint): number {
  return halalasToSar(halalas);
}
