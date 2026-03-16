import * as crypto from 'crypto';
import { IPaymentProvider, PaymentGate, PaymentInvoice, PaymentReceipt } from '../payment.interface';

type CheckoutState = 'cart-created' | 'cart-updated' | 'payment-pending' | 'completed' | 'canceled';

interface CheckoutSession {
  checkoutId: string;
  gate: PaymentGate;
  state: CheckoutState;
  delegatedPaymentToken: string;
  receipt?: PaymentReceipt;
}

export class CommerceCheckoutPaymentProvider implements IPaymentProvider {
  readonly providerId = 'commerce-checkout';

  private gates = new Map<string, PaymentGate>();
  private sessions = new Map<string, CheckoutSession>();

  async createPaymentGate(price: number, capabilities: string[]): Promise<PaymentGate> {
    const gate: PaymentGate = {
      gateId: `checkout_${crypto.randomUUID()}`,
      capabilities,
      price,
      currency: 'USD',
    };
    this.gates.set(gate.gateId, gate);
    this.sessions.set(gate.gateId, {
      checkoutId: gate.gateId,
      gate,
      state: 'cart-created',
      delegatedPaymentToken: `spt_${crypto.randomUUID()}`,
    });
    return gate;
  }

  async requestPayment(invoice: PaymentInvoice): Promise<PaymentReceipt> {
    const session = this.sessions.get(invoice.gateId);
    if (!session) {
      throw new Error(`No checkout session found for gate ${invoice.gateId}`);
    }
    session.state = 'payment-pending';
    const receipt: PaymentReceipt = {
      invoiceId: invoice.invoiceId,
      transactionHash: `checkout_tx_${crypto.randomUUID()}`,
      paidAt: new Date().toISOString(),
      amount: invoice.amount,
      currency: invoice.currency,
      status: 'pending',
    };
    session.receipt = receipt;
    return receipt;
  }

  async verifyPayment(receipt: PaymentReceipt): Promise<boolean> {
    return receipt.status === 'verified' || receipt.status === 'pending';
  }

  async settleTransaction(transactionHash: string): Promise<PaymentReceipt> {
    const session = Array.from(this.sessions.values()).find(
      (candidate) => candidate.receipt?.transactionHash === transactionHash,
    );
    if (!session || !session.receipt) {
      throw new Error(`Checkout transaction ${transactionHash} was not found`);
    }
    session.state = 'completed';
    session.receipt.status = 'verified';
    return session.receipt;
  }

  async createCheckout(gateId: string): Promise<CheckoutSession> {
    const session = this.sessions.get(gateId);
    if (!session) {
      throw new Error(`No checkout session found for gate ${gateId}`);
    }
    return session;
  }

  async updateCheckout(gateId: string, updatedPrice: number): Promise<CheckoutSession> {
    const session = await this.createCheckout(gateId);
    session.gate.price = updatedPrice;
    session.state = 'cart-updated';
    return session;
  }

  async completeCheckout(gateId: string): Promise<CheckoutSession> {
    const session = await this.createCheckout(gateId);
    session.state = 'completed';
    if (session.receipt) {
      session.receipt.status = 'verified';
    }
    return session;
  }

  async cancelCheckout(gateId: string): Promise<CheckoutSession> {
    const session = await this.createCheckout(gateId);
    session.state = 'canceled';
    if (session.receipt) {
      session.receipt.status = 'failed';
    }
    return session;
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const digest = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return digest === signature;
  }
}
