-- Add expiry to verification tokens (aligns with reset-password pattern)
ALTER TABLE "User" ADD COLUMN "verificationTokenExpiry" TIMESTAMP(3);
