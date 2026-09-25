-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '24 hours';

-- CreateTable
CREATE TABLE "crypto_deposit_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "network" TEXT NOT NULL DEFAULT 'sepolia',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_deposit_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "txHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "ledgerTransactionId" UUID,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crypto_deposit_addresses_address_key" ON "crypto_deposit_addresses"("address");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_deposit_addresses_index_key" ON "crypto_deposit_addresses"("index");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_transactions_txHash_key" ON "crypto_transactions"("txHash");
