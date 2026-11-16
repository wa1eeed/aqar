-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'blocked', 'deleted');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('staff', 'customer');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('login', 'verify_email', 'verify_phone', 'reset_password', 'staff_2fa_email');

-- CreateEnum
CREATE TYPE "PropertyOffer" AS ENUM ('sale', 'rent', 'investment');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('available', 'negotiation', 'reserved', 'sold', 'rented');

-- CreateEnum
CREATE TYPE "RentPeriod" AS ENUM ('yearly', 'monthly', 'daily');

-- CreateEnum
CREATE TYPE "ListingVisibility" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "AdLicenseCheck" AS ENUM ('unknown', 'valid', 'expiring', 'expired', 'invalid');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('photo', 'floor_plan', 'document', 'video_url');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('viewing', 'waitlist', 'buy', 'rent', 'list', 'invest', 'manage', 'contact');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('new', 'contacted', 'viewing', 'negotiation', 'won', 'lost');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('website', 'whatsapp', 'phone', 'walk_in', 'admin');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('note', 'call', 'whatsapp', 'email', 'stage_change', 'assignment', 'viewing', 'booking', 'system');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('requested', 'confirmed', 'completed', 'no_show', 'cancelled');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending_payment', 'awaiting_transfer_review', 'confirmed', 'completed', 'cancelled', 'expired', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('deposit', 'full');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('moyasar', 'bank_transfer', 'rize');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('initiated', 'pending', 'paid', 'failed', 'under_review', 'rejected', 'cancelled', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('low', 'normal', 'high');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed');

-- CreateEnum
CREATE TYPE "IntegrationEnv" AS ENUM ('sandbox', 'live');

