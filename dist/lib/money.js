"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSmallestUnit = toSmallestUnit;
exports.fromSmallestUnit = fromSmallestUnit;
exports.formatMoney = formatMoney;
const decimal_js_1 = __importDefault(require("decimal.js"));
decimal_js_1.default.set({ precision: 28, rounding: decimal_js_1.default.ROUND_HALF_UP });
// different currencies have different decimal places
const CURRENCY_DECIMALS = {
    USD: 2, // $10.50 → 1050
    NGN: 2, // ₦1000.00 → 100000
    GBP: 2, // £10.50 → 1050
    BTC: 8, // 0.00100000 → 100000 satoshis
    JPY: 0, // ¥100 → 100 (no decimals)
};
// convert display amount to storage units
function toSmallestUnit(amount, currency) {
    const decimals = CURRENCY_DECIMALS[currency] ?? 2;
    return BigInt(new decimal_js_1.default(amount).mul(Math.pow(10, decimals)).toFixed(0));
}
// convert storage units to display amount
function fromSmallestUnit(amount, currency) {
    const decimals = CURRENCY_DECIMALS[currency] ?? 2;
    return new decimal_js_1.default(amount.toString())
        .div(Math.pow(10, decimals))
        .toFixed(decimals);
}
function formatMoney(amount, currency) {
    const value = fromSmallestUnit(amount, currency);
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(parseFloat(value));
}
