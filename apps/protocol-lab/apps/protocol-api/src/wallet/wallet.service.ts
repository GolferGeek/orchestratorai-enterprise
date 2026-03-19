import { Injectable, Logger } from '@nestjs/common';

export interface WalletState {
  address: string;
  balance: number;
  currency: string;
  network: string;
  provider: string;
}

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  fromAgent: string;
  toAgent: string;
  amount: number;
  currency: string;
  provider: string;
  transactionHash?: string;
  status: 'pending' | 'verified' | 'failed';
  createdAt: string;
  settledAt?: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  private wallet: WalletState = {
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38',
    balance: 1250.0,
    currency: 'USDC',
    network: 'base-sepolia',
    provider: 'local-keypair',
  };

  private transactions: PaymentTransaction[] = [
    {
      id: 'tx-001',
      invoiceId: 'inv-001',
      fromAgent: 'research-hub',
      toAgent: 'market-pulse',
      amount: 0.50,
      currency: 'USDC',
      provider: 'mock',
      transactionHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      status: 'verified',
      createdAt: '2026-03-09T10:30:00Z',
      settledAt: '2026-03-09T10:30:05Z',
    },
    {
      id: 'tx-002',
      invoiceId: 'inv-002',
      fromAgent: 'market-pulse',
      toAgent: 'research-hub',
      amount: 1.00,
      currency: 'USDC',
      provider: 'x402-usdc',
      transactionHash: '0x9f8e7d6c5b4a3928170f6e5d4c3b2a19081726354453627180f9e8d7c6b5a493',
      status: 'verified',
      createdAt: '2026-03-09T11:15:00Z',
      settledAt: '2026-03-09T11:15:12Z',
    },
    {
      id: 'tx-003',
      invoiceId: 'inv-003',
      fromAgent: 'research-hub',
      toAgent: 'market-pulse',
      amount: 0.25,
      currency: 'USDC',
      provider: 'x402-usdc',
      status: 'pending',
      createdAt: '2026-03-09T12:00:00Z',
    },
  ];

  getWallet(): WalletState {
    return { ...this.wallet };
  }

  updateWalletProvider(provider: string): WalletState {
    this.wallet.provider = provider;
    this.logger.log(`Wallet provider updated to: ${provider}`);
    return this.getWallet();
  }

  getTransactions(): PaymentTransaction[] {
    return [...this.transactions];
  }

  getTransaction(id: string): PaymentTransaction | undefined {
    return this.transactions.find((t) => t.id === id);
  }
}
