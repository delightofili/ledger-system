import { prisma } from "../lib/prisma";
import { postTransaction } from "./ledger";
import { publishEvent, TOPICS } from "../lib/kafka";
import { toSmallestUnit, fromSmallestUnit } from "../lib/money";
import Decimal from "decimal.js";

export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<Decimal> {
  if (fromCurrency === toCurrency) return new Decimal(1);

  const rate = await prisma.fxRate.findFirst({
    where: {
      fromCurrency,
      toCurrency,
      active: true,
    },
    orderBy: { createdAt: "desc" },
    // get most recent active rate
  });

  if (!rate) {
    throw new Error(`No FX rate found for ${fromCurrency}/${toCurrency}`);
  }

  return new Decimal(rate.rate.toString());
}

interface FXConversionInput {
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  // display amount e.g. "100.00"
  spreadPercent?: number;
  // platform markup e.g. 1.5 = 1.5%
  // this is how you make money on FX
  idempotencyKey: string;
}

export async function convertCurrency(input: FXConversionInput) {
  const spreadPercent = input.spreadPercent ?? 1.5;
  // default 1.5% spread

  // get mid-market rate
  const midRate = await getExchangeRate(input.fromCurrency, input.toCurrency);

  const spreadMultiplier = new Decimal(1).minus(
    new Decimal(spreadPercent).div(100),
  );
  const customerRate = midRate.mul(spreadMultiplier);

  const fromAmountSmallest = toSmallestUnit(
    input.fromAmount,
    input.fromCurrency,
  );
  const fromAmountDecimal = new Decimal(fromAmountSmallest.toString());

  // calculate to amount using customer rate
  const toAmountDecimal = fromAmountDecimal.mul(customerRate);
  const toAmountSmallest = BigInt(toAmountDecimal.toFixed(0));

  // calculate spread revenue
  const midRateAmount = fromAmountDecimal.mul(midRate);
  const spreadRevenue = BigInt(
    midRateAmount.minus(toAmountDecimal).abs().toFixed(0),
  );
  // revenue = what customer should get at mid-rate minus what they actually get

  // post the ledger entries
  // From account debited, To account credited, FX revenue captured!!!!...
  const transaction = await postTransaction({
    idempotencyKey: input.idempotencyKey,
    description: `FX: ${input.fromAmount} ${input.fromCurrency} → ${input.toCurrency}`,
    entries: [
      {
        accountId: input.fromAccountId,
        direction: "DEBIT",
        amount: fromAmountSmallest,
        currency: input.fromCurrency,
        // debit from source account
      },
      {
        accountId: input.toAccountId,
        direction: "CREDIT",
        amount: toAmountSmallest,
        currency: input.toCurrency,
        // credit to destination account (at customer rate)
      },
      {
        accountId: process.env.FX_SPREAD_REVENUE_ACCOUNT_ID!,
        direction: "CREDIT",
        amount: spreadRevenue,
        currency: input.toCurrency,
        // spread revenue stays with platform
      },
    ],
    metadata: {
      fxConversion: true,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      midRate: midRate.toString(),
      customerRate: customerRate.toString(),
      spreadPercent,
      userId: input.userId,
    },
  });

  // publish FX event
  await publishEvent(
    TOPICS.FX_CONVERSION,
    {
      userId: input.userId,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      fromAmount: input.fromAmount,
      toAmount: fromSmallestUnit(toAmountSmallest, input.toCurrency),
      midRate: midRate.toString(),
      customerRate: customerRate.toString(),
      spreadRevenue: fromSmallestUnit(spreadRevenue, input.toCurrency),
      transactionId: (transaction as { id: string }).id,
    },
    input.userId,
  );

  return {
    transaction,
    conversion: {
      fromAmount: input.fromAmount,
      fromCurrency: input.fromCurrency,
      toAmount: fromSmallestUnit(toAmountSmallest, input.toCurrency),
      toCurrency: input.toCurrency,
      rate: customerRate.toFixed(6),
      spreadPercent,
      spreadRevenue: fromSmallestUnit(spreadRevenue, input.toCurrency),
    },
  };
}
