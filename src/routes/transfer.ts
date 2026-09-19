import { Router } from "express";
import { transferSchema } from "../schemas/transfer";
import { executeTransfer } from "../services/transfer";

const router = Router();

router.post("/transfers", async (req, res) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string;
    if (!idempotencyKey) {
      return res
        .status(400)
        .json({ error: "Idempotency-Key header is required" });
    }

    const payload = transferSchema.parse(req.body);
    const transaction = await executeTransfer({ ...payload, idempotencyKey });

    return res.status(201).json(transaction);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Transfer failed" });
  }
});

export default router;