-- CreateEnum
CREATE TYPE "IntegrationHealth" AS ENUM ('unknown', 'ok', 'degraded', 'down');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('draft', 'scheduled', 'live', 'ended', 'awarded', 'cancelled');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "GuaranteeType" AS ENUM ('wallet', 'nafith');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('topup', 'hold', 'release', 'capture', 'refund', 'adjustment');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "title" TEXT,
    "falLicense" TEXT,
    "avatarKey" TEXT,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showOnWebsite" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEnc" BYTEA,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "nafathVerifiedAt" TIMESTAMP(3),
    "nationalIdHash" TEXT,
    "nationalIdLast4" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "offer" "PropertyOffer" NOT NULL,
    "status" "PropertyStatus" NOT NULL DEFAULT 'available',
    "visibility" "ListingVisibility" NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "showExactLocation" BOOLEAN NOT NULL DEFAULT true,
    "price" BIGINT NOT NULL,
    "rentPeriod" "RentPeriod",
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "annualisedPrice" BIGINT NOT NULL,
    "pricePerMeter" BIGINT,
    "area" INTEGER NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "roi" DECIMAL(5,2),
    "specs" JSONB NOT NULL,
    "adLicenseNo" TEXT NOT NULL,
    "falLicenseNo" TEXT NOT NULL,
    "licenseExpiry" TIMESTAMP(3),
    "adLicenseCheck" "AdLicenseCheck" NOT NULL DEFAULT 'unknown',
    "adLicenseCheckedAt" TIMESTAMP(3),
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentPolicy" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "focusKeyword" TEXT,
    "keywords" TEXT[],
    "ogImageKey" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "agentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "searchVector" tsvector,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMedia" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'photo',
    "originalKey" TEXT,
    "variants" JSONB,
    "externalUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "altAr" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "status" "MediaStatus" NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyStatusHistory" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "from" "PropertyStatus" NOT NULL,
    "to" "PropertyStatus" NOT NULL,
    "reason" TEXT,
    "bookingId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NearbyCache" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "radius" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NearbyCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "customerId" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("customerId","propertyId")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "alertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "LeadType" NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'new',
    "source" "LeadSource" NOT NULL DEFAULT 'website',
    "propertyId" INTEGER,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "cityId" TEXT,
    "propertyType" TEXT,
    "budget" BIGINT,
    "message" TEXT,
    "preferredDate" TIMESTAMP(3),
    "preferredSlot" TEXT,
    "assignedToId" TEXT,
    "lostReason" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT true,
    "utm" JSONB,
    "meta" JSONB,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "leadId" TEXT,
    "customerId" TEXT,
    "agentId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 45,
    "status" "ViewingStatus" NOT NULL DEFAULT 'requested',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "offerSnapshot" "PropertyOffer" NOT NULL,
    "priceSnapshot" BIGINT NOT NULL,
    "rentPeriodSnapshot" "RentPeriod",
    "paymentType" "PaymentType" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amountDue" BIGINT NOT NULL,
    "amountPaid" BIGINT NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending_payment',
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "customerNotes" TEXT,
    "cancelReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'initiated',
    "amount" BIGINT NOT NULL,
    "refundedAmount" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "idempotencyKey" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "providerInvoiceId" TEXT,
    "providerStatus" TEXT,
    "providerUrl" TEXT,
    "providerPayload" JSONB,
    "receiptNumber" TEXT,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "accountNumber" TEXT,
    "swift" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransferSubmission" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderBank" TEXT NOT NULL,
    "transferReference" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "receiptKey" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'submitted',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransferSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientType" "SubjectType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "data" JSONB,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'normal',
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "recipientType" "SubjectType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("recipientType","recipientId","eventKey")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "resendId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingsSection" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettingsSection_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Integration" (
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" "IntegrationEnv" NOT NULL DEFAULT 'sandbox',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretsEnc" BYTEA,
    "secretsHint" JSONB,
    "health" "IntegrationHealth" NOT NULL DEFAULT 'unknown',
    "healthCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IntegrationCallLog" (
    "id" TEXT NOT NULL,
    "integrationKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "correlationId" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "regaAuctionLicense" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "startingPrice" BIGINT NOT NULL,
    "minIncrement" BIGINT NOT NULL,
    "reservePrice" BIGINT,
    "depositAmount" BIGINT NOT NULL,
    "antiSnipingSec" INTEGER NOT NULL DEFAULT 120,
    "status" "AuctionStatus" NOT NULL DEFAULT 'draft',
    "winnerCustomerId" TEXT,
    "winningBidId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionRegistration" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "guaranteeType" "GuaranteeType" NOT NULL,
    "nafithNoteId" TEXT,
    "walletHoldId" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'pending',
    "bidderAlias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "held" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoLandingPage" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "h1" TEXT NOT NULL,
    "introHtml" TEXT NOT NULL,
    "faqIds" TEXT[],
    "focusKeyword" TEXT,
    "keywords" TEXT[],
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageKey" TEXT,
    "indexable" BOOLEAN NOT NULL DEFAULT true,
    "inSitemap" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoLandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoPageMeta" (
    "key" TEXT NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "focusKeyword" TEXT,
    "keywords" TEXT[],
    "ogImageKey" TEXT,
    "faqIds" TEXT[],
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoPageMeta_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SeoKeyword" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "group" TEXT,
    "targetPath" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoFaq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answerShort" TEXT NOT NULL,
    "answerHtml" TEXT,
    "scope" TEXT[],
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SeoFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRedirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "code" INTEGER NOT NULL DEFAULT 301,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seo404" (
    "path" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "referrer" TEXT,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seo404_pkey" PRIMARY KEY ("path")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_subjectType_subjectId_idx" ON "RefreshToken"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "OtpCode_destination_purpose_idx" ON "OtpCode"("destination", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "District_cityId_nameAr_key" ON "District"("cityId", "nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "Property_code_key" ON "Property"("code");

-- CreateIndex
CREATE INDEX "Property_visibility_status_offer_type_idx" ON "Property"("visibility", "status", "offer", "type");

-- CreateIndex
CREATE INDEX "Property_cityId_districtId_idx" ON "Property"("cityId", "districtId");

-- CreateIndex
CREATE INDEX "Property_annualisedPrice_idx" ON "Property"("annualisedPrice");

-- CreateIndex
CREATE INDEX "Property_createdAt_idx" ON "Property"("createdAt");

-- CreateIndex
CREATE INDEX "PropertyMedia_propertyId_sort_idx" ON "PropertyMedia"("propertyId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "NearbyCache_propertyId_provider_radius_key" ON "NearbyCache"("propertyId", "provider", "radius");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_number_key" ON "Lead"("number");

-- CreateIndex
CREATE INDEX "Lead_stage_assignedToId_idx" ON "Lead"("stage", "assignedToId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Viewing_agentId_scheduledAt_idx" ON "Viewing"("agentId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_number_key" ON "Booking"("number");

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Booking_propertyId_status_idx" ON "Booking"("propertyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerInvoiceId_key" ON "Payment"("providerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransferSubmission_paymentId_key" ON "BankTransferSubmission"("paymentId");

-- CreateIndex
CREATE INDEX "Notification_recipientType_recipientId_readAt_idx" ON "Notification"("recipientType", "recipientId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_resendId_key" ON "EmailLog"("resendId");

-- CreateIndex
CREATE INDEX "IntegrationCallLog_integrationKey_createdAt_idx" ON "IntegrationCallLog"("integrationKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionRegistration_auctionId_customerId_key" ON "AuctionRegistration"("auctionId", "customerId");

-- CreateIndex
CREATE INDEX "AuctionBid_auctionId_amount_idx" ON "AuctionBid"("auctionId", "amount");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_customerId_key" ON "Wallet"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SeoLandingPage_path_key" ON "SeoLandingPage"("path");

-- CreateIndex
CREATE UNIQUE INDEX "SeoKeyword_keyword_key" ON "SeoKeyword"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "SeoRedirect_fromPath_key" ON "SeoRedirect"("fromPath");

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMedia" ADD CONSTRAINT "PropertyMedia_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyStatusHistory" ADD CONSTRAINT "PropertyStatusHistory_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NearbyCache" ADD CONSTRAINT "NearbyCache_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferSubmission" ADD CONSTRAINT "BankTransferSubmission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferSubmission" ADD CONSTRAINT "BankTransferSubmission_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionRegistration" ADD CONSTRAINT "AuctionRegistration_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────── Custom SQL (docs/01 "Migration notes") ───────────────────────────

-- Public listing numbers start at 1001.
ALTER SEQUENCE "Property_id_seq" RESTART WITH 1001;

-- Full-text search vector on Property (title, description, district name, code), kept by triggers.
CREATE OR REPLACE FUNCTION property_search_vector_refresh() RETURNS trigger AS $$
DECLARE
  district_name text;
BEGIN
  SELECT d."nameAr" INTO district_name FROM "District" d WHERE d."id" = NEW."districtId";
  NEW."searchVector" :=
       setweight(to_tsvector('arabic', coalesce(NEW."title", '')), 'A')
    || setweight(to_tsvector('simple', coalesce(NEW."code", '')), 'A')
    || setweight(to_tsvector('arabic', coalesce(district_name, '')), 'B')
    || setweight(to_tsvector('arabic', coalesce(NEW."description", '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER property_search_vector_trg
  BEFORE INSERT OR UPDATE OF "title", "description", "districtId", "code" ON "Property"
  FOR EACH ROW EXECUTE FUNCTION property_search_vector_refresh();

-- Renaming a district refreshes the vectors of its properties.
CREATE OR REPLACE FUNCTION district_name_refresh_properties() RETURNS trigger AS $$
BEGIN
  IF NEW."nameAr" IS DISTINCT FROM OLD."nameAr" THEN
    UPDATE "Property" SET "districtId" = "districtId" WHERE "districtId" = NEW."id";
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER district_name_refresh_trg
  AFTER UPDATE OF "nameAr" ON "District"
  FOR EACH ROW EXECUTE FUNCTION district_name_refresh_properties();

CREATE INDEX "Property_searchVector_idx" ON "Property" USING GIN ("searchVector");
CREATE INDEX "Property_title_trgm_idx" ON "Property" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Property_code_trgm_idx" ON "Property" USING GIN ("code" gin_trgm_ops);

-- One active booking per property (docs/01, docs/04 §3).
CREATE UNIQUE INDEX "one_active_booking" ON "Booking"("propertyId")
  WHERE "status" IN ('pending_payment', 'awaiting_transfer_review', 'confirmed');

-- ─────────────── Integrity constraints (defence in depth; the services validate first) ───────────────

-- Property.type must be a key of packages/schema `types` (asserted by test/schema-sync.e2e-spec.ts).
ALTER TABLE "Property" ADD CONSTRAINT "Property_type_check" CHECK ("type" IN (
  'land', 'villa', 'apartment', 'floor', 'townhouse', 'building', 'tower', 'office', 'showroom', 'warehouse', 'istiraha', 'farm'
));
ALTER TABLE "Property" ADD CONSTRAINT "Property_money_check" CHECK (
  "price" >= 0 AND "annualisedPrice" >= 0 AND ("pricePerMeter" IS NULL OR "pricePerMeter" >= 0) AND "area" >= 0
);
ALTER TABLE "Property" ADD CONSTRAINT "Property_rent_period_check" CHECK ("offer" <> 'rent' OR "rentPeriod" IS NOT NULL);

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_money_check" CHECK (
  "priceSnapshot" >= 0 AND "amountDue" > 0 AND "amountPaid" >= 0
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_money_check" CHECK (
  "amount" > 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount"
);
ALTER TABLE "BankTransferSubmission" ADD CONSTRAINT "BankTransferSubmission_amount_check" CHECK ("amount" > 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_check" CHECK ("balance" >= 0 AND "held" >= 0);
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_value_check" CHECK ("value" >= 0);
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_money_check" CHECK (
  "startingPrice" > 0 AND "minIncrement" > 0 AND "depositAmount" >= 0 AND "endsAt" > "startsAt"
);
