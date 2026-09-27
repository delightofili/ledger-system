import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { publishEvent, TOPICS } from "../lib/kafka";

async function checkBalanceSheet(): Promise<{
  assets: bigint;
  liabilities: bigint;
  equity: bigint;
  revenue: bigint;
  expenses: bigint;
  balanced: boolean;
}> {
  const result = await prisma.$queryRaw<
    {
      type: string;
      balance: bigint;
    }[]
  >`
    SELECT
      a.type,
      COALESCE(SUM(
        CASE
          WHEN e.direction = 'DEBIT'  THEN e.amount
          WHEN e.direction = 'CREDIT' THEN -e.amount
        END
      ), 0)::bigint as balance
    FROM accounts a
    LEFT JOIN entries e ON e.account_id = a.id
    LEFT JOIN transactions t ON t.id = e.transaction_id
    WHERE t.status = 'POSTED' OR t.id IS NULL
    GROUP BY a.type
  `;

  const balances = result.reduce(
    (acc, row) => {
      acc[row.type.toLowerCase()] = row.balance;
      return acc;
    },
    {} as Record<string, bigint>,
  );

  const assets = balances["asset"] || 0n;
  const liabilities = balances["liability"] || 0n;
  const equity = balances["equity"] || 0n;
  const revenue = balances["revenue"] || 0n;
  const expenses = balances["expense"] || 0n;

  // accounting equation check
  // Assets = Liabilities + Equity + (Revenue - Expenses)
  const rightSide = liabilities + equity + revenue - expenses;
  const balanced = assets === rightSide;

  return { assets, liabilities, equity, revenue, expenses, balanced };
}

// PAYMENT RECONCILIATION

async function reconcilePayments(): Promise<{
  checked: number;
  missingLedgerEntry: number;
  discrepancies: string[];
}> {
  const successPayments = await prisma.payment.findMany({
    where: {
      status: "SUCCESS",
      transactionId: null,
    },
  });

  return {
    checked: await prisma.payment.count({ where: { status: "SUCCESS" } }),
    missingLedgerEntry: successPayments.length,
    discrepancies: successPayments.map((p) => p.reference),
  };
}

export function startReconciliationJobs() {
  // Balance sheet check — every hour
  cron.schedule("0 * * * *", async () => {
    console.log("Running balance sheet reconciliation...");

    try {
      const result = await checkBalanceSheet();

      if (!result.balanced) {
        console.error("CRITICAL: Balance sheet does not balance!");
        console.error(result);

        await publishEvent(TOPICS.RECONCILIATION_ALERT, {
          type: "BALANCE_SHEET_IMBALANCE",
          severity: "CRITICAL",
          details: {
            assets: result.assets.toString(),
            liabilities: result.liabilities.toString(),
            equity: result.equity.toString(),
            revenue: result.revenue.toString(),
            expenses: result.expenses.toString(),
          },
        });
      } else {
        console.log("Balance sheet: OK ✓");
        console.log(`  Assets:      ${result.assets}`);
        console.log(`  Liabilities: ${result.liabilities}`);
        console.log(`  Revenue:     ${result.revenue}`);
      }
    } catch (error) {
      console.error("Balance sheet check failed:", error);
    }
  });

  // Payment reconciliation — every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log("Running payment reconciliation...");

    try {
      const result = await reconcilePayments();

      if (result.missingLedgerEntry > 0) {
        console.error(
          `ALERT: ${result.missingLedgerEntry} payments missing ledger entries`,
        );
        console.error("References:", result.discrepancies);

        await publishEvent(TOPICS.RECONCILIATION_ALERT, {
          type: "MISSING_LEDGER_ENTRIES",
          severity: "HIGH",
          count: result.missingLedgerEntry,
          references: result.discrepancies,
        });
      } else {
        console.log(`Payment reconciliation: OK ✓ (${result.checked} checked)`);
      }
    } catch (error) {
      console.error("Payment reconciliation failed:", error);
    }
  });

  console.log("Reconciliation cron jobs started");
}
