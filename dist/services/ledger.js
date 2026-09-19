"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postTransaction = postTransaction;
exports.getBalance = getBalance;
exports.getStatement = getStatement;
exports.voidTransaction = voidTransaction;
const prisma_1 = require("../lib/prisma");
const crypto_1 = __importDefault(require("crypto"));
async function postTransaction(input) {
    // validate balance before touching database
    validateBalance(input.entries);
    return prisma_1.prisma.$transaction(async (tx) => {
        // check idempotency
        const existing = await tx.idempotencyKey.findUnique({
            where: { key: input.idempotencyKey },
        });
        if (existing?.status === "COMPLETE" && existing.response) {
            return existing.response;
            // return stored response — idempotent retry
        }
        if (existing?.status === "PROCESSING") {
            throw new Error("Transaction still processing — retry later");
        }
        // mark as processing
        await tx.idempotencyKey.upsert({
            where: { key: input.idempotencyKey },
            create: {
                key: input.idempotencyKey,
                requestHash: hashRequest(input),
                status: "PROCESSING",
            },
            update: { status: "PROCESSING" },
        });
        // lock all accounts involved
        const accountIds = input.entries.map((e) => e.accountId);
        await tx.$executeRaw `
      SELECT id FROM accounts
      WHERE id = ANY(${accountIds}::uuid[])
      FOR UPDATE
    `;
        // create transaction with entries
        const transaction = await tx.transaction.create({
            data: {
                idempotencyKey: input.idempotencyKey,
                description: input.description,
                metadata: input.metadata,
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
                entries: {
                    include: { account: true },
                },
            },
        });
        // mark idempotency key as complete
        await tx.idempotencyKey.update({
            where: { key: input.idempotencyKey },
            data: {
                status: "COMPLETE",
                response: transaction,
            },
        });
        return transaction;
    }, { isolationLevel: "Serializable" });
}
async function getBalance(accountId, asOf) {
    const result = await prisma_1.prisma.$queryRaw `
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
      ${asOf ? prisma_1.prisma.sql `AND e.created_at <= ${asOf}` : prisma_1.prisma.empty ``}
  `;
    return result[0].balance;
}
async function getStatement(accountId, from, to) {
    const entries = await prisma_1.prisma.entry.findMany({
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
    return entries.map((entry) => {
        if (entry.direction === "DEBIT") {
            runningBalance += entry.amount;
        }
        else {
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
async function voidTransaction(transactionId, reason, idempotencyKey) {
    return prisma_1.prisma.$transaction(async (tx) => {
        const original = await tx.transaction.findUnique({
            where: { id: transactionId },
            include: { entries: true },
        });
        if (!original)
            throw new Error("Transaction not found");
        if (original.status === "VOIDED")
            throw new Error("Already voided");
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
                    create: original.entries.map((entry) => ({
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
function validateBalance(entries) {
    const debits = entries
        .filter((e) => e.direction === "DEBIT")
        .reduce((sum, e) => sum + e.amount, 0n);
    const credits = entries
        .filter((e) => e.direction === "CREDIT")
        .reduce((sum, e) => sum + e.amount, 0n);
    if (debits !== credits) {
        throw new Error(`Transaction out of balance: debits=${debits} credits=${credits}`);
    }
}
function hashRequest(input) {
    return crypto_1.default
        .createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
}
