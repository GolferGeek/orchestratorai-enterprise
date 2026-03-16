import * as crypto from 'crypto';
import { IPaymentProvider, PaymentGate, PaymentInvoice, PaymentReceipt } from '../payment.interface';
import { PaymentPersistenceService } from '../payment-persistence.service';

export class MockPaymentProvider implements IPaymentProvider {
  readonly providerId = 'mock';

  private gates: Map<string, PaymentGate> = new Map();
  private readonly persistence: PaymentPersistenceService | null;

  constructor(persistence?: PaymentPersistenceService) {
    this.persistence = persistence ?? null;
  }

  async createPaymentGate(price: number, capabilities: string[]): Promise<PaymentGate> {
    const gate: PaymentGate = {
      gateId: crypto.randomUUID(),
      capabilities,
      price,
      currency: 'MOCK',
    };
    this.gates.set(gate.gateId, gate);
    this.persistence?.persistGate(this.providerId, gate);
    return gate;
  }

  async requestPayment(invoice: PaymentInvoice): Promise<PaymentReceipt> {
    // Mock provider always succeeds immediately
    const receipt: PaymentReceipt = {
      invoiceId: invoice.invoiceId,
      transactionHash: `mock-tx-${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date().toISOString(),
      amount: invoice.amount,
      currency: invoice.currency,
      status: 'verified',
    };
    this.persistence?.persistReceipt(this.providerId, receipt);
    return receipt;
  }

  async verifyPayment(): Promise<boolean> {
    return true;
  }

  async settleTransaction(transactionHash: string): Promise<PaymentReceipt> {
    const receipt: PaymentReceipt = {
      invoiceId: 'mock',
      transactionHash,
      paidAt: new Date().toISOString(),
      amount: 0,
      currency: 'MOCK',
      status: 'verified',
    };
    this.persistence?.persistReceipt(this.providerId, receipt);
    return receipt;
  }
}
