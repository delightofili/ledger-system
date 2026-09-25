import { voidTransaction } from "../services/ledger";
import { refundPaystackTransaction } from "../services/paystack";
import { SYSTEM_ACCOUNTS } from "../config/providers";
import { postTransaction } from "../services/ledger";
import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.post("/:reference/refund", async (req, res) => {
  try {
    const { reference } = req.params;
    const { amount } = req.body;
    // amount is optional — if not provided, full refund

    // STEP 1 — find the payment
    const payment = await prisma.payment.findUnique({
      where: { reference },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // STEP 2 — must be SUCCESS to refund
    if (payment.status !== "SUCCESS") {
      return res.status(400).json({
        error: `Cannot refund a payment with status: ${payment.status}`,
        // can only refund successful payments
        // pending/failed payments were never charged
      });
    }

    if (!payment.providerRef) {
      return res.status(400).json({
        error: "Payment has no provider reference — cannot refund",
      });
    }

    // STEP 3 — determine refund amount
    const refundAmount = amount
      ? Number(BigInt(amount))
      : Number(payment.amount);
    // if amount provided use it, otherwise full refund
    // Paystack expects kobo (smallest unit)

    const isPartialRefund = refundAmount < Number(payment.amount);

    // STEP 4 — call Paystack refund API
    let paystackRefund;
    try {
      paystackRefund = await refundPaystackTransaction({
        transaction: payment.providerRef,
        amount: isPartialRefund ? refundAmount : undefined,
        // for full refund don't send amount — let Paystack handle it
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Paystack refund failed";
      return res.status(502).json({
        error: `Paystack refund failed: ${message}`,
      });
    }

    // STEP 5 — calculate fee recovery
    // Paystack may or may not refund the processing fee
    // depends on your Paystack plan
    const feeRefunded = paystackRefund.fees_split?.paystack
      ? BigInt(paystackRefund.fees_split.paystack)
      : 0n;
    // if fees_split is null or paystack portion is 0
    // means Paystack kept the fee — common on basic plans

    const refundAmountBigInt = BigInt(refundAmount);
    const grossAmount = refundAmountBigInt;
    // what leaves user's wallet
    const netAmount = refundAmountBigInt - BigInt(payment.fees || 0n);
    // what goes back to Paystack float
    // net = gross minus fees (fees stay with Paystack unless refunded)

    // STEP 6 — post reversal to ledger
    // The refund double-entry is the EXACT reverse of the deposit:
    //
    // Original deposit was:
    //   DEBIT  paystack_float       net_amount   (you received money)
    //   DEBIT  processing_expense   fees         (you paid fees)
    //   CREDIT user_wallet          gross_amount (user got credited)
    //
    // Refund reversal:
    //   DEBIT  user_wallet          gross_amount (remove from user)
    //   CREDIT paystack_float       net_amount   (money goes back to Paystack)
    //   CREDIT processing_expense   fees         (fees recovered IF refunded)
    //
    // If fees NOT refunded:
    //   DEBIT  user_wallet          gross_amount (remove from user)
    //   CREDIT paystack_float       gross_amount (full amount back to Paystack)
    //   — no processing_expense entry because fee wasn't recovered

    const idempotencyKey = `refund-${reference}-${crypto.randomBytes(8).toString("hex")}`;

    let ledgerTransaction;

    if (feeRefunded > 0n) {
      // Paystack refunded the fee — three entries
      ledgerTransaction = await postTransaction({
        idempotencyKey,
        description: `Refund for payment ${reference}`,
        entries: [
          {
            accountId: payment.accountId!,
            direction: "DEBIT",
            amount: grossAmount,
            currency: payment.currency,
            // remove gross amount from user's wallet
          },
          {
            accountId: SYSTEM_ACCOUNTS.PAYSTACK_FLOAT,
            direction: "CREDIT",
            amount: netAmount,
            currency: payment.currency,
            // net amount goes back to Paystack
          },
          {
            accountId: SYSTEM_ACCOUNTS.PROCESSING_EXPENSE,
            direction: "CREDIT",
            amount: feeRefunded,
            currency: payment.currency,
            // fee recovered — reduces our expense account
          },
        ],
        metadata: {
          type: "refund",
          originalReference: reference,
          paystackRefundId: paystackRefund.id,
        },
      });
    } else {
      // Paystack kept the fee — two entries only
      // user loses full amount, platform absorbs the fee loss
      ledgerTransaction = await postTransaction({
        idempotencyKey,
        description: `Refund for payment ${reference} (fee non-refundable)`,
        entries: [
          {
            accountId: payment.accountId!,
            direction: "DEBIT",
            amount: grossAmount,
            currency: payment.currency,
            // full amount leaves user wallet
          },
          {
            accountId: SYSTEM_ACCOUNTS.PAYSTACK_FLOAT,
            direction: "CREDIT",
            amount: grossAmount,
            currency: payment.currency,
            // full amount credited to Paystack float
            // even though Paystack won't actually give us the fee back
            // the float account will reconcile when settlement comes
          },
        ],
        metadata: {
          type: "refund",
          originalReference: reference,
          paystackRefundId: paystackRefund.id,
          feeNotRefunded: Number(payment.fees),
          // record the lost fee for reporting
        },
      });
    }

    // STEP 7 — update payment status
    const updated = await prisma.payment.update({
      where: { reference },
      data: {
        status: "REFUNDED",
        metadata: {
          ...((payment.metadata as object) || {}),
          refundedAt: new Date().toISOString(),
          paystackRefundId: paystackRefund.id,
          refundAmount,
          feeRefunded: Number(feeRefunded),
          ledgerTransactionId: (ledgerTransaction as { id: string }).id,
        },
      },
    });

    return res.json({
      success: true,
      payment: updated,
      refund: {
        paystackRefundId: paystackRefund.id,
        amount: refundAmount,
        feeRefunded: Number(feeRefunded),
        status: paystackRefund.status,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Refund failed";
    console.error("Refund error:", message);
    return res.status(500).json({ error: message });
  }
});
