import axios from "axios";
import crypto from "crypto";
import { PAYSTACK_BASE_URL, PAYSTACK_SECRET_KEY } from "../config/providers";

const paystackClient = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,

    "Content-Type": "application/json",
  },
});

// ============================================
// INITIALIZE TRANSACTION
// ============================================
// This creates a payment session
// Returns a URL you send the customer to
// Paystack hosts the payment page — you never handle card data

export interface InitializePaymentInput {
  email: string;
  amount: number;
  // amount in kobo (NGN) or cents (USD) — smallest unit
  currency?: string;
  reference: string;
  // YOUR unique reference for this payment
  // you generate this, not Paystack
  // used to match webhook back to your record
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
  // where to redirect user after payment on Paystack's page
}

export async function initializePaystackPayment(input: InitializePaymentInput) {
  const response = await paystackClient.post("/transaction/initialize", {
    email: input.email,
    amount: input.amount,
    currency: input.currency || "NGN",
    reference: input.reference,
    metadata: input.metadata,
    callback_url: input.callbackUrl,
  });

  return response.data.data as {
    authorization_url: string;
    // send user to this URL — they pay here
    access_code: string;
    // short code for Paystack inline popup
    reference: string;
    // echoes back your reference
  };
}

// ============================================
// VERIFY TRANSACTION
// ============================================
// After payment, you ALWAYS verify server-side
// Never trust what the frontend tells you
// The frontend can be tampered with
// The Paystack server cannot

export async function verifyPaystackPayment(reference: string) {
  const response = await paystackClient.get(`/transaction/verify/${reference}`);

  return response.data.data as {
    status: "success" | "failed" | "abandoned";
    reference: string;
    amount: number;
    // amount in kobo — divide by 100 for NGN value
    currency: string;
    customer: { email: string; id: number };
    fees: number;
    // Paystack's fee for this transaction in kobo
    // important for your expense ledger posting
    paid_at: string;
    metadata: Record<string, unknown>;
  };
}

// ============================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================
// When Paystack sends a webhook to your server
// anyone could send a fake webhook claiming a payment succeeded
// Paystack signs every webhook with your secret key
// You verify the signature to confirm it's really from Paystack

export function verifyPaystackSignature(
  payload: string,
  // raw request body as a string — must be raw, not parsed JSON
  signature: string,
  // value of x-paystack-signature header
): boolean {
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    // HMAC = Hash-based Message Authentication Code
    // it's a way of creating a signature using a shared secret
    // Paystack creates it with your secret key
    // you recreate it with the same key
    // if they match — the webhook is authentic
    .update(payload)
    .digest("hex");

  return hash === signature;
  // timing-safe comparison would be better in production:
  // return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  // prevents timing attacks where attacker guesses signature byte by byte
}

// ============================================
// LIST SETTLEMENTS
// ============================================
// Paystack batches your daily payments and sends
// one bank transfer to your account (settlement)
// You need to record when this happens in your ledger

export async function listPaystackSettlements(from?: Date, to?: Date) {
  const params = new URLSearchParams();
  if (from) params.append("from", from.toISOString());
  if (to) params.append("to", to.toISOString());

  const response = await paystackClient.get(`/settlement?${params.toString()}`);

  return response.data.data as Array<{
    id: number;
    domain: string;
    status: string;
    currency: string;
    total_amount: number;
    // total gross amount across all transactions in this settlement
    effective_amount: number;
    // net amount after Paystack fees
    total_fees: number;
    // total fees Paystack deducted
    settled_by: string;
    settlement_date: string;
    // when funds hit your bank account
  }>;
}

export interface RefundInput {
  transaction: string;
  // providerRef — Paystack's own transaction reference
  amount?: number;
  // optional — if not provided, full refund
  // in kobo (smallest unit)
}

export async function refundPaystackTransaction(input: RefundInput) {
  const response = await paystackClient.post("/refund", {
    transaction: input.transaction,
    amount: input.amount,
    // if amount is undefined Paystack does a full refund
  });

  return response.data.data as {
    id: number;
    // Paystack's refund ID
    transaction: {
      id: number;
      reference: string;
      amount: number;
      // original transaction amount in kobo
      fees: number;
      // original fees in kobo
    };
    amount: number;
    // refund amount in kobo
    currency: string;
    status: string;
    // pending, processing, processed, failed
    refunded_at: string | null;
    // null if not yet processed
    refunded_by: string;
    // who initiated the refund
    merchant_note: string;
    customer_note: string;
    fees_split: {
      paystack: number;
      // how much of the original fee Paystack is refunding
      // this is 0 if your plan doesn't refund fees
      integration: number;
    } | null;
  };
}
