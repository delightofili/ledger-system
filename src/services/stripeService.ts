import Stripe from "stripe";
import { stripe } from "../config/providers";

// ============================================
// CREATE PAYMENT INTENT
// ============================================
// Stripe's model is different from Paystack
// Instead of redirecting to a hosted page
// Stripe gives you a "PaymentIntent" — a record of intent to pay
// You embed Stripe's JS on your frontend to collect card details
// Card data goes directly from browser to Stripe — never your server

export interface CreatePaymentIntentInput {
  amount: number;
  // in cents
  currency: string;
  customerId?: string;
  // Stripe customer ID if you've created one
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export async function createPaymentIntent(input: CreatePaymentIntentInput) {
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: input.amount,
      currency: input.currency.toLowerCase(),
      // Stripe requires lowercase currency codes
      customer: input.customerId,
      automatic_payment_methods: { enabled: true },
      // let Stripe decide best payment method for the customer
      metadata: input.metadata || {},
    },
    {
      idempotencyKey: input.idempotencyKey,
      // Stripe supports idempotency keys natively
      // pass your key here and Stripe handles deduplication on their end too
    },
  );

  return {
    clientSecret: paymentIntent.client_secret!,
    // send this to your frontend
    // frontend uses it to complete payment with Stripe.js
    // the secret authorizes this specific payment only
    paymentIntentId: paymentIntent.id,
  };
}

// ============================================
// RETRIEVE PAYMENT INTENT
// ============================================

export async function getPaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

// ============================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================
// Same concept as Paystack but Stripe uses a different algorithm
// Stripe also includes a timestamp in the signature
// to prevent replay attacks (attacker recording and re-sending old webhooks)

export function constructStripeEvent(
  payload: Buffer,
  // raw buffer — must be raw bytes, not parsed
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    webhookSecret,
    // Stripe does the HMAC verification internally
    // throws an error if signature is invalid
    // we just need to catch that error
  );
}

// ============================================
// CREATE OR GET CUSTOMER
// ============================================
// Stripe customers let you store payment methods
// for recurring billing, saved cards etc

export async function getOrCreateStripeCustomer(
  email: string,
  userId: string,
): Promise<string> {
  // check if customer already exists
  const existing = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existing.data.length > 0) {
    return existing.data[0].id;
    // return existing customer ID
  }

  // create new customer
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
    // store your userId so you can find the customer later
  });

  return customer.id;
}

// ============================================
// LIST BALANCE TRANSACTIONS
// ============================================
// For reconciliation — same concept as Paystack settlements
// Stripe shows you every movement of money in your Stripe account

export async function listStripeBalanceTransactions(from?: Date, to?: Date) {
  const params: Stripe.BalanceTransactionListParams = {
    limit: 100,
    type: "charge",
    // only get charge events, not payouts or refunds
  };

  if (from) params.created = { gte: Math.floor(from.getTime() / 1000) };
  // Stripe uses Unix timestamps (seconds since 1970)
  // Date.getTime() returns milliseconds so divide by 1000

  if (to) {
    params.created = {
      ...(params.created as object),
      lte: Math.floor(to.getTime() / 1000),
    };
  }

  return stripe.balanceTransactions.list(params);
}
