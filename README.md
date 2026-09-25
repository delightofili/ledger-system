# Delightsomee's Double-Entry Accounting Ledger System (Nexus Ledger)

An enterprise-grade financial backend demonstrating senior-level
fintech engineering. Built from scratch across three phases —
double-entry bookkeeping, payment provider integration,
and crypto/Web3 infrastructure.

---

## What this is

Most payment systems store a single `balance` column and mutate it
on every transaction. This creates race conditions, audit gaps,
and legal liability. Nexus Ledger is built the way real financial
systems are built — with double-entry bookkeeping, immutable records,
idempotency guarantees, and automated reconciliation.

---

## Architecture

┌─────────────────────────────────────────────────────────┐
│ REST API (Express) │
├──────────────┬──────────────┬──────────────┬────────────┤
│ Accounts │ Transactions │ Payments │ Crypto │
│ /accounts │ /transactions│ /payments │ /users │
├──────────────┴──────────────┴──────────────┴────────────┤
│ Core Ledger Engine │
│ postTransaction() getBalance() voidTransaction() │
├─────────────────────────────────────────────────────────┤
│ PostgreSQL (Neon) via Prisma ORM │
├──────────────────────────┬──────────────────────────────┤
│ Payment Providers │ Ethereum / ERC-20 │
│ Paystack Stripe │ ethers.js Alchemy │
└──────────────────────────┴──────────────────────────────┘

---

## Technical decisions and why

### Money stored as BigInt, never DECIMAL or FLOAT

```ts
// wrong — floating point corruption
0.1 + 0.2 === 0.30000000000000004;

// correct — integer arithmetic is always exact
1000n + 2000n === 3000n; // represents $10.00 + $20.00 = $30.00
```

Every currency amount is stored in its smallest unit.
USD in cents, NGN in kobo, USDC in 10^6 units, ETH in wei.
Display values are computed at read time, never stored.

### Double-entry bookkeeping

Every transaction creates at least two entries that must balance to zero.
It is mathematically impossible to create or destroy money in this system —
only move it between accounts.

User deposits $100:
DEBIT Cash Asset Account 10000 ← you received money
CREDIT User Liability Account 10000 ← you owe user money
Net: 10000 - 10000 = 0 ✓

Internal transfer (User A → User B, $25):
DEBIT User A Liability 2500 ← you owe A less
CREDIT User B Liability 2500 ← you owe B more
Cash account: NOT touched ← no real money moved

### Immutable audit trail

Database triggers prevent any UPDATE or DELETE on the entries table.
Mistakes are corrected with reversal entries, not edits.
Every cent is traceable from creation to present.

```sql
CREATE TRIGGER entries_immutable
  BEFORE UPDATE OR DELETE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_entry_modification();
```

### Idempotency

Every state-changing endpoint requires an `Idempotency-Key` header.
Retried requests return the stored result without re-executing.
Eliminates double-charges from network failures or client retries.

POST /transactions Idempotency-Key: transfer-user123-1704067200
→ executes transfer, stores result

POST /transactions Idempotency-Key: transfer-user123-1704067200
→ returns stored result, transfer does NOT execute again

### Row-level locking

```sql
SELECT * FROM accounts WHERE id = $1 FOR UPDATE
```

Prevents race conditions when concurrent requests touch the same account.
The second request waits until the first commits before reading balance.

### Webhook safety

Payment provider webhooks follow a strict pattern:

1. Verify HMAC signature — confirms webhook is from provider
2. Check for duplicate event ID — prevents double-processing
3. Store raw payload — complete audit trail
4. Respond 200 immediately — prevents provider retry storms
5. Process asynchronously — decoupled from HTTP response

### Crypto reconciliation

Every user has a dedicated on-chain deposit address derived from a
master HD wallet using BIP44 derivation. On-chain USDC balances are
compared against internal ledger balances on every balance query.
Any discrepancy creates a `ReconciliationAlert` for investigation.

---

## Tech stack

| Layer         | Technology           | Why                                    |
| ------------- | -------------------- | -------------------------------------- |
| Runtime       | Node.js + TypeScript | Type safety for financial data         |
| Framework     | Express              | Lightweight, full control              |
| ORM           | Prisma               | Type-safe DB queries                   |
| Database      | PostgreSQL (Neon)    | ACID transactions, row locking         |
| Blockchain    | ethers.js v6         | Industry standard Ethereum library     |
| Node provider | Alchemy              | Reliable WebSocket for event listening |
| Math          | decimal.js           | Arbitrary precision, no float errors   |
| Validation    | Zod                  | Runtime type checking on all inputs    |
| Payments      | Paystack, Stripe     | Real payment provider integration      |

