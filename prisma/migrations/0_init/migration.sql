-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "premarketPlan" TEXT,
    "endOfDayReview" TEXT,
    "lessons" TEXT,
    "mood" INTEGER DEFAULT 5,
    "marketConditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataFeedConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "host" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "apiKey" TEXT,
    "lastConnected" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataFeedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "pnl" DOUBLE PRECISION,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3),
    "timeframe" TEXT,
    "setup" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "rating" INTEGER,
    "emotions" TEXT,
    "screenshotUrl" TEXT,
    "screenshotUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "playbookSetupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tier" TEXT NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'STRIPE',
    "proofUrl" TEXT,
    "proofText" TEXT,
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookSetup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exampleUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stripeCouponId" TEXT,
    "trialDays" INTEGER,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodeUsage" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "paymentCompleted" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "displayName" TEXT,
    "avatar" TEXT,
    "emailVerified" TIMESTAMP(3),
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionId" TEXT,
    "customerId" TEXT,
    "subscriptionStart" TIMESTAMP(3),
    "subscriptionEnd" TIMESTAMP(3),
    "hasResearchPack" BOOLEAN NOT NULL DEFAULT false,
    "researchPackBoughtAt" TIMESTAMP(3),
    "maxDevices" INTEGER NOT NULL DEFAULT 1,
    "currentDeviceId" TEXT,
    "lastLoginIp" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider" ASC, "providerAccountId" ASC);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId" ASC);

-- CreateIndex
CREATE INDEX "DailyNote_date_idx" ON "DailyNote"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DailyNote_userId_date_key" ON "DailyNote"("userId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "DailyNote_userId_idx" ON "DailyNote"("userId" ASC);

-- CreateIndex
CREATE INDEX "DataFeedConfig_userId_idx" ON "DataFeedConfig"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DataFeedConfig_userId_provider_key" ON "DataFeedConfig"("userId" ASC, "provider" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_fingerprint_key" ON "Device"("userId" ASC, "fingerprint" ASC);

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId" ASC);

-- CreateIndex
CREATE INDEX "JournalEntry_entryTime_idx" ON "JournalEntry"("entryTime" ASC);

-- CreateIndex
CREATE INDEX "JournalEntry_symbol_idx" ON "JournalEntry"("symbol" ASC);

-- CreateIndex
CREATE INDEX "JournalEntry_userId_idx" ON "JournalEntry"("userId" ASC);

-- CreateIndex
CREATE INDEX "Payment_stripePaymentId_idx" ON "Payment"("stripePaymentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentId_key" ON "Payment"("stripePaymentId" ASC);

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId" ASC);

-- CreateIndex
CREATE INDEX "PlaybookSetup_userId_idx" ON "PlaybookSetup"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookSetup_userId_name_key" ON "PlaybookSetup"("userId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "PromoCode_active_idx" ON "PromoCode"("active" ASC);

-- CreateIndex
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code" ASC);

-- CreateIndex
CREATE INDEX "PromoCodeUsage_deviceFingerprint_idx" ON "PromoCodeUsage"("deviceFingerprint" ASC);

-- CreateIndex
CREATE INDEX "PromoCodeUsage_ipAddress_idx" ON "PromoCodeUsage"("ipAddress" ASC);

-- CreateIndex
CREATE INDEX "PromoCodeUsage_promoCodeId_idx" ON "PromoCodeUsage"("promoCodeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCodeUsage_promoCodeId_userId_key" ON "PromoCodeUsage"("promoCodeId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "PromoCodeUsage_userId_idx" ON "PromoCodeUsage"("userId" ASC);

-- CreateIndex
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId" ASC);

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token" ASC);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId" ASC);

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status" ASC);

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId" ASC);

-- CreateIndex
CREATE INDEX "User_customerId_idx" ON "User"("customerId" ASC);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyNote" ADD CONSTRAINT "DailyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataFeedConfig" ADD CONSTRAINT "DataFeedConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_playbookSetupId_fkey" FOREIGN KEY ("playbookSetupId") REFERENCES "PlaybookSetup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookSetup" ADD CONSTRAINT "PlaybookSetup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

