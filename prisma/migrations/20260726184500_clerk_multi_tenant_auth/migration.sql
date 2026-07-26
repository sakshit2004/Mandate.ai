-- Replace deployment-wide credentials with Clerk-backed organization tenancy.
CREATE TYPE "AgencyStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'MEMBER');

DROP TABLE IF EXISTS "Session";
DROP INDEX IF EXISTS "Agency_adminEmail_key";

ALTER TABLE "Agency"
  DROP COLUMN IF EXISTS "adminEmail",
  DROP COLUMN IF EXISTS "passwordHash",
  ADD COLUMN "clerkOrganizationId" TEXT,
  ADD COLUMN "status" "AgencyStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX "Agency_clerkOrganizationId_key"
  ON "Agency"("clerkOrganizationId");

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "clerkUserId" TEXT NOT NULL,
  "primaryEmail" TEXT,
  "name" TEXT,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgencyMembership" (
  "id" TEXT NOT NULL,
  "clerkMembershipId" TEXT,
  "agencyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgencyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "actorClerkUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BudgetReservation" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "budgetWindowId" TEXT NOT NULL,
  "amountUsd" DOUBLE PRECISION NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");
CREATE INDEX "User_primaryEmail_idx" ON "User"("primaryEmail");
CREATE UNIQUE INDEX "AgencyMembership_clerkMembershipId_key"
  ON "AgencyMembership"("clerkMembershipId");
CREATE UNIQUE INDEX "AgencyMembership_agencyId_userId_key"
  ON "AgencyMembership"("agencyId", "userId");
CREATE INDEX "AgencyMembership_userId_idx" ON "AgencyMembership"("userId");
CREATE INDEX "AuditEvent_agencyId_createdAt_idx"
  ON "AuditEvent"("agencyId", "createdAt");
CREATE INDEX "AuditEvent_actorClerkUserId_idx"
  ON "AuditEvent"("actorClerkUserId");
CREATE INDEX "BudgetReservation_clientId_budgetWindowId_expiresAt_idx"
  ON "BudgetReservation"("clientId", "budgetWindowId", "expiresAt");

ALTER TABLE "AgencyMembership"
  ADD CONSTRAINT "AgencyMembership_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgencyMembership"
  ADD CONSTRAINT "AgencyMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetReservation"
  ADD CONSTRAINT "BudgetReservation_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
