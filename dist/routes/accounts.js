"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const ledger_1 = require("../services/ledger");
const money_1 = require("../lib/money");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const createAccountSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    code: zod_1.z.string().min(1).max(50),
    type: zod_1.z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
    currency: zod_1.z.string().length(3).default("USD"),
    description: zod_1.z.string().optional(),
});
// create account
router.post("/", async (req, res) => {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const account = await prisma_1.prisma.account.create({ data: parsed.data });
    res.status(201).json(account);
});
// get all accounts
router.get("/", async (req, res) => {
    const accounts = await prisma_1.prisma.account.findMany({
        orderBy: { code: "asc" },
    });
    res.json(accounts);
});
// get account balance
router.get("/:id/balance", async (req, res) => {
    const { id } = req.params;
    const asOf = req.query.asOf ? new Date(req.query.asOf) : undefined;
    const account = await prisma_1.prisma.account.findUnique({ where: { id } });
    if (!account)
        return res.status(404).json({ error: "Account not found" });
    const balance = await (0, ledger_1.getBalance)(id, asOf);
    res.json({
        accountId: id,
        balance: balance.toString(),
        balanceFormatted: (0, money_1.fromSmallestUnit)(balance, account.currency),
        currency: account.currency,
        asOf: asOf || new Date(),
    });
});
// get account statement
router.get("/:id/statement", async (req, res) => {
    const { id } = req.params;
    const from = new Date(req.query.from || new Date().setDate(1));
    const to = new Date(req.query.to || new Date());
    const account = await prisma_1.prisma.account.findUnique({ where: { id } });
    if (!account)
        return res.status(404).json({ error: "Account not found" });
    const statement = await (0, ledger_1.getStatement)(id, from, to);
    res.json({
        accountId: id,
        accountName: account.name,
        currency: account.currency,
        from,
        to,
        entries: statement.map((e) => ({
            ...e,
            amountFormatted: (0, money_1.fromSmallestUnit)(e.amount, account.currency),
            runningBalanceFormatted: (0, money_1.fromSmallestUnit)(e.runningBalance, account.currency),
        })),
    });
});
exports.default = router;
