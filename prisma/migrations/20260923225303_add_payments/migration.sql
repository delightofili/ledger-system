-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('PAYSTACK', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '24 hours';

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" TEXT NOT NULL,
    "providerRef" TEXT,
    "provider" "Provider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "fees" BIGINT NOT NULL DEFAULT 0,
    "netAmount" BIGINT NOT NULL DEFAULT 0,
    "userId" TEXT,
    "accountId" UUID,
    "transactionId" UUID,
    "metadata" JSONB,
    "webhookPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerRef_key" ON "payments"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_eventId_key" ON "webhook_events"("eventId");