---

## Project structure

ledger-engine/
├── prisma/
│ └── schema.prisma # DB schema — accounts, transactions,
│ # entries, payments, crypto tables
├── src/
│ ├── config/
│ │ └── providers.ts # Stripe client, system account IDs
│ ├── crypto/
│ │ ├── wallet.ts # HD wallet, key derivation, signing
│ │ ├── eventListener.ts # ERC-20 Transfer event listener
│ │ └── depositProcessor.ts# On-chain → ledger posting
│ ├── lib/
│ │ ├── prisma.ts # Singleton Prisma client
│ │ └── money.ts # toSmallestUnit, fromSmallestUnit
│ ├── routes/
│ │ ├── accounts.ts # GET/POST accounts, balance, statement
│ │ ├── transactions.ts # POST transaction, GET, void
│ │ ├── payments.ts # Paystack/Stripe initialize, refund
│ │ ├── webhooks.ts # Webhook handlers with sig verification
│ │ └── users.ts # Crypto balance + reconciliation
│ ├── seeds/
│ │ └── accounts.ts # System chart of accounts
│ ├── services/
│ │ ├── ledger.ts # Core engine — post, balance, void
│ │ ├── paystack.ts # Paystack API client
│ │ ├── stripeService.ts # Stripe API client
│ │ └── payment.ts # Payment lifecycle, ledger posting
│ └── index.ts # Express app, middleware, routes
└── .env # Environment variables

---

## Running locally

```bash
# clone
git clone https://github.com/DelightOfili/nexus-ledger
cd nexus-ledger

# install
npm install

# environment
cp .env.example .env
# fill in DATABASE_URL, PAYSTACK_SECRET_KEY, etc

# database
npx prisma migrate dev

# run
npm run dev
# server starts on port 3001
```

---

## Environment variables

Database

DATABASE_URL=postgresql://...

Paystack

PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx

Stripe

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

Crypto

ALCHEMY_API_KEY=xxx
ETHEREUM_NETWORK=sepolia
HD_WALLET_MNEMONIC=word1 word2 ... word12

System account IDs (from seeded accounts table)

CASH_ACCOUNT_ID=
PAYSTACK_FLOAT_ACCOUNT_ID=
STRIPE_FLOAT_ACCOUNT_ID=
USDC_HOT_WALLET_ACCOUNT_ID=
FEE_REVENUE_ACCOUNT_ID=
PROCESSING_EXPENSE_ACCOUNT_ID=
USER_LIABILITIES_ACCOUNT_ID=

App

APP_URL=http://localhost:3001
PORT=3001

---

## API reference

### Accounts

POST /accounts Create account
GET /accounts List all accounts
GET /accounts/:id/balance Get balance (computed from entries)
GET /accounts/:id/statement Get statement with running balance

### Transactions

POST /transactions Post double-entry transaction
GET /transactions/:id Get transaction with entries
POST /transactions/:id/void Void with reversal entries

### Payments

POST /payments/paystack/initialize Create Paystack checkout session
GET /payments/paystack/verify Verify payment after redirect
POST /payments/stripe/initialize Create Stripe payment intent
GET /payments/:reference Get payment status
POST /payments/:reference/refund Refund with ledger reversal

### Webhooks

POST /webhooks/paystack Paystack event handler
POST /webhooks/stripe Stripe event handler

### Crypto

GET /users/:userId/crypto-balance Internal + on-chain balance
with reconciliation check

## Tech Stack

- **Language**: [TypeScript](https://www.typescriptlang.org/?utm_source=gemini)

- **Runtime**: [Node.js](https://nodejs.org/?utm_source=gemini)

- **Framework**: [Express.js](https://expressjs.com/?utm_source=gemini)

- **ORM**: [Prisma](https://www.prisma.io/?utm_source=gemini)

- **Database**: [PostgreSQL](https://www.postgresql.org/?utm_source=gemini)

## What's next (Phase 4)

- Formance Ledger integration for programmable fee-splitting
- Numscript for complex payout routing
- Kafka event streaming for transaction events
- Redis for idempotency key caching and rate limiting
- Multi-currency FX with spread tracking
- Full Nexus Ledger capstone

---

Built by Chukwunonso Ofili — [@DelightOfili](https://twitter.com/DelightOfili)
