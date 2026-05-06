-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxMachines" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "os" TEXT,
    "appVersion" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_userId_key" ON "License"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_licenseKey_idx" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_userId_idx" ON "License"("userId");

-- CreateIndex
CREATE INDEX "Machine_licenseId_idx" ON "Machine"("licenseId");

-- CreateIndex
CREATE INDEX "Machine_lastHeartbeatAt_idx" ON "Machine"("lastHeartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_licenseId_machineId_key" ON "Machine"("licenseId", "machineId");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
