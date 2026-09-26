import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
  typescript: true,
});

export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
export const PAYSTACK_BASE_URL = "https://api.paystack.co";

export const SYSTEM_ACCOUNTS = {
  CASH: process.env.CASH_ACCOUNT_ID!,
  PAYSTACK_FLOAT: process.env.PAYSTACK_FLOAT_ACCOUNT_ID!,

  STRIPE_FLOAT: process.env.STRIPE_FLOAT_ACCOUNT_ID!,
  FEE_REVENUE: process.env.FEE_REVENUE_ACCOUNT_ID!,
  PROCESSING_EXPENSE: process.env.PROCESSING_EXPENSE_ACCOUNT_ID!,
  USER_LIABILITIES: process.env.USER_LIABILITIES_ACCOUNT_ID!,
};
