import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getBalance, getStatement } from "../services/ledger";
import { fromSmallestUnit } from "../lib/money";
import { z } from "zod";

const router = Router();

const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  currency: z.string().length(3).default("USD"),
  description: z.string().optional(),
});

// create account
router.post("/", async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const account = await prisma.account.create({ data: parsed.data });
  res.status(201).json(account);
});

// get all accounts
router.get("/", async (req, res) => {
  const accounts = await prisma.account.findMany({
    orderBy: { code: "asc" },
  });
  res.json(accounts);
});

// get account balance
router.get("/:id/balance", async (req, res) => {
  const { id } = req.params;
  const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;

  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const balance = await getBalance(id, asOf);

  res.json({
    accountId: id,
    balance: balance.toString(),
    balanceFormatted: fromSmallestUnit(balance, account.currency),
    currency: account.currency,
    asOf: asOf || new Date(),
  });
});

// get account statement
router.get("/:id/statement", async (req, res) => {
  const { id } = req.params;
  const from = new Date((req.query.from as string) || new Date().setDate(1));
  const to = new Date((req.query.to as string) || new Date());

  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const statement = await getStatement(id, from, to);

  res.json({
    accountId: id,
    accountName: account.name,
    currency: account.currency,
    from,
    to,
    entries: statement.map(
      (e: {
        amount: bigint;
        runningBalance: bigint;
        [key: string]: unknown;
      }) => ({
        ...e,
        amountFormatted: fromSmallestUnit(e.amount, account.currency),
        runningBalanceFormatted: fromSmallestUnit(
          e.runningBalance,
          account.currency,
        ),
      }),
    ),
  });
});

export default router;
