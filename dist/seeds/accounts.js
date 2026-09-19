"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSystemAccounts = seedSystemAccounts;
const prisma_1 = require("../lib/prisma");
const prisma_2 = require("../../generated/prisma");
const SYSTEM_ACCOUNTS = [
    {
        code: "1000",
        name: "Cash and Cash Equivalents",
        type: prisma_2.AccountType.ASSET,
        description: "Physical cash and bank balances",
    },
    {
        code: "1001",
        name: "Paystack Settlement Account",
        type: prisma_2.AccountType.ASSET,
        description: "Funds held by Paystack pending settlement",
    },
    {
        code: "1002",
        name: "Flutterwave Settlement Account",
        type: prisma_2.AccountType.ASSET,
        description: "Funds held by Flutterwave pending settlement",
    },
    {
        code: "2000",
        name: "User Wallet Liabilities",
        type: prisma_2.AccountType.LIABILITY,
        description: "Total amount owed to all users",
    },
    {
        code: "4000",
        name: "Transaction Fee Revenue",
        type: prisma_2.AccountType.REVENUE,
        description: "Revenue from transaction processing fees",
    },
    {
        code: "4001",
        name: "FX Spread Revenue",
        type: prisma_2.AccountType.REVENUE,
        description: "Revenue from foreign exchange spreads",
    },
    {
        code: "5000",
        name: "Payment Processing Expenses",
        type: prisma_2.AccountType.EXPENSE,
        description: "Fees paid to payment processors",
    },
];
async function seedSystemAccounts() {
    for (const account of SYSTEM_ACCOUNTS) {
        await prisma_1.prisma.account.upsert({
            where: { code: account.code },
            create: { ...account, isSystem: true },
            update: {},
        });
    }
    console.log("System accounts seeded");
}
