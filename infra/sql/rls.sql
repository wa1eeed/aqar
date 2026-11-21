-- منزلة — سياسات Row-Level Security لعزل المشتركين (دفاع بالعمق مع امتداد Prisma).
--
-- ⚠️ تحذير: لا تُطبّق هذا السكربت قبل توصيل ضبط `app.tenant_id` لكل طلب
-- (SET LOCAL app.tenant_id داخل معاملة قبل استعلامات المشترك). بدون ذلك ترجع
-- current_setting فارغاً فتُحجب كل الصفوف وتفشل الكتابة — أي يتعطّل التطبيق.
-- هذا السكربت خطوة تحصين لاحقة (مرحلة المنصّة)، منفصل عن هجرات Prisma.
--
-- يُطبّق بعد تهيئة المخطّط:  psql "$DATABASE_URL" -f infra/sql/rls.sql

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Role','StaffUser','Customer','Property','PropertyMedia','PropertyStatusHistory',
    'NearbyCache','Favorite','SavedSearch','Lead','LeadActivity','Viewing','Booking',
    'Payment','PaymentEvent','BankAccount','BankTransferSubmission','Notification',
    'NotificationPreference','EmailLog','SettingsSection','Integration','Counter',
    'SeoLandingPage','SeoPageMeta','SeoKeyword','SeoFaq','SeoRedirect','Seo404',
    'Auction','AuctionRegistration','AuctionBid','Wallet','WalletTransaction'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("tenantId" = current_setting(''app.tenant_id'', true)) '
      'WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t
    );
  END LOOP;
END $$;
