import { ethers } from "ethers";

//my ABI

const ERC20_ABI = [
  // Transfer event — emitted when tokens move
  "event Transfer(address indexed from, address indexed to, uint256 value)",

  // balanceOf — check token balance
  "function balanceOf(address owner) view returns (uint256)",

  // decimals — how many decimal places this token uses
  "function decimals() view returns (uint8)",

  // symbol — token ticker
  "function symbol() view returns (string)",
];

// USDC contract addresses
const USDC_ADDRESSES = {
  mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

export function getProvider(
  network: "mainnet" | "sepolia",
): ethers.WebSocketProvider {
  const alchemyKey = process.env.ALCHEMY_API_KEY!;

  const wsUrl =
    network === "mainnet"
      ? `wss://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : `wss://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`;

  return new ethers.WebSocketProvider(wsUrl);
}

export async function listenForUSDCDeposits(
  network: "mainnet" | "sepolia",
  watchedAddresses: Set<string>,
  // the set of user deposit addresses this platform controls
  onDeposit: (event: DepositEvent) => Promise<void>,
  // callback — called every time a deposit is detected
) {
  const provider = getProvider(network);
  const usdcAddress = USDC_ADDRESSES[network];

  const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);

  const decimals = await usdcContract.decimals();

  console.log(`Listening for USDC deposits on ${network}...`);
  console.log(`USDC contract: ${usdcAddress}`);
  console.log(`USDC decimals: ${decimals}`);

  usdcContract.on(
    "Transfer",
    async (
      from: string,
      to: string,
      value: bigint,

      event: ethers.EventLog,
    ) => {
      // normalize addresses to lowercase for comparison
      const toAddress = to.toLowerCase();

      if (!watchedAddresses.has(toAddress)) {
        return;
      }

      console.log(`USDC deposit detected:`);
      console.log(`  From: ${from}`);
      console.log(`  To: ${to}`);
      console.log(`  Amount: ${ethers.formatUnits(value, decimals)} USDC`);
      console.log(`  Tx hash: ${event.transactionHash}`);
      console.log(`  Block: ${event.blockNumber}`);

      const depositEvent: DepositEvent = {
        from,
        to,
        amount: value,
        // raw amount in smallest unit (6 decimals for USDC)
        amountFormatted: ethers.formatUnits(value, decimals),
        // human readable: "100.000000"
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
        currency: "USDC",
        contractAddress: usdcAddress,
      };

      try {
        await onDeposit(depositEvent);
      } catch (error) {
        console.error("Failed to process deposit event:", error);
      }
    },
  );

  provider.on("error", (error: Error) => {
    console.error("WebSocket provider error:", error);
  });

  return {
    stop: () => {
      usdcContract.removeAllListeners();
      provider.destroy();
    },
  };
}

export async function getUSDCBalance(
  address: string,
  network: "mainnet" | "sepolia",
): Promise<{ raw: bigint; formatted: string }> {
  const provider = getProvider(network);
  const usdcAddress = USDC_ADDRESSES[network];
  const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);

  const [balance, decimals] = await Promise.all([
    usdcContract.balanceOf(address),
    usdcContract.decimals(),
  ]);

  return {
    raw: balance,

    formatted: ethers.formatUnits(balance, decimals),
  };
}

export async function sendUSDC(
  mnemonic: string,
  toAddress: string,
  amount: bigint,

  network: "mainnet" | "sepolia",
): Promise<string> {
  const provider = getProvider(network);

  // get platform wallet with signing capability
  const platformWallet =
    ethers.HDNodeWallet.fromPhrase(mnemonic).connect(provider);

  const usdcAddress = USDC_ADDRESSES[network];
  const usdcContract = new ethers.Contract(
    usdcAddress,
    ERC20_ABI,
    platformWallet,
  );

  // send the USDC
  const tx = await usdcContract.transfer(toAddress, amount);

  console.log(`USDC transfer submitted: ${tx.hash}`);

  // wait for confirmation
  const receipt = await tx.wait(1);

  console.log(`USDC transfer confirmed in block ${receipt?.blockNumber}`);

  return tx.hash;
}

export interface DepositEvent {
  from: string;
  to: string;
  amount: bigint;
  amountFormatted: string;
  txHash: string;
  blockNumber: number;
  currency: string;
  contractAddress: string;
}
