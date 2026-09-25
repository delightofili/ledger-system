import { prisma } from "../lib/prisma";
import { postTransaction } from "../services/ledger";
import { listenForUSDCDeposits, DepositEvent } from "./eventListener";
import { deriveUserAddress } from "./wallet";
import { toSmallestUnit } from "../lib/money";

export async function loadWatchedAddresses(): Promise<Map<string, string>> {
  // Map<ethereumAddress, userId>
  const users = await prisma.cryptoDepositAddress.findMany({
    select: { address: true, userId: true },
  });

  const map = new Map<string, string>();
  users.forEach((u) => map.set(u.address.toLowerCase(), u.userId));

  return map;
}

export async function processUSDCDeposit(event: DepositEvent, userId: string) {
  // to check if already processed — tx hash is unique on blockchain
  const existing = await prisma.cryptoTransaction.findUnique({
    where: { txHash: event.txHash },
  });

  if (existing) {
    console.log(`Already processed tx: ${event.txHash}`);
    return existing;
    // idempotency — blockchain events can be received multiple times so we use the IDK
    // if websocket reconnects, I might get old events again
  }

  // find user's USDC ledger account
  const userAccount = await prisma.account.findFirst({
    where: { userId, currency: "USDC" },
  });

  if (!userAccount) {
    throw new Error(`No USDC account found for user ${userId}`);
  }

  const amount = event.amount;

  const transaction = await postTransaction({
    idempotencyKey: `usdc-deposit-${event.txHash}`,
    description: `USDC deposit from ${event.from}`,
    entries: [
      {
        accountId: process.env.USDC_HOT_WALLET_ACCOUNT_ID!,
        direction: "DEBIT",
        amount,
        currency: "USDC",
      },
      {
        accountId: userAccount.id,
        direction: "CREDIT",
        amount,
        currency: "USDC",
      },
    ],
    metadata: {
      txHash: event.txHash,
      fromAddress: event.from,
      toAddress: event.to,
      blockNumber: event.blockNumber,
    },
  });

  // record the blockchain transaction
  await prisma.cryptoTransaction.create({
    data: {
      txHash: event.txHash,
      userId,
      type: "DEPOSIT",
      currency: "USDC",
      amount,
      fromAddress: event.from,
      toAddress: event.to,
      blockNumber: event.blockNumber,
      ledgerTransactionId: (transaction as { id: string }).id,
      status: "CONFIRMED",
    },
  });

  console.log(
    `USDC deposit posted to ledger: ${event.amountFormatted} USDC for user ${userId}`,
  );
  return transaction;
}

export async function startDepositListener(mnemonic: string) {
  const watchedAddresses = await loadWatchedAddresses();
  const addressSet = new Set(watchedAddresses.keys());

  console.log(`Watching ${addressSet.size} deposit addresses`);

  const listener = await listenForUSDCDeposits(
    "sepolia",
    //learnt I would use sepolia for development, mainnet for production
    addressSet,
    async (event: DepositEvent) => {
      const userId = watchedAddresses.get(event.to.toLowerCase());
      if (!userId) return;

      await processUSDCDeposit(event, userId);
    },
  );

  return listener;
}
