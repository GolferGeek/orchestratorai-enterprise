import * as crypto from 'crypto';
import { IWalletProvider, WalletInfo } from '../wallet.interface';

export class LocalKeypairWalletProvider implements IWalletProvider {
  readonly providerId = 'local-keypair';

  private address: string;
  private balance: number = 100.0; // Mock balance for dev

  constructor() {
    // Generate a mock Ethereum-style address
    this.address = '0x' + crypto.randomBytes(20).toString('hex');
  }

  async createWallet(): Promise<WalletInfo> {
    return {
      address: this.address,
      balance: this.balance,
      currency: 'USDC',
      network: 'mock-testnet',
    };
  }

  async getBalance(): Promise<{ balance: number; currency: string }> {
    return { balance: this.balance, currency: 'USDC' };
  }

  async signTransaction(tx: Record<string, unknown>): Promise<string> {
    // Mock signing — just return a hash of the tx
    const hash = crypto.createHash('sha256').update(JSON.stringify(tx)).digest('hex');
    return `0x${hash}`;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }
}
