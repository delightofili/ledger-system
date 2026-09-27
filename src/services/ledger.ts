import { prisma } from "../lib/prisma";
import { Prisma } from "../../generated/prisma";
import crypto from "crypto";
import { publishEvent, TOPICS } from "../lib/kafka";
import {
  checkIdempotency,
  setIdempotencyProcessing,
  setIdempotencyComplete,
  setIdempotencyFailed,
} from "../lib/idempotency";

type Direction = "DEBIT" | "CREDIT";
type TransactionStatus = "PENDING" | "POSTED" | "VOIDED";

interface PostTransactionInput {
  idempotencyKey: string;
  description: string;
  entries: {
    accountId: string;
    direction: Direction;
    amount: bigint;
    currency: string;
  }[];
  metadata?: Record<string, unknown>;
}

export async function postTransaction(input: PostTransactionInput) {
  validateBalance(input.entries);

  const cached = await checkIdempotency(input.idempotencyKey);

  if (cached.exists) {
    if (cached.status === "complete") {
      return cached.response;
      // return stored result immediately — sub-millisecond
    }
    if (cached.status === "processing") {
      throw new Error("Transaction still processing — retry in a moment");
    }
    if (cached.status === "failed") {
      throw new Error(
        "Transaction previously failed — use a new idempotency key",
      );
    }
  }

  // CLAIM THE KEY — atomic SET NX
  const claimed = await setIdempotencyProcessing(input.idempotencyKey);
  if (!claimed) {
    throw new Error(
      "Concurrent request with same idempotency key — retry shortly",
    );
  }

  try {
    const transaction = await prisma.$transaction(
      async (tx) => {
        const accountIds = input.entries.map((e) => e.accountId);
        await tx.$executeRaw`
        SELECT id FROM accounts
        WHERE id = ANY(${accountIds}::uuid[])
        FOR UPDATE
      `;

        return tx.transaction.create({
          data: {
            idempotencyKey: input.idempotencyKey,
            description: input.description,
            metadata: input.metadata as Prisma.InputJsonObject | undefined,
            entries: {
              create: input.entries.map((e) => ({
                accountId: e.accountId,
                direction: e.direction,
                amount: e.amount,
                currency: e.currency,
              })),
            },
          },
          include: {
            entries: { include: { account: true } },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );

    await setIdempotencyComplete(input.idempotencyKey, transaction);

    // PUBLISH TO KAFKA
    // fire and forget — don't await in the critical path
    // if Kafka is down, the transaction still succeeds
    publishEvent(
      TOPICS.TRANSACTION_POSTED,
      {
        transactionId: transaction.id,
        description: transaction.description,
        entryCount: transaction.entries.length,
        totalDebits: transaction.entries
          .filter((e) => e.direction === "DEBIT")
          .reduce((sum, e) => sum + Number(e.amount), 0),
        currency: transaction.entries[0]?.currency,
        metadata: transaction.metadata,
      },
      transaction.id,
    ).catch((err) => {
      // log but don't fail the transaction
      console.error("Failed to publish transaction event:", err);
    });

    return transaction;
  } catch (error) {
    await setIdempotencyFailed(
      input.idempotencyKey,
      error instanceof Error ? error.message : "Unknown error",
    );
    throw error;
  }
}

export async function getBalance(
  accountId: string,
  asOf?: Date,
): Promise<bigint> {
  const result = await prisma.$queryRaw<{ balance: bigint }[]>`
    SELECT COALESCE(SUM(
      CASE
        WHEN direction = 'DEBIT'  THEN amount
        WHEN direction = 'CREDIT' THEN -amount
      END
    ), 0)::bigint as balance
    FROM entries e
    JOIN transactions t ON t.id = e.transaction_id
    WHERE
      e.account_id = ${accountId}::uuid
      AND t.status = 'POSTED'
      ${asOf ? Prisma.sql`AND e.created_at <= ${asOf}` : Prisma.empty}
  `;
  return result[0].balance;
}

export async function getStatement(accountId: string, from: Date, to: Date) {
  const entries = await prisma.entry.findMany({
    where: {
      accountId,
      createdAt: { gte: from, lte: to },
      transaction: { status: "POSTED" },
    },
    include: {
      transaction: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // calculate running balance
  let runningBalance = await getBalance(accountId, from);

  return entries.map((entry: any) => {
    if (entry.direction === "DEBIT") {
      runningBalance += entry.amount;
    } else {
      runningBalance -= entry.amount;
    }

    return {
      id: entry.id,
      date: entry.createdAt,
      description: entry.transaction.description,
      direction: entry.direction,
      amount: entry.amount,
      runningBalance,
      currency: entry.currency,
    };
  });
}

export async function voidTransaction(
  transactionId: string,
  reason: string,
  idempotencyKey: string,
) {
  return prisma.$transaction(async (tx: any) => {
    const original = await tx.transaction.findUnique({
      where: { id: transactionId },
      include: { entries: true },
    });

    if (!original) throw new Error("Transaction not found");
    if (original.status === "VOIDED") throw new Error("Already voided");

    // mark original voided
    await tx.transaction.update({
      where: { id: transactionId },
      data: { status: "VOIDED" },
    });

    // create reversal with opposite directions
    return tx.transaction.create({
      data: {
        idempotencyKey,
        description: `REVERSAL: ${reason} [ref: ${transactionId}]`,
        status: "POSTED",
        metadata: { reversalOf: transactionId, reason },
        entries: {
          create: original.entries.map((entry: any) => ({
            accountId: entry.accountId,
            direction: entry.direction === "DEBIT" ? "CREDIT" : "DEBIT",
            amount: entry.amount,
            currency: entry.currency,
          })),
        },
      },
      include: { entries: true },
    });
  });
}

function validateBalance(entries: PostTransactionInput["entries"]) {
  const debits = entries
    .filter((e) => e.direction === "DEBIT")
    .reduce((sum, e) => sum + e.amount, 0n);

  const credits = entries
    .filter((e) => e.direction === "CREDIT")
    .reduce((sum, e) => sum + e.amount, 0n);

  if (debits !== credits) {
    throw new Error(
      `Transaction out of balance: debits=${debits} credits=${credits}`,
    );
  }
}

function hashRequest(input: PostTransactionInput): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}
