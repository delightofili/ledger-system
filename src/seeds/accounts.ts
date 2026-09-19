import { prisma } from "../lib/prisma";

import { AccountType } from "../../generated/prisma";

const SYSTEM_ACCOUNTS = [
  {
    code: "1000",
    name: "Cash and Cash Equivalents",
    type: AccountType.ASSET,
    description: "Physical cash and bank balances",
  },
  {
    code: "1001",
    name: "Paystack Settlement Account",
    type: AccountType.ASSET,
    description: "Funds held by Paystack pending settlement",
  },
  {
    code: "1002",
    name: "Flutterwave Settlement Account",
    type: AccountType.ASSET,
    description: "Funds held by Flutterwave pending settlement",
  },
  {
    code: "2000",
    name: "User Wallet Liabilities",
    type: AccountType.LIABILITY,
    description: "Total amount owed to all users",
  },
  {
    code: "4000",
    name: "Transaction Fee Revenue",
    type: AccountType.REVENUE,
    description: "Revenue from transaction processing fees",
  },
  {
    code: "4001",
    name: "FX Spread Revenue",
    type: AccountType.REVENUE,
    description: "Revenue from foreign exchange spreads",
  },
  {
    code: "5000",
    name: "Payment Processing Expenses",
    type: AccountType.EXPENSE,
    description: "Fees paid to payment processors",
  },
];

export async function seedSystemAccounts() {
  for (const account of SYSTEM_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: account.code },
      create: { ...account, isSystem: true },
      update: {},
    });
  }
  console.log("System accounts seeded");
}
