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

  {
    code: "1003",
    name: "Paystack Float",
    type: AccountType.ASSET,
    description: "Funds collected by Paystack not yet settled to our bank",
  },
  {
    code: "1004",
    name: "Stripe Float",
    type: AccountType.ASSET,
    description: "Funds collected by Stripe not yet settled to our bank",
  },
  {
    code: "5001",
    name: "Paystack Processing Fees",
    type: AccountType.EXPENSE,
    description: "Fees paid to Paystack per transaction",
  },
  {
    code: "5002",
    name: "Stripe Processing Fees",
    type: AccountType.EXPENSE,
    description: "Fees paid to Stripe per transaction",
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

const CRYPTO_ACCOUNTS = [
  // ASSET accounts
  {
    code: "1010",
    name: "USDC Hot Wallet",
    type: "ASSET",
    currency: "USDC",
    description: "USDC held in platform hot wallet for immediate payouts",
  },
  {
    code: "1011",
    name: "USDT Hot Wallet",
    type: "ASSET",
    currency: "USDT",
    description: "USDT held in platform hot wallet",
  },
  {
    code: "1012",
    name: "ETH Hot Wallet",
    type: "ASSET",
    currency: "ETH",
    description: "ETH held for gas fees",
  },

  // LIABILITY accounts
  {
    code: "2010",
    name: "User USDC Balances",
    type: "LIABILITY",
    currency: "USDC",
    description: "Total USDC owed to all users",
  },
  {
    code: "2011",
    name: "User USDT Balances",
    type: "LIABILITY",
    currency: "USDT",
    description: "Total USDT owed to all users",
  },
];
