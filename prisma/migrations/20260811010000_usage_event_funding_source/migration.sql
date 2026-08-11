-- Preserve the funding source used for each request so promo spend remains
-- attributable after a client is converted to BYOK.
ALTER TABLE "UsageEvent"
ADD COLUMN "fundingSource" "FundingMode" NOT NULL DEFAULT 'BYOK';

UPDATE "UsageEvent" AS event
SET "fundingSource" = 'MANDATE_PROMO'
FROM "Client" AS client
WHERE event."clientId" = client."id"
  AND client."promoExpiresAt" IS NOT NULL
  AND event."ts" <= client."promoExpiresAt";

CREATE INDEX "UsageEvent_fundingSource_idx"
ON "UsageEvent"("fundingSource");

ALTER TABLE "BudgetReservation"
ADD COLUMN "fundingSource" "FundingMode" NOT NULL DEFAULT 'BYOK';

UPDATE "BudgetReservation" AS reservation
SET "fundingSource" = 'MANDATE_PROMO'
FROM "Client" AS client
WHERE reservation."clientId" = client."id"
  AND client."fundingSource" = 'MANDATE_PROMO';

CREATE INDEX "BudgetReservation_fundingSource_expiresAt_idx"
ON "BudgetReservation"("fundingSource", "expiresAt");
