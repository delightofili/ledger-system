import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "../../generated/prisma";
import {
  verifyPaystackSignature,
  verifyPaystackPayment,
} from "../services/paystack";
import { constructStripeEvent } from "../services/stripeService";
import {
  processPaystackSuccess,
  processPaystackSettlement,
} from "../services/payment";

const router = Router();

router.post("/paystack", async (req: Request, res: Response) => {
  const signature = req.headers["x-paystack-signature"] as string;
  const rawBody = req.body as Buffer;

  if (!signature) {
    return res.status(400).json({ error: "Missing signature" });
  }

  const isValid = verifyPaystackSignature(rawBody.toString(), signature);
  if (!isValid) {
    console.error("Invalid Paystack webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString());

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { eventId: event.data?.reference || event.data?.id?.toString() },
  });

  if (existingEvent?.processed) {
    console.log(`Duplicate webhook: ${event.event} already processed`);
    return res.status(200).json({ message: "Already processed" });
  }

  const webhookRecord = await prisma.webhookEvent.create({
    data: {
      provider: "paystack",
      eventType: event.event,
      eventId: event.data?.reference || `paystack-${Date.now()}`,
      payload: event,
    },
  });

  res.status(200).json({ message: "Webhook received" });

  try {
    switch (event.event) {
      case "charge.success":
        await processPaystackSuccess(event.data.reference, event);
        break;

      case "transfer.success":
        // a payout initiated succeeded
        console.log("Transfer succeeded:", event.data.reference);
        break;

      case "transfer.failed":
        // a payout initiated failed
        console.error("Transfer failed:", event.data.reference);
        break;

      case "settlement":
        // Paystack is settling funds to bank
        await processPaystackSettlement({
          settlementId: event.data.id,
          amount: event.data.effective_amount,
          currency: event.data.currency,
          settledAt: new Date(event.data.settlement_date),
        });
        break;

      default:
        console.log(`Unhandled Paystack event: ${event.event}`);
    }

    // mark as processed
    await prisma.webhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processed: true, processedAt: new Date() },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Webhook processing failed: ${message}`);

    await prisma.webhookEvent.update({
      where: { id: webhookRecord.id },
      data: { error: message },
    });
  }
});

router.post(
  "/stripe",

  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;
    const rawBody = req.body as Buffer;

    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    let event;
    try {
      event = constructStripeEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Signature verification failed";
      console.error("Stripe webhook signature failed:", message);
      return res.status(401).json({ error: message });
    }

    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existingEvent?.processed) {
      return res.status(200).json({ message: "Already processed" });
    }

    const webhookRecord = await prisma.webhookEvent.create({
      data: {
        provider: "stripe",
        eventType: event.type,
        eventId: event.id,
        payload: event as unknown as Prisma.InputJsonValue,
      },
    });

    res.status(200).json({ received: true });

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;
          const reference = paymentIntent.metadata?.reference;

          if (!reference) {
            throw new Error("No reference in payment intent metadata");
          }

          const payment = await prisma.payment.findUnique({
            where: { reference },
          });

          if (!payment || payment.status === "SUCCESS") break;

          const grossAmount = BigInt(paymentIntent.amount);
          const stripeFee = BigInt(
            Math.round(paymentIntent.amount * 0.029 + 30),
          );

          const netAmount = grossAmount - stripeFee;

          const { postTransaction } = await import("../services/ledger");
          const { SYSTEM_ACCOUNTS } = await import("../config/providers");

          await postTransaction({
            idempotencyKey: `stripe-success-${event.id}`,
            description: `Stripe deposit ${reference}`,
            entries: [
              {
                accountId: SYSTEM_ACCOUNTS.STRIPE_FLOAT,
                direction: "DEBIT",
                amount: netAmount,
                currency: paymentIntent.currency.toUpperCase(),
              },
              {
                accountId: SYSTEM_ACCOUNTS.PROCESSING_EXPENSE,
                direction: "DEBIT",
                amount: stripeFee,
                currency: paymentIntent.currency.toUpperCase(),
              },
              {
                accountId: payment.accountId!,
                direction: "CREDIT",
                amount: grossAmount,
                currency: paymentIntent.currency.toUpperCase(),
              },
            ],
            metadata: {
              stripePaymentIntentId: paymentIntent.id,
              reference,
            },
          });

          await prisma.payment.update({
            where: { reference },
            data: {
              status: "SUCCESS",
              providerRef: paymentIntent.id,
              fees: stripeFee,
              netAmount,
              webhookPayload: event as unknown as Prisma.InputJsonValue,
            },
          });
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object;
          const reference = paymentIntent.metadata?.reference;

          if (reference) {
            await prisma.payment.update({
              where: { reference },
              data: { status: "FAILED" },
            });
          }
          break;
        }

        case "charge.refunded": {
          console.log("Charge refunded:", event.data.object);
          // handle refund — reverse the ledger entries
          break;
        }

        default:
          console.log(`Unhandled Stripe event: ${event.type}`);
      }

      await prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: { processed: true, processedAt: new Date() },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Stripe webhook processing failed:`, message);
      await prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: { error: message },
      });
    }
  },
);

export default router;
