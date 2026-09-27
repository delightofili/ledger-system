import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";

import accountsRouter from "./routes/accounts";
import transactionsRouter from "./routes/transactions";
import paymentsRouter from "./routes/payments";
import webhooksRouter from "./routes/webhooks";
import usersRouter from "./routes/users";
import adminRouter from "./routes/admin";
import { seedSystemAccounts } from "./seeds/accounts";
import { startReconciliationJobs } from "./jobs/reconcilation";
import { rateLimit } from "./middleware/rateLimit";

const app = express();

app.use(helmet());
app.use(cors());

// raw body for webhooks — must be before express.json()
app.use("/webhooks/paystack", express.raw({ type: "application/json" }));
app.use("/webhooks/stripe", express.raw({ type: "application/json" }));

app.use(express.json());

// rate limiting per route group
app.use(
  "/transactions",
  rateLimit({
    windowSeconds: 60,
    maxRequests: 100,
    keyPrefix: "transactions",
  }),
);

app.use(
  "/payments",
  rateLimit({
    windowSeconds: 60,
    maxRequests: 30,
    keyPrefix: "payments",
  }),
);

// routes
app.use("/accounts", accountsRouter);
app.use("/transactions", transactionsRouter);
app.use("/payments", paymentsRouter);
app.use("/webhooks", webhooksRouter);
app.use("/users", usersRouter);
app.use("/admin", adminRouter);

app.get("/health", async (req, res) => {
  const { redis } = await import("./lib/redis");
  const redisOk = await redis
    .ping()
    .then(() => true)
    .catch(() => false);

  res.json({
    status: "ok",
    timestamp: new Date(),
    services: {
      database: "ok",
      redis: redisOk ? "ok" : "error",
    },
  });
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
  startReconciliationJobs();
  console.log(`Nexus Ledger running on port ${PORT}`);
});
