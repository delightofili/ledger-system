import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";

import accountsRouter from "./routes/accounts";
import transactionsRouter from "./routes/transactions";
import transferRouter from "./routes/transfer";
import { seedSystemAccounts } from "./seeds/accounts";

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/accounts", accountsRouter);
app.use("/transactions", transactionsRouter);
app.use("/", transferRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

seedSystemAccounts().catch(console.error);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Ledger engine running on port ${PORT}`);
});
