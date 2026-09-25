import { prisma } from "../lib/prisma";
import { postTransaction } from "./ledger";
import { initializePaystackPayment, verifyPaystackPayment } from "./paystack";
import {
  createPaymentIntent,
  getOrCreateStripeCustomer,
} from "./stripeService";
import { SYSTEM_ACCOUNTS } from "../config/providers";
import { toSmallestUnit } from "../lib/money";
import crypto from "crypto";
import { Prisma } from "../../generated/prisma";

export async function createPaystackDeposit(input: {
  userId: string;
  email: string;
  amount: string;

  currency: string;
  userAccountId: string;
}) {
  const amountInSmallestUnit = Number(
    toSmallestUnit(input.amount, input.currency),
  );

  const reference = `dep_${crypto.randomBytes(16).toString("hex")}`;

  const payment = await prisma.payment.create({
    data: {
      reference,
      provider: "PAYSTACK",
      status: "PENDING",
      amount: BigInt(amountInSmallestUnit),
      currency: input.currency,
      userId: input.userId,
      accountId: input.userAccountId,
      metadata: { email: input.email },
    },
  });

  const paystackSession = await initializePaystackPayment({
    email: input.email,
    amount: amountInSmallestUnit,
    currency: input.currency,
    reference,

    metadata: {
      userId: input.userId,
      paymentId: payment.id,
      userAccountId: input.userAccountId,
    },
    callbackUrl: `${process.env.APP_URL}/payments/verify?reference=${reference}`,
  });

  return {
    paymentId: payment.id,
    reference,
    authorizationUrl: paystackSession.authorization_url,
  };
}

export async function processPaystackSuccess(
  reference: string,
  webhookPayload: Prisma.InputJsonObject,
) {
  // find the payment record
  const payment = await prisma.payment.findUnique({ where: { reference } });

  if (!payment) {
    throw new Error(`Payment not found for reference: ${reference}`);
  }

  if (payment.status === "SUCCESS") {
    // already processed — idempotent return
    return payment;
  }

  const verification = await verifyPaystackPayment(reference);

  if (verification.status !== "success") {
    await prisma.payment.update({
      where: { reference },
      data: { status: "FAILED", webhookPayload },
    });
    throw new Error(`Payment verification failed: ${verification.status}`);
  }

  const grossAmount = BigInt(verification.amount);
  // total amount customer paid in kobo
  const fees = BigInt(verification.fees || 0);
  // Paystack's cut in kobo
  const netAmount = grossAmount - fees;
  // what actually goes into my float account after fees

  // Now I post to ledger using a database transaction
  // everything below must succeed together or all roll back
  return prisma.$transaction(async (tx) => {
    const ledgerTxn = await postTransaction({
      idempotencyKey: `paystack-success-${reference}`,
      description: `Paystack deposit ${reference}`,
      entries: [
        {
          accountId: SYSTEM_ACCOUNTS.PAYSTACK_FLOAT,
          direction: "DEBIT",
          amount: netAmount,
          currency: verification.currency,
        },
        {
          accountId: SYSTEM_ACCOUNTS.PROCESSING_EXPENSE,
          direction: "DEBIT",
          amount: fees,
          currency: verification.currency,
        },
        {
          accountId: payment.accountId!,
          direction: "CREDIT",
          amount: grossAmount,
          currency: verification.currency,
        },
      ],
      metadata: {
        paystackReference: reference,
        providerRef: verification.reference,
        userId: payment.userId,
      },
    });

    // update payment record
    const updated = await tx.payment.update({
      where: { reference },
      data: {
        status: "SUCCESS",
        providerRef: verification.reference,
        fees,
        netAmount,
        transactionId: (ledgerTxn as { id: string }).id,
        webhookPayload,
      },
    });

    return updated;
  });
}

export async function processPaystackSettlement(input: {
  settlementId: number;
  amount: number;

  currency: string;
  settledAt: Date;
}) {
  const idempotencyKey = `settlement-paystack-${input.settlementId}`;

  return postTransaction({
    idempotencyKey,
    description: `Paystack settlement ${input.settlementId}`,
    entries: [
      {
        accountId: SYSTEM_ACCOUNTS.CASH,
        direction: "DEBIT",
        amount: BigInt(input.amount),
        currency: input.currency,
      },
      {
        accountId: SYSTEM_ACCOUNTS.PAYSTACK_FLOAT,
        direction: "CREDIT",
        amount: BigInt(input.amount),
        currency: input.currency,
      },
    ],
    metadata: {
      settlementId: input.settlementId,
      settledAt: input.settledAt.toISOString(),
    },
  });
}

export async function createStripeDeposit(input: {
  userId: string;
  email: string;
  amount: string;
  currency: string;
  userAccountId: string;
}) {
  const amountInCents = Number(toSmallestUnit(input.amount, input.currency));

  const customerId = await getOrCreateStripeCustomer(input.email, input.userId);

  const reference = `dep_stripe_${crypto.randomBytes(16).toString("hex")}`;

  // save payment first
  const payment = await prisma.payment.create({
    data: {
      reference,
      provider: "STRIPE",
      status: "PENDING",
      amount: BigInt(amountInCents),
      currency: input.currency,
      userId: input.userId,
      accountId: input.userAccountId,
      metadata: { email: input.email, stripeCustomerId: customerId },
    },
  });

  const intent = await createPaymentIntent({
    amount: amountInCents,
    currency: input.currency,
    customerId,
    idempotencyKey: reference,
    metadata: {
      paymentId: payment.id,
      userId: input.userId,
      userAccountId: input.userAccountId,
      reference,
    },
  });

  return {
    paymentId: payment.id,
    reference,
    clientSecret: intent.clientSecret,
  };
}
