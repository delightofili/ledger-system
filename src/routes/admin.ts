import { Router } from "express";
import { prisma } from "../lib/prisma";
import { fromSmallestUnit } from "../lib/money";

const router = Router();

router.get("/overview", async (req, res) => {
  const [
    totalAccounts,
    totalTransactions,
    totalPayments,
    recentTransactions,
    accountBalances,
  ] = await Promise.all([
    prisma.account.count(),

    prisma.transaction.count({ where: { status: "POSTED" } }),

    prisma.payment.groupBy({
      by: ["status"],
      _count: { id: true },
      _sum: { amount: true },
    }),

    prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        entries: {
          include: { account: { select: { name: true, type: true } } },
        },
      },
    }),

    // get balance of every system account
    prisma.$queryRaw<
      {
        name: string;
        code: string;
        type: string;
        currency: string;
        balance: bigint;
      }[]
    >`
      SELECT
        a.name,
        a.code,
        a.type,
        a.currency,
        COALESCE(SUM(
          CASE
            WHEN e.direction = 'DEBIT'  THEN e.amount
            WHEN e.direction = 'CREDIT' THEN -e.amount
          END
        ), 0)::bigint as balance
      FROM accounts a
      LEFT JOIN entries e ON e.account_id = a.id
      LEFT JOIN transactions t ON t.id = e.transaction_id AND t.status = 'POSTED'
      WHERE a.is_system = true
      GROUP BY a.id, a.name, a.code, a.type, a.currency
      ORDER BY a.code
    `,
  ]);

  res.json({
    summary: {
      totalAccounts,
      totalTransactions,
      payments: Object.fromEntries(
        totalPayments.map((p) => [
          p.status,
          {
            count: p._count.id,
            total: p._sum.amount?.toString() || "0",
          },
        ]),
      ),
    },
    systemAccounts: accountBalances.map((a) => ({
      name: a.name,
      code: a.code,
      type: a.type,
      balance: fromSmallestUnit(a.balance, a.currency),
      currency: a.currency,
    })),
    recentTransactions,
  });
});

//reconcilation alerts

router.get("/reconciliation-alerts", async (req, res) => {
  const alerts = await prisma.reconciliationAlert.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  res.json(alerts);
});

router.patch("/reconciliation-alerts/:id/resolve", async (req, res) => {
  const { notes, resolvedBy } = req.body;

  const alert = await prisma.reconciliationAlert.update({
    where: { id: req.params.id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy,
      notes,
    },
  });

  res.json(alert);
});

//fx rate management

router.post("/fx-rates", async (req, res) => {
  const { fromCurrency, toCurrency, rate } = req.body;

  // deactivate old rate
  await prisma.fxRate.updateMany({
    where: { fromCurrency, toCurrency, active: true },
    data: { active: false },
  });

  // create new rate
  const newRate = await prisma.fxRate.create({
    data: { fromCurrency, toCurrency, rate, active: true },
  });

  res.json(newRate);
});

router.get("/fx-rates", async (req, res) => {
  const rates = await prisma.fxRate.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(rates);
});

router.get("/webhook-events", async (req, res) => {
  const { processed, provider } = req.query;

  const events = await prisma.webhookEvent.findMany({
    where: {
      ...(processed !== undefined && {
        processed: processed === "true",
      }),
      ...(provider && { provider: provider as string }),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json(events);
});

// retry failed webhook
router.post("/webhook-events/:id/retry", async (req, res) => {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: req.params.id },
  });

  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.processed)
    return res.status(400).json({ error: "Already processed" });

  // reset error so it can be retried
  const updated = await prisma.webhookEvent.update({
    where: { id: req.params.id },
    data: { error: null },
  });

  res.json({ message: "Marked for retry", event: updated });
});

export default router;
