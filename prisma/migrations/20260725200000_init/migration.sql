-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
    "adminEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "openaiConfigured" BOOLEAN NOT NULL DEFAULT false,
    "anthropicConfigured" BOOLEAN NOT NULL DEFAULT false,
    "sealedOpenaiKey" TEXT,
    "sealedAnthropicKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "keyAlias" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "sealedKey" TEXT NOT NULL,
    "maxBudgetUsd" DOUBLE PRECISION NOT NULL,
    "budgetPeriod" "BudgetPeriod" NOT NULL DEFAULT 'monthly',
    "killed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlert" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "thresholdPct" INTEGER NOT NULL DEFAULT 80,
    "budgetWindowId" TEXT NOT NULL,
    "spendUsd" DOUBLE PRECISION NOT NULL,
    "capUsd" DOUBLE PRECISION NOT NULL,
    "emailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_adminEmail_key" ON "Agency"("adminEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_agencyId_idx" ON "Session"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tokenHash_key" ON "Client"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Client_keyAlias_key" ON "Client"("keyAlias");

-- CreateIndex
CREATE INDEX "Client_agencyId_idx" ON "Client"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_agencyId_slug_key" ON "Client"("agencyId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_requestId_key" ON "UsageEvent"("requestId");

-- CreateIndex
CREATE INDEX "UsageEvent_clientId_ts_idx" ON "UsageEvent"("clientId", "ts");

-- CreateIndex
CREATE INDEX "UsageEvent_ts_idx" ON "UsageEvent"("ts");

-- CreateIndex
CREATE INDEX "BudgetAlert_clientId_idx" ON "BudgetAlert"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAlert_clientId_thresholdPct_budgetWindowId_key" ON "BudgetAlert"("clientId", "thresholdPct", "budgetWindowId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
