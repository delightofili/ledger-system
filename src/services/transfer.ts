import Decimal from "decimal.js";
import { prisma } from "../lib/prisma";
import { AccountType } from "../../generated/prisma";

interface TransferParams {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
}

export async function executeTransfer({
  fromAccountId,
  toAccountId,
  amount,
  currency,
  idempotencyKey,
}: TransferParams) {
  // to Check Idempotency Key
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey },
    include: { entries: true },
  });
  if (existingTx) return existingTx;

  // to Perform execution inside an atomic database transaction
  return await prisma.$transaction(async (tx) => {
    const fromAccount = await tx.account.findUnique({
      where: { id: fromAccountId },
    });
    const toAccount = await tx.account.findUnique({
      where: { id: toAccountId },
    });

    if (!fromAccount || !toAccount) {
      throw new Error("One or both accounts were not found");
    }

    if (fromAccount.currency !== currency || toAccount.currency !== currency) {
      throw new Error("Account currency mismatch");
    }

    // to fetch fee revenue account for the specified currency
    const feeAccount = await tx.account.findFirst({
      where: {
        code: `4000-FEE-${currency}`,
        type: AccountType.REVENUE,
      },
    });

    if (!feeAccount) {
      throw new Error(`Fee revenue account for ${currency} not found`);
    }

    // to Calculate sender balance (Liability/Wallet Account: Credits - Debits)
    const debits = await tx.entry.aggregate({
      where: { accountId: fromAccountId, direction: "DEBIT" },
      _sum: { amount: true },
    });
    const credits = await tx.entry.aggregate({
      where: { accountId: fromAccountId, direction: "CREDIT" },
      _sum: { amount: true },
    });

    const creditSum = new Decimal(credits._sum.amount?.toString() || "0");
    const debitSum = new Decimal(debits._sum.amount?.toString() || "0");
    const currentBalance = creditSum.minus(debitSum);

    const grossAmount = new Decimal(amount);
    if (currentBalance.lessThan(grossAmount)) {
      throw new Error("Insufficient balance");
    }

    const feePercent = new Decimal("0.015");
    const feeAmount = grossAmount
      .mul(feePercent)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const netRecipientAmount = grossAmount.minus(feeAmount);

    return await tx.transaction.create({
      data: {
        idempotencyKey,
        reference: `TRSF-${Date.now()}`,
        description: `Transfer from ${fromAccount.name} to ${toAccount.name}`,
        entries: {
          create: [
            {
              accountId: fromAccountId,
              direction: "DEBIT",
              amount: grossAmount.toNumber(),
              currency,
            },
            {
              accountId: toAccountId,
              direction: "CREDIT",
              amount: netRecipientAmount.toNumber(),
              currency,
            },
            {
              accountId: feeAccount.id,
              direction: "CREDIT",
              amount: feeAmount.toNumber(),
              currency,
            },
          ],
        },
      },
      include: { entries: true },
    });
  });
}
