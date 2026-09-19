import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  NGN: 2,
  GBP: 2,
  BTC: 8,
  JPY: 0,
};

// convert display amount to storage units
export function toSmallestUnit(
  amount: string | number,
  currency: string,
): bigint {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return BigInt(new Decimal(amount).mul(Math.pow(10, decimals)).toFixed(0));
}

// convert storage units to display amount
export function fromSmallestUnit(amount: bigint, currency: string): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return new Decimal(amount.toString())
    .div(Math.pow(10, decimals))
    .toFixed(decimals);
}

export function formatMoney(amount: bigint, currency: string): string {
  const value = fromSmallestUnit(amount, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(parseFloat(value));
}
