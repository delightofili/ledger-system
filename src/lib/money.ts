import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const CURRENCY_DECIMALS: Record<string, number> = {
  // fiat
  USD: 2,
  NGN: 2,
  GBP: 2,
  EUR: 2,
  JPY: 0,

  // stablecoins
  USDC: 6,

  USDT: 6,

  DAI: 18,

  ETH: 18,

  BTC: 8,

  MATIC: 18,
};

export function toSmallestUnit(amount: string, currency: string): bigint {
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === undefined) throw new Error(`Unknown currency: ${currency}`);

  return BigInt(
    new Decimal(amount).mul(new Decimal(10).pow(decimals)).toFixed(0),
  );
}

export function fromSmallestUnit(amount: bigint, currency: string): string {
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === undefined) throw new Error(`Unknown currency: ${currency}`);

  return new Decimal(amount.toString())
    .div(new Decimal(10).pow(decimals))
    .toFixed(decimals);
}

export function formatMoney(amount: bigint, currency: string): string {
  const value = fromSmallestUnit(amount, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(parseFloat(value));
}
