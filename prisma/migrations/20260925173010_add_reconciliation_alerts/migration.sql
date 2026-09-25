-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '24 hours';

-- CreateTable
CREATE TABLE "reconciliation_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "internalBalance" BIGINT NOT NULL,
    "onChainBalance" BIGINT NOT NULL,
    "discrepancy" BIGINT NOT NULL,
    "network" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_alerts_pkey" PRIMARY KEY ("id")
);
