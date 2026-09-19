"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
require("dotenv/config");
const accounts_1 = __importDefault(require("./routes/accounts"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const accounts_2 = require("./seeds/accounts");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/accounts", accounts_1.default);
app.use("/transactions", transactions_1.default);
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date() });
});
// global error handler
app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(500).json({ error: err.message });
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await (0, accounts_2.seedSystemAccounts)();
    console.log(`Ledger engine running on port ${PORT}`);
});
