"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const ledger_1 = require("../services/ledger");
const money_1 = require("../lib/money");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const entrySchema = zod_1.z.object({
    accountId: zod_1.z.string().uuid(),
    direction: zod_1.z.enum(["DEBIT", "CREDIT"]),
    amount: zod_1.z.string(),
    // string to avoid JS float issues
    currency: zod_1.z.string().length(3),
});
const postTransactionSchema = zod_1.z.object({
    description: zod_1.z.string().min(1),
    entries: zod_1.z.array(entrySchema).min(2),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
// post a transaction
router.post("/", async (req, res) => {
    const idempotencyKey = req.headers["idempotency-key"];
    if (!idempotencyKey) {
        return res.status(400).json({
            error: "Idempotency-Key header required",
        });
    }
    const parsed = postTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const transaction = await (0, ledger_1.postTransaction)({
        idempotencyKey,
        description: parsed.data.description,
        entries: parsed.data.entries.map((e) => ({
            accountId: e.accountId,
            direction: e.direction,
            amount: (0, money_1.toSmallestUnit)(e.amount, e.currency),
            currency: e.currency,
        })),
        metadata: parsed.data.metadata,
    });
    res.status(201).json(transaction);
});
// get transaction
router.get("/:id", async (req, res) => {
    const transaction = await prisma_1.prisma.transaction.findUnique({
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
    const idempotencyKey = req.headers["idempotency-key"];
    if (!idempotencyKey) {
        return res.status(400).json({ error: "Idempotency-Key header required" });
    }
    const { reason } = req.body;
    if (!reason) {
        return res.status(400).json({ error: "Reason required" });
    }
    const reversal = await (0, ledger_1.voidTransaction)(req.params.id, reason, idempotencyKey);
    res.json(reversal);
});
exports.default = router;
