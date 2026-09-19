import { Router } from "express";
import { prisma } from "../lib/prisma";
import { postTransaction, voidTransaction } from "../services/ledger";
import { toSmallestUnit } from "../lib/money";
import { z } from "zod";

const router = Router();

const entrySchema = z.object({
  accountId: z.string().uuid(),
  direction: z.enum(["DEBIT", "CREDIT"]),
  amount: z.string(),
  // string to avoid JS float issues
  currency: z.string().length(3),
});

const postTransactionSchema = z.object({
  description: z.string().min(1),
  entries: z.array(entrySchema).min(2),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// post a transaction
router.post("/", async (req, res) => {
  const idempotencyKey = req.headers["idempotency-key"] as string;
  if (!idempotencyKey) {
    return res.status(400).json({
      error: "Idempotency-Key header required",
    });
  }

  const parsed = postTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const transaction = await postTransaction({
    idempotencyKey,
    description: parsed.data.description,
    entries: parsed.data.entries.map((e) => ({
      accountId: e.accountId,
      direction: e.direction as "DEBIT" | "CREDIT",
      amount: toSmallestUnit(e.amount, e.currency),
      currency: e.currency,
    })),
    metadata: parsed.data.metadata,
  });

  res.status(201).json(transaction);
});

// get transaction
router.get("/:id", async (req, res) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: {
      entries: {
        include: { account: true },
      },
    },
  });

  if (!transaction) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  res.json(transaction);
});

// void a transaction
router.post("/:id/void", async (req, res) => {
  const idempotencyKey = req.headers["idempotency-key"] as string;
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key header required" });
  }

  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: "Reason required" });
  }

  const reversal = await voidTransaction(req.params.id, reason, idempotencyKey);

  res.json(reversal);
});

export default router;
