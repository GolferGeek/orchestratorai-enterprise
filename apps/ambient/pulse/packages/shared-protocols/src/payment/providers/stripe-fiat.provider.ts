import Stripe from 'stripe';
import * as crypto from 'crypto';
import { IPaymentProvider, PaymentGate, PaymentInvoice, PaymentReceipt } from '../payment.interface';
import { PaymentPersistenceService } from '../payment-persistence.service';

/**
 * Stripe payment provider for fiat currency payments.
 * Creates real Stripe PaymentIntents, verifies their status,
 * and settles transactions via the Stripe API.
 *
 * Requires STRIPE_SECRET_KEY environment variable (or pass secretKey to constructor).
 * Use a test-mode key (sk_test_...) for development.
 */
export class StripeFiatPaymentProvider implements IPaymentProvider {
  readonly providerId = 'stripe-fiat';

  private stripe: Stripe;
  private gates: Map<string, PaymentGate> = new Map();
  private receipts: Map<string, PaymentReceipt> = new Map();
  private readonly persistence: PaymentPersistenceService | null;

  constructor(secretKey?: string, persistence?: PaymentPersistenceService) {
    this.persistence = persistence ?? null;
    const key = secretKey ?? process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        'StripeFiatPaymentProvider requires a Stripe secret key. ' +
        'Set STRIPE_SECRET_KEY environment variable or pass secretKey to the constructor.',
      );
    }
    this.stripe = new Stripe(key);
  }

  async createPaymentGate(price: number, capabilities: string[]): Promise<PaymentGate> {
    // Create a Stripe Product representing this capability gate
    const product = await this.stripe.products.create({
      name: `Payment Gate: ${capabilities.join(', ')}`,
      metadata: {
        capabilities: JSON.stringify(capabilities),
      },
    });

    // Create a Stripe Price (amount in cents) attached to the product
    const stripePrice = await this.stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(price * 100),
      currency: 'usd',
    });

    const gate: PaymentGate = {
      gateId: stripePrice.id,
      capabilities,
      price,
      currency: 'USD',
    };
    this.gates.set(gate.gateId, gate);
    this.persistence?.persistGate(this.providerId, gate);
    return gate;
  }

  async requestPayment(invoice: PaymentInvoice): Promise<PaymentReceipt> {
    // Create a real Stripe PaymentIntent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(invoice.amount * 100),
      currency: invoice.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        invoiceId: invoice.invoiceId,
        gateId: invoice.gateId,
        payTo: invoice.payTo,
      },
    });

    const receipt: PaymentReceipt = {
      invoiceId: invoice.invoiceId,
      transactionHash: paymentIntent.id,
      paidAt: new Date().toISOString(),
      amount: invoice.amount,
      currency: invoice.currency,
      status: 'pending',
    };
    this.receipts.set(paymentIntent.id, receipt);
    this.persistence?.persistReceipt(this.providerId, receipt);
    return receipt;
  }

  async verifyPayment(receipt: PaymentReceipt): Promise<boolean> {
    if (!receipt.transactionHash) {
      return false;
    }

    // Retrieve the PaymentIntent from Stripe and check its status
    const paymentIntent = await this.stripe.paymentIntents.retrieve(receipt.transactionHash);

    const isSucceeded = paymentIntent.status === 'succeeded';

    // Update local tracking
    const stored = this.receipts.get(receipt.transactionHash);
    if (stored) {
      stored.status = isSucceeded ? 'verified' : 'pending';
      this.receipts.set(receipt.transactionHash, stored);
      this.persistence?.persistReceipt(this.providerId, stored);
    }

    return isSucceeded;
  }

  async settleTransaction(transactionHash: string): Promise<PaymentReceipt> {
    // Retrieve the PaymentIntent from Stripe
    const paymentIntent = await this.stripe.paymentIntents.retrieve(transactionHash);

    // If the intent requires capture (e.g., manual capture mode), capture it
    if (paymentIntent.status === 'requires_capture') {
      await this.stripe.paymentIntents.capture(transactionHash);
    }

    const stored = this.receipts.get(transactionHash);
    const settledStatus = paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture'
      ? 'verified'
      : 'pending';

    if (stored) {
      stored.status = settledStatus;
      this.persistence?.persistReceipt(this.providerId, stored);
      return stored;
    }

    // PaymentIntent exists in Stripe but not in local tracking — build receipt from Stripe data
    const receipt: PaymentReceipt = {
      invoiceId: (paymentIntent.metadata?.invoiceId) ?? crypto.randomUUID(),
      transactionHash: paymentIntent.id,
      paidAt: new Date().toISOString(),
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      status: settledStatus,
    };
    this.receipts.set(paymentIntent.id, receipt);
    return receipt;
  }
}
