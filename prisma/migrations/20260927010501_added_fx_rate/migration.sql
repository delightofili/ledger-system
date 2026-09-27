-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '24 hours';

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fx_rates_fromCurrency_toCurrency_active_idx" ON "fx_rates"("fromCurrency", "toCurrency", "active");
