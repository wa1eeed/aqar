// حساب نسبة التباين (WCAG 2) بين لونين hex، وحارس تباين الهوية.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function channelLum(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

/** نسبة التباين بين لونين (1 إلى 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export interface ContrastFailure {
  pair: string;
  ratio: number;
}

/** يفحص أزواج الألوان الحرجة (docs/07 §10.1). الحد الأدنى 4.5:1. */
export function checkBrandingContrast(colors: Record<string, string>): ContrastFailure[] {
  const pairs: [string, string, string][] = [
    ['ink/background', colors.ink, colors.background],
    ['white/primary', '#FFFFFF', colors.primary],
    ['accentInk/surface', colors.accentInk, colors.surface],
    ['primary/background', colors.primary, colors.background],
  ];
  const out: ContrastFailure[] = [];
  for (const [name, a, b] of pairs) {
    if (!a || !b) continue;
    const ratio = contrastRatio(a, b);
    if (ratio < 4.5) out.push({ pair: name, ratio });
  }
  return out;
}
