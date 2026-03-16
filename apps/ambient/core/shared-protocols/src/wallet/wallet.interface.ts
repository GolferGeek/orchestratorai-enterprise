export interface WalletInfo {
  address: string;
  balance: number;
  currency: string;
  network: string;
}

export interface IWalletProvider {
  readonly providerId: string;

  createWallet(): Promise<WalletInfo>;
  getBalance(): Promise<{ balance: number; currency: string }>;
  signTransaction(tx: Record<string, unknown>): Promise<string>;
  getAddress(): Promise<string>;
}
