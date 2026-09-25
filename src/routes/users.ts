import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getBalance } from "../services/ledger";
import { getUSDCBalance } from "../crypto/eventListener";
import { fromSmallestUnit } from "../lib/money";

const router = Router();

router.get("/:userId/crypto-balance", async (req, res) => {
  try {
    const { userId } = req.params;

    const depositRecord = await prisma.cryptoDepositAddress.findFirst({
      where: { userId, currency: "USDC" },
    });

    if (!depositRecord) {
      return res.status(404).json({
        error: "No USDC deposit address found for this user",
      });
    }

    const userAccount = await prisma.account.findFirst({
      where: {
        userId,
        currency: "USDC",
        type: "LIABILITY",
      },
    });

    if (!userAccount) {
      return res.status(404).json({
        error: "No USDC ledger account found for this user",
      });
    }

    const internalBalanceRaw = await getBalance(userAccount.id);

    const onChainBalance = await getUSDCBalance(
      depositRecord.address,
      (process.env.ETHEREUM_NETWORK as "mainnet" | "sepolia") || "sepolia",
    );

    const internalRaw = internalBalanceRaw;
    const onChainRaw = onChainBalance.raw;

    const discrepancy = onChainRaw - internalRaw;

    const reconciled = discrepancy === 0n;

    if (!reconciled) {
      console.error(`RECONCILIATION ALERT — User ${userId}`);
      console.error(`  Internal balance: ${internalRaw}`);
      console.error(`  On-chain balance: ${onChainRaw}`);
      console.error(`  Discrepancy:      ${discrepancy}`);
      console.error(`  Address:          ${depositRecord.address}`);

      await prisma.reconciliationAlert.create({
        data: {
          userId,
          currency: "USDC",
          depositAddress: depositRecord.address,
          internalBalance: internalRaw,
          onChainBalance: onChainRaw,
          discrepancy,
          network: depositRecord.network,
          status: "PENDING",
        },
      });
    }

    return res.json({
      userId,
      depositAddress: depositRecord.address,
      network: depositRecord.network,
      internalBalance: {
        amount: fromSmallestUnit(internalRaw, "USDC"),
        currency: "USDC",
        raw: internalRaw.toString(),
        //used raw for debugging
      },
      onChainBalance: {
        amount: onChainBalance.formatted,
        currency: "USDC",
        raw: onChainRaw.toString(),
      },
      reconciled,
      discrepancy:
        discrepancy === 0n
          ? null
          : {
              amount: fromSmallestUnit(
                discrepancy < 0n ? -discrepancy : discrepancy,
                "USDC",
              ),
              direction:
                discrepancy > 0n ? "ON_CHAIN_HIGHER" : "INTERNAL_HIGHER",
              // ON_CHAIN_HIGHER = missed deposit
              // INTERNAL_HIGHER = ghost balance or failed withdrawal
              raw: discrepancy.toString(),
            },
      checkedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch crypto balance";
    console.error("Crypto balance error:", message);
    return res.status(500).json({ error: message });
  }
});

export default router;
