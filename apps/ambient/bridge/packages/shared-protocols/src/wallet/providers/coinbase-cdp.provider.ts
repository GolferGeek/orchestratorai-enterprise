import { CdpClient } from '@coinbase/cdp-sdk';
import type { EvmServerAccount } from '@coinbase/cdp-sdk';
import { IWalletProvider, WalletInfo } from '../wallet.interface';

// USDC contract address on Base Sepolia
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

/**
 * Coinbase Developer Platform (CDP) MPC wallet provider.
 * Uses the real CDP SDK to create and manage server-side MPC wallets on Base Sepolia.
 */
export class CoinbaseCdpWalletProvider implements IWalletProvider {
  readonly providerId = 'coinbase-cdp';

  private cdp: CdpClient;
  private account: EvmServerAccount | null = null;
  private network: string;

  constructor() {
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_PRIVATE_KEY;
    const network = process.env.CDP_WALLET_NETWORK;

    if (!apiKeyId) {
      throw new Error('CDP_API_KEY_ID environment variable is not set');
    }
    if (!apiKeySecret) {
      throw new Error('CDP_API_KEY_PRIVATE_KEY environment variable is not set');
    }
    if (!network) {
      throw new Error('CDP_WALLET_NETWORK environment variable is not set');
    }

    this.network = network;
    const walletSecret = process.env.CDP_WALLET_SECRET ?? apiKeySecret;
    this.cdp = new CdpClient({
      apiKeyId,
      apiKeySecret,
      walletSecret,
    });
  }

  async createWallet(): Promise<WalletInfo> {
    this.account = await this.cdp.evm.createAccount();
    const balance = await this.queryUsdcBalance();

    return {
      address: this.account.address,
      balance,
      currency: 'USDC',
      network: this.network,
    };
  }

  async getBalance(): Promise<{ balance: number; currency: string }> {
    await this.ensureAccount();
    const balance = await this.queryUsdcBalance();
    return { balance, currency: 'USDC' };
  }

  async signTransaction(tx: Record<string, unknown>): Promise<string> {
    await this.ensureAccount();

    // If the tx contains an RLP-encoded transaction as a hex string, use it directly.
    // Otherwise, sign the JSON-serialized payload as a message.
    if (typeof tx.transaction === 'string' && tx.transaction.startsWith('0x')) {
      const result = await this.cdp.evm.signTransaction({
        address: this.account!.address,
        transaction: tx.transaction as `0x${string}`,
      });
      return result.signature;
    }

    // For arbitrary payloads, sign as an EIP-191 message
    const message = JSON.stringify(tx);
    const result = await this.cdp.evm.signMessage({
      address: this.account!.address,
      message,
    });
    return result.signature;
  }

  /**
   * Smart Wallet gasless support capability indicator and payload builder.
   * Callers can use this metadata to route transactions through sponsor flows.
   */
  supportsGaslessTransactions(): boolean {
    return true;
  }

  buildGaslessTransactionPayload(tx: Record<string, unknown>): Record<string, unknown> {
    return {
      ...tx,
      gasless: true,
      sponsor: 'coinbase-smart-wallet',
    };
  }

  async getAddress(): Promise<string> {
    await this.ensureAccount();
    return this.account!.address;
  }

  /**
   * Ensures a wallet account exists. Creates one if createWallet() hasn't been called yet.
   */
  private async ensureAccount(): Promise<void> {
    if (!this.account) {
      await this.createWallet();
    }
  }

  /**
   * Queries the real USDC balance for the current account on the configured network.
   * Returns 0 if the wallet has no USDC (e.g., hasn't been funded from the Circle faucet).
   */
  private async queryUsdcBalance(): Promise<number> {
    const result = await this.cdp.evm.listTokenBalances({
      address: this.account!.address,
      network: this.network as 'base-sepolia',
    });

    for (const tokenBalance of result.balances) {
      const token = tokenBalance.token;
      if (
        token.contractAddress &&
        token.contractAddress.toLowerCase() === USDC_BASE_SEPOLIA.toLowerCase()
      ) {
        const decimals = tokenBalance.amount.decimals;
        return Number(tokenBalance.amount.amount) / Math.pow(10, decimals);
      }
    }

    return 0;
  }
}
