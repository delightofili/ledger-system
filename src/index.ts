import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";

import accountsRouter from "./routes/accounts";
import transactionsRouter from "./routes/transactions";
import paymentsRouter from "./routes/payments";
import webhooksRouter from "./routes/webhooks";
import { seedSystemAccounts } from "./seeds/accounts";

const app = express();

app.use(helmet());
app.use(cors());

// CRITICAL — webhook routes must use raw body parser
// if you use express.json() on webhook routes
// the body gets parsed as an object
// signature verification requires the raw bytes
// the order here matters — raw parser registered BEFORE json parser
app.use("/webhooks/paystack", express.raw({ type: "application/json" }));
app.use("/webhooks/stripe", express.raw({ type: "application/json" }));

// all other routes use JSON parser
app.use(express.json());

app.use("/accounts", accountsRouter);
app.use("/transactions", transactionsRouter);
app.use("/payments", paymentsRouter);
app.use("/webhooks", webhooksRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  },
);

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  await seedSystemAccounts();
  console.log(`Ledger engine running on port ${PORT}`);
});
