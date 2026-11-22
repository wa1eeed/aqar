// أدوات نقيّة لإيصالات PDF (قابلة للاختبار بمعزل عن خدمة العرض).

/** تهريب قيم HTML قبل حقنها في قالب الإيصال (منع XSS في القيم). */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** مفتاح تخزين الإيصال، واعٍ بالمستأجر: tenants/{tenantId}/receipts/{paymentId}.pdf */
export const receiptKey = (tenantId: string, paymentId: string): string =>
  `tenants/${tenantId}/receipts/${paymentId}.pdf`;
