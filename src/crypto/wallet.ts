import { ethers } from "ethers";

export function createHDWallet(mnemonic: string) {
  return ethers.HDNodeWallet.fromPhrase(mnemonic);
}

export function deriveUserAddress(mnemonic: string, userIndex: number): string {
  const masterWallet = ethers.HDNodeWallet.fromPhrase(mnemonic);

  const derivedWallet = masterWallet.deriveChild(userIndex);

  return derivedWallet.address;
}

export function getPlatformWallet(
  mnemonic: string,
  provider: ethers.Provider,
): ethers.HDNodeWallet {
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
  return wallet.connect(provider);
  // connect to provider so wallet can broadcast transactions
}

export async function signMessage(
  mnemonic: string,
  message: string,
): Promise<string> {
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
  return wallet.signMessage(message);
}

export function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string,
): boolean {
  const recoveredAddress = ethers.verifyMessage(message, signature);
  return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
}

export function generateMnemonic(): string {
  const wallet = ethers.Wallet.createRandom();
  return wallet.mnemonic!.phrase;
}
