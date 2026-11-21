/**
 * النماذج المملوكة لمشترك (tenantId مطلوب) التي يفرض عليها امتداد Prisma العزل تلقائياً.
 * النماذج ذات tenantId الاختياري (RefreshToken, OtpCode, AuditLog, IntegrationCallLog,
 * WebhookEvent) تُدار صراحةً في الخدمات، ونماذج المنصّة (Tenant, Plan, …) لا تُعزَل.
 */
export const TENANT_OWNED_MODELS = new Set<string>([
  'Role',
  'StaffUser',
  'Customer',
  'Property',
  'PropertyMedia',
  'PropertyStatusHistory',
  'NearbyCache',
  'Favorite',
  'SavedSearch',
  'Lead',
  'LeadActivity',
  'Viewing',
  'Booking',
  'Payment',
  'PaymentEvent',
  'BankAccount',
  'BankTransferSubmission',
  'Notification',
  'NotificationPreference',
  'EmailLog',
  'SettingsSection',
  'Integration',
  'Counter',
  'SeoLandingPage',
  'SeoPageMeta',
  'SeoKeyword',
  'SeoFaq',
  'SeoRedirect',
  'Seo404',
  'Auction',
  'AuctionRegistration',
  'AuctionBid',
  'Wallet',
  'WalletTransaction',
]);

export function isTenantModel(model?: string): boolean {
  return !!model && TENANT_OWNED_MODELS.has(model);
}
