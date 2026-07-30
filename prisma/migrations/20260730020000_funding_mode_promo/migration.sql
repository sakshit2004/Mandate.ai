-- CreateEnum
CREATE TYPE "FundingMode" AS ENUM ('BYOK', 'MANDATE_PROMO');

-- AlterTable Agency
ALTER TABLE "Agency" ADD COLUMN "fundingMode" "FundingMode";
ALTER TABLE "Agency" ADD COLUMN "promoClientClaimed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Client
ALTER TABLE "Client" ADD COLUMN "fundingSource" "FundingMode" NOT NULL DEFAULT 'BYOK';
ALTER TABLE "Client" ADD COLUMN "promoExpiresAt" TIMESTAMP(3);

-- Backfill existing agencies that already completed setup as BYOK
UPDATE "Agency"
SET "fundingMode" = 'BYOK'
WHERE "setupComplete" = true OR "openaiConfigured" = true OR "anthropicConfigured" = true;
