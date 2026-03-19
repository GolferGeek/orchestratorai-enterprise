import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PaymentPersistenceService,
  PersistedPaymentReceipt,
  LightningL402PaymentProvider,
  StripeFiatPaymentProvider,
  X402UsdcPaymentProvider,
  checkProviderPreflight,
} from '@agent-communication/shared-protocols';
import { join } from 'path';

export interface PaymentVerifyRequest {
  /** The invoiceId used as the payment record ID */
  paymentRecordId: string;
  /** Which provider to reconcile against: 'lightning-l402' | 'stripe-fiat' | 'x402-usdc' */
  provider: string;
}

export interface PaymentVerifyResult {
  paymentRecordId: string;
  provider: string;
  storedStatus: 'verified' | 'pending' | 'failed';
  providerStatus: 'verified' | 'pending' | 'failed';
  reconciled: boolean;
  reconciledAt: string;
  error?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly persistence: PaymentPersistenceService;

  constructor() {
    this.persistence = new PaymentPersistenceService(
      process.env.PROTOCOL_API_DATA_DIR ?? join(process.cwd(), 'data'),
    );
  }

  /**
   * Retrieve all persisted payment receipts.
   */
  getAllReceipts(): PersistedPaymentReceipt[] {
    return this.persistence.loadReceipts();
  }

  /**
   * Retrieve a single payment receipt by its invoiceId (which is the record ID).
   */
  getReceipt(paymentRecordId: string): PersistedPaymentReceipt {
    const receipts = this.persistence.loadReceipts();
    const receipt = receipts.find((r) => r.id === paymentRecordId);
    if (!receipt) {
      throw new NotFoundException(`Payment record not found: ${paymentRecordId}`);
    }
    return receipt;
  }

  /**
   * Verify a payment record by reconciling its stored state against the live provider.
   *
   * For Lightning: queries LND for invoice settlement status.
   * For Stripe: retrieves PaymentIntent from Stripe API.
   * For x402: queries Base Sepolia for transaction receipt.
   *
   * Throws if the provider is not configured — NO FALLBACK.
   */
  async verifyPayment(req: PaymentVerifyRequest): Promise<PaymentVerifyResult> {
    const receipts = this.persistence.loadReceipts();
    const stored = receipts.find((r) => r.id === req.paymentRecordId);

    if (!stored) {
      throw new NotFoundException(
        `Payment record not found: ${req.paymentRecordId}`,
      );
    }

    this.logger.log(
      `Verifying payment ${req.paymentRecordId} via ${req.provider}`,
    );

    const reconciledAt = new Date().toISOString();

    // Determine provider key for preflight
    const providerKey = this.resolveProviderPreflightKey(req.provider);

    // Preflight check — throws if provider is not configured
    await checkProviderPreflight(providerKey);

    // Build the appropriate provider and check live status
    const liveVerified = await this.checkLiveStatus(stored, req.provider);

    const liveStatus: 'verified' | 'pending' | 'failed' = liveVerified ? 'verified' : 'pending';
    const reconciled = stored.status === liveStatus;

    if (!reconciled) {
      this.logger.warn(
        `Payment ${req.paymentRecordId} status mismatch: stored=${stored.status} live=${liveStatus}`,
      );
    }

    return {
      paymentRecordId: req.paymentRecordId,
      provider: req.provider,
      storedStatus: stored.status,
      providerStatus: liveStatus,
      reconciled,
      reconciledAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolveProviderPreflightKey(
    provider: string,
  ): 'lightning' | 'stripe' | 'x402' {
    if (provider === 'lightning-l402') return 'lightning';
    if (provider === 'stripe-fiat') return 'stripe';
    if (provider === 'x402-usdc') return 'x402';
    throw new Error(
      `Unknown payment provider: ${provider}. Expected one of: lightning-l402, stripe-fiat, x402-usdc`,
    );
  }

  private async checkLiveStatus(
    stored: PersistedPaymentReceipt,
    provider: string,
  ): Promise<boolean> {
    if (!stored.transactionHash) {
      return false;
    }

    if (provider === 'lightning-l402') {
      const lndProvider = new LightningL402PaymentProvider(this.persistence);
      return lndProvider.verifyPayment({
        invoiceId: stored.invoiceId,
        transactionHash: stored.transactionHash,
        paidAt: stored.paidAt,
        amount: stored.amount,
        currency: stored.currency,
        status: stored.status,
      });
    }

    if (provider === 'stripe-fiat') {
      const stripeProvider = new StripeFiatPaymentProvider(undefined, this.persistence);
      return stripeProvider.verifyPayment({
        invoiceId: stored.invoiceId,
        transactionHash: stored.transactionHash,
        paidAt: stored.paidAt,
        amount: stored.amount,
        currency: stored.currency,
        status: stored.status,
      });
    }

    if (provider === 'x402-usdc') {
      const x402Provider = new X402UsdcPaymentProvider(this.persistence);
      return x402Provider.verifyPayment({
        invoiceId: stored.invoiceId,
        transactionHash: stored.transactionHash,
        paidAt: stored.paidAt,
        amount: stored.amount,
        currency: stored.currency,
        status: stored.status,
      });
    }

    throw new Error(`Unknown payment provider: ${provider}`);
  }
}
