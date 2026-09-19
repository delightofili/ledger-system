# Delightsome's Double-Entry Accounting Ledger System

A robust, high-integrity financial ledger engine built with **Node.js, Express, TypeScript, and Prisma ORM**. This system implements pure double-entry bookkeeping principles to maintain absolute financial data consistency, prevent transaction race conditions, and provide an immutable audit trail for account balances.

## Key Engineering Features

- **Strict Double-Entry Rules**: Enforces balanced transaction entries where every debit must equal a corresponding credit ($\sum \text{Debits} = \sum \text{Credits}$).

- **ACID Compliance & Concurrency Control**: Uses transactional database operations via Prisma to ensure atomic account updates and protect against partial writes.

- **Immutable Ledger Design**: Entries are append-only. Adjustments or reversals are processed as new balancing transactions to preserve auditability.

- **Type-Safe Domain Models**: Fully typed API endpoints, payloads, and database queries leveraging TypeScript and Express.

- **Structured Chart of Accounts**: Supports hierarchical account classification (Assets, Liabilities, Equity, Revenue, Expenses).

## System Architecture

```
src/
├── controllers/    # Request handlers & HTTP routing logic
├── services/       # Core ledger domain logic & transaction rules
├── middleware/     # Validation, error handling, and authentication
├── routes/         # Express endpoint definitions
├── types/          # Shared TypeScript interfaces & types
└── prisma/         # Schema definitions, migrations, and seed scripts

```

### Core Accounting Principles Applied

1. **Accounting Equation**: Ensures $\text{Assets} = \text{Liabilities} + \text{Equity}$ is preserved across all system operations.

2. **Atomicity**: A posting containing multiple debit/credit lines will fail entirely if any single condition or constraint fails.

3. **Auditability**: Tracks timestamps, transaction references, and sequence history for every entry.

## Tech Stack

- **Language**: [TypeScript](https://www.typescriptlang.org/?utm_source=gemini)

- **Runtime**: [Node.js](https://nodejs.org/?utm_source=gemini)

- **Framework**: [Express.js](https://expressjs.com/?utm_source=gemini)

- **ORM**: [Prisma](https://www.prisma.io/?utm_source=gemini)

- **Database**: [PostgreSQL](https://www.postgresql.org/?utm_source=gemini)

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)

- PostgreSQL database instance

- npm or yarn

### Installation

1. **Clone the repository**:

   ```
   git clone https://github.com/delightofili/ledger-system.git
   cd ledger-system

   ```

2. **Install dependencies**:

   ```
   npm install

   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:

   ```
   PORT=5000
   DATABASE_URL="postgresql://user:password@localhost:5432/ledger_db?schema=public"

   ```

4. **Run Database Migrations**:

   ```
   npx prisma migrate dev --name init

   ```

5. **Start Development Server**:

   ```
   npm run dev

   ```

## API Endpoints Overview

| Method | Endpoint               | Description                                   |
| ------ | ---------------------- | --------------------------------------------- |
| `POST` | `/api/v1/accounts`     | Create a new account (Asset, Liability, etc.) |
| `GET`  | `/api/v1/accounts`     | Fetch chart of accounts with current balances |
| `GET`  | `/api/v1/accounts/:id` | Get specific account details and history      |
| `POST` | `/api/v1/transactions` | Post a balanced double-entry transaction      |
| `GET`  | `/api/v1/transactions` | List all posted journal entries               |

## Example Transaction Payload

To record a payment for operational expenses (e.g., \$500 paid via Cash/Bank):

```
POST /api/v1/transactions
{
  "description": "Office Supplies Expense",
  "reference": "INV-2026-001",
  "entries": [
    {
      "accountId": "acc_expense_123",
      "type": "DEBIT",
      "amount": 500.00
    },
    {
      "accountId": "acc_cash_456",
      "type": "CREDIT",
      "amount": 500.00
    }
  ]
}

```

_Note: If total debits do not equal total credits, the API returns `400 Bad Request` and rejects the database write._

## Roadmap & Ongoing Enhancements

This repository represents the initial foundation of the ledger system. A v2 architecture is currently under active development featuring:

- \[ \] Multi-currency support with automated forex rate conversion.

- \[ \] Sub-ledger partitioning for high-concurrency event processing.

- \[ \] Read-optimized reporting views for instant Trial Balance generation.

## License

Distributed under the MIT License. See `LICENSE` for more information.
