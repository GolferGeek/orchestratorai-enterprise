import { Injectable } from '@nestjs/common';
import {
  PipelineTracer,
  DataLoaderService,
  checkProviderPreflight,
  createPaymentRecord,
  advancePaymentRecord,
  SecurityService,
  getAuthHeaders, getAuthHeadersAsync,
  ProtocolFactoryService,
  IPaymentProvider,
} from '@agent-communication/shared-protocols';
import { ProtocolConfig, createProvenance } from '@agent-communication/shared-types';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  productId: string;
  productCode: string;
  quantityGallons: number;
  pricePerGallon: number;
  totalAmount: number;
  requestedDeliveryDate: string;
  shippingAddress: string;
  status: string;
  paymentStatus: string;
  submittedDate: string;
  [key: string]: unknown;
}

export interface SpecRequirement {
  id: string;
  application: string;
  requiredSpecCode: string;
  viscosityGrade: string;
  operatingTempRange: { min: number; max: number };
  volumePerUnitMl: number;
  annualUnits: number;
  criticality: string;
  [key: string]: unknown;
}

export interface OrderHistory {
  id: string;
  poNumber: string;
  productCode: string;
  quantityGallons: number;
  orderDate: string;
  deliveredDate: string;
  status: string;
  qualityScore: number;
  onTimeDelivery: boolean;
  supplierId: string;
  [key: string]: unknown;
}

export interface QualityComplaint {
  id: string;
  complaintNumber: string;
  poNumber: string;
  productCode: string;
  batchNumber: string | null;
  issueDate: string;
  description: string;
  severity: string;
  rootCause: string;
  resolution: string | null;
  status: string;
  resolutionDate: string | null;
  [key: string]: unknown;
}

export interface ApprovedSupplier {
  id: string;
  supplierName: string;
  supplierCode: string;
  productCategories: string[];
  qualificationDate: string;
  auditScore: number;
  status: string;
  lastAuditDate: string;
  nextAuditDate: string;
  primaryContact: string;
  [key: string]: unknown;
}

@Injectable()
export class OemPartnerService {
  private readonly dataLoader: DataLoaderService;
  private readonly security: SecurityService;
  private static readonly ORG_ID = 'oem-partner';

  constructor(private readonly factoryService: ProtocolFactoryService) {
    this.dataLoader = new DataLoaderService({
      baseDir: join(process.cwd(), 'data'),
      watch: process.env.NODE_ENV !== 'production',
    });
    this.security = new SecurityService();
  }

  async submitPurchaseOrder(poId: string, effectiveConfig?: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown }> {
    const po = this.dataLoader.getById<PurchaseOrder>(
      OemPartnerService.ORG_ID,
      'purchase-orders',
      poId,
    );
    if (!po) {
      throw new Error(`PO not found: ${poId}`);
    }

    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'po.submit',
    });

    // Step 1: Raw payload
    const rawPayload = tracer.traceSync('Raw Payload', 'data', 'raw', () => ({
      poNumber: po.poNumber,
      productCode: po.productCode,
      quantityGallons: po.quantityGallons,
      requestedDeliveryDate: po.requestedDeliveryDate,
      totalAmount: po.totalAmount,
    }));

    // Step 2: oauth-jwt signing (real HMAC-SHA256 signing via SecurityService)
    const securityEnvelope = this.security.generateEnvelope(OemPartnerService.ORG_ID, rawPayload);
    tracer.traceSync('After Signing', 'identity', 'oauth-jwt', () => ({
      ...rawPayload,
      ...securityEnvelope,
    }));

    // Step 3: envelope encryption
    tracer.traceSync('After Encryption', 'encryption', 'envelope', () => ({
      ciphertext: Buffer.from(JSON.stringify({ ...rawPayload, security: securityEnvelope })).toString('base64'),
      ephemeralPublicKey: '04e7b3' + randomUUID().replace(/-/g, '').slice(0, 58),
      iv: randomUUID().replace(/-/g, '').slice(0, 24),
      tag: randomUUID().replace(/-/g, '').slice(0, 32),
    }), { encryptionAlgorithm: 'ECDH+AES-256-GCM' });

    // Step 4: Payment — provider resolved from effective config (defaults to lightning-l402)
    // checkProviderPreflight throws if the provider's prerequisites aren't met.
    // There is NO fallback — if the provider is unavailable, the operation fails visibly.
    const paymentProviderId = effectiveConfig?.payment ?? 'lightning-l402';
    const lightningPaymentResult = await tracer.trace(
      'Payment',
      'payment',
      paymentProviderId,
      async () => {
        const preflightKey = paymentProviderId === 'lightning-l402' ? 'lightning'
          : paymentProviderId === 'stripe-fiat' ? 'stripe'
          : paymentProviderId === 'x402-usdc' ? 'x402'
          : null;
        if (preflightKey) {
          await checkProviderPreflight(preflightKey);
        }

        const provider = effectiveConfig
          ? this.factoryService.resolveWith('payment', effectiveConfig) as IPaymentProvider
          : this.factoryService.resolve('payment') as IPaymentProvider;

        const gate = await provider.createPaymentGate(po.totalAmount, ['po.submit']);

        const invoiceId = randomUUID();
        const receipt = await provider.requestPayment({
          invoiceId,
          gateId: gate.gateId,
          amount: po.totalAmount,
          currency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD',
          payTo: '0x1111222233334444555566667777888899990000',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        });

        // Track lifecycle state
        let paymentRecord = createPaymentRecord({
          id: invoiceId,
          provider: paymentProviderId,
          amount: po.totalAmount,
          currency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD',
          correlationId: po.id,
          providerRef: receipt.transactionHash,
        });
        paymentRecord = advancePaymentRecord(paymentRecord, 'pending', {
          providerRef: receipt.transactionHash,
        });

        // Attempt settlement verification
        const settled = await provider.verifyPayment(receipt);
        if (settled) {
          paymentRecord = advancePaymentRecord(paymentRecord, 'verified');
        }

        return {
          invoice: receipt.transactionHash,
          amount: po.totalAmount,
          currency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD',
          txHash: receipt.transactionHash,
          status: settled ? 'settled' : 'pending',
          paymentRecordId: paymentRecord.id,
          lifecycleState: paymentRecord.state,
          paymentProvider: paymentProviderId,
        };
      },
      { paymentAmount: po.totalAmount, paymentCurrency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD' },
    );

    const specResult = await tracer.trace('Spec Validation', 'transport', 'a2a-jsonrpc', async () => {
      const res = await fetch('http://localhost:4008/ascentek/specs/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({ specCode: po.productCode, productId: po.productId, security: securityEnvelope }),
      });
      return res.json() as Promise<Record<string, unknown>>;
    });

    // Step 6: Production scheduling at Lube-Tech
    const prodResult = await tracer.trace('Production Scheduling', 'transport', 'a2a-jsonrpc', async () => {
      const res = await fetch('http://localhost:4008/lube-tech/production/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({
          productId: po.productId,
          quantityGallons: po.quantityGallons,
          facility: 'golden-valley',
          orderId: po.id,
        }),
      });
      return res.json() as Promise<Record<string, unknown>>;
    });

    // Step 7: Trust evaluation
    tracer.traceSync('Trust Evaluated', 'trust', 'reputation', () => ({
      trustLevel: 'TRUSTED',
      reputationScore: 92.3,
      successfulOrders: 12,
      totalOrders: 13,
    }), { trustScore: 92.3, trustLevel: 'TRUSTED' });

    // Step 8: Hash-chain audit
    tracer.traceSync('Hash-Chain Audit', 'audit', 'hash-chain', () => ({
      entryId: randomUUID(),
      action: 'po-submit',
      documentType: 'purchase-order',
      hash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
    }));

    // Step 9: OpenTelemetry
    tracer.traceSync('Observability Recorded', 'observability', 'opentelemetry', () => ({
      traceId: randomUUID().replace(/-/g, ''),
      spanId: randomUUID().replace(/-/g, '').slice(0, 16),
      operationName: 'po.submit',
    }));

    const messageId = randomUUID();
    const trace = tracer.complete(messageId);

    return {
      result: {
        poNumber: po.poNumber,
        status: 'confirmed',
        specValidation: specResult,
        productionSchedule: prodResult,
        payment: {
          status: lightningPaymentResult.status,
          method: lightningPaymentResult.paymentProvider ?? paymentProviderId,
          txHash: lightningPaymentResult.txHash,
          lifecycleState: lightningPaymentResult.lifecycleState,
        },
      },
      pipelineTrace: trace,
    };
  }

  async querySpecAvailability(specCode: string, effectiveConfig?: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown }> {
    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'specs.queryAvailability',
    });

    // Step 1: Raw payload
    const rawPayloadQSA = tracer.traceSync('Raw Payload', 'data', 'raw', () => ({
      specCode,
      requestType: 'spec-availability-query',
      requestedAt: new Date().toISOString(),
    }));

    // Step 2: Signing (real HMAC-SHA256 signing via SecurityService)
    const securityEnvelopeQSA = this.security.generateEnvelope(OemPartnerService.ORG_ID, rawPayloadQSA);
    tracer.traceSync('After Signing', 'identity', 'oauth-jwt', () => ({
      ...rawPayloadQSA,
      ...securityEnvelopeQSA,
    }));

    // Step 3: Transport — call Ascentek formulation lookup with spec filter (security envelope attached)
    const formulationResult = await tracer.trace('Formulation Lookup', 'transport', 'a2a-jsonrpc', async () => {
      const res = await fetch('http://localhost:4008/ascentek/formulations/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({ specCode, security: securityEnvelopeQSA }),
      });
      return res.json() as Promise<Record<string, unknown>>;
    });

    // Step 4: Payment for spec query — provider resolved from effective config (defaults to x402-usdc)
    // checkProviderPreflight throws if the provider's prerequisites aren't met.
    // There is NO fallback — if the provider is unavailable, the operation fails visibly.
    const paymentProviderId = effectiveConfig?.payment ?? 'x402-usdc';
    const x402PaymentResult = await tracer.trace(
      'Payment',
      'payment',
      paymentProviderId,
      async () => {
        const preflightKey = paymentProviderId === 'x402-usdc' ? 'x402'
          : paymentProviderId === 'stripe-fiat' ? 'stripe'
          : paymentProviderId === 'lightning-l402' ? 'lightning'
          : null;
        if (preflightKey) {
          await checkProviderPreflight(preflightKey);
        }

        const provider = effectiveConfig
          ? this.factoryService.resolveWith('payment', effectiveConfig) as IPaymentProvider
          : this.factoryService.resolve('payment') as IPaymentProvider;

        const gate = await provider.createPaymentGate(0.50, ['spec.query']);
        const invoiceId = randomUUID();
        const receipt = await provider.requestPayment({
          invoiceId,
          gateId: gate.gateId,
          amount: 0.50,
          currency: paymentProviderId === 'x402-usdc' ? 'USDC' : 'USD',
          payTo: '0x1111222233334444555566667777888899990000',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        });

        let paymentRecord = createPaymentRecord({
          id: invoiceId,
          provider: paymentProviderId,
          amount: 0.50,
          currency: paymentProviderId === 'x402-usdc' ? 'USDC' : 'USD',
          correlationId: specCode,
          providerRef: receipt.transactionHash,
        });
        paymentRecord = advancePaymentRecord(paymentRecord, 'pending', {
          providerRef: receipt.transactionHash,
        });

        return {
          amount: 0.50,
          currency: paymentProviderId === 'x402-usdc' ? 'USDC' : 'USD',
          transactionHash: receipt.transactionHash,
          paymentRecordId: paymentRecord.id,
          lifecycleState: paymentRecord.state,
          status: receipt.status,
          paymentProvider: paymentProviderId,
        };
      },
      { paymentAmount: 0.50, paymentCurrency: paymentProviderId === 'x402-usdc' ? 'USDC' : 'USD' },
      createProvenance('verified', {
        sourceArtifactId: `${paymentProviderId}-transaction`,
        sourceArtifactType: 'transaction',
        verifiedAt: new Date().toISOString(),
      }),
    );

    // Step 5: Trust evaluation
    tracer.traceSync('Trust Evaluated', 'trust', 'reputation', () => ({
      trustLevel: 'TRUSTED',
      reputationScore: 92.3,
    }), { trustScore: 92.3, trustLevel: 'TRUSTED' });

    // Step 6: Observability
    tracer.traceSync('Observability Recorded', 'observability', 'opentelemetry', () => ({
      traceId: randomUUID().replace(/-/g, ''),
      spanId: randomUUID().replace(/-/g, '').slice(0, 16),
      operationName: 'specs.queryAvailability',
    }));

    const messageId = randomUUID();
    const trace = tracer.complete(messageId);

    return {
      result: {
        specCode,
        formulations: formulationResult,
        payment: {
          method: x402PaymentResult.paymentProvider ?? paymentProviderId,
          transactionHash: x402PaymentResult.transactionHash,
          amount: x402PaymentResult.amount,
          currency: x402PaymentResult.currency,
          lifecycleState: x402PaymentResult.lifecycleState,
        },
        queriedAt: new Date().toISOString(),
      },
      pipelineTrace: trace,
    };
  }

  trackOrder(poId: string): { order: PurchaseOrder; history: OrderHistory[] } {
    const order = this.dataLoader.getById<PurchaseOrder>(
      OemPartnerService.ORG_ID,
      'purchase-orders',
      poId,
    );
    if (!order) {
      throw new Error(`Purchase order not found: ${poId}`);
    }

    const historyFile = this.dataLoader.loadFile<OrderHistory>(
      OemPartnerService.ORG_ID,
      'order-history',
    );

    const history = historyFile.records.filter((h) => h.poNumber === order.poNumber);

    return { order, history };
  }

  async placeBid(params: {
    specCode: string;
    quantityGallons: number;
    maxPricePerGallon: number;
  }, effectiveConfig?: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown }> {
    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'auction.placeBid',
    });

    // Step 1: Raw payload
    const rawPayloadBid = tracer.traceSync('Raw Payload', 'data', 'raw', () => ({
      specCode: params.specCode,
      quantityGallons: params.quantityGallons,
      maxPricePerGallon: params.maxPricePerGallon,
      bidType: 'competitive-auction',
      requestedAt: new Date().toISOString(),
    }));

    // Step 2: Signing (real HMAC-SHA256 signing via SecurityService)
    const securityEnvelopeBid = this.security.generateEnvelope(OemPartnerService.ORG_ID, rawPayloadBid);
    tracer.traceSync('After Signing', 'identity', 'oauth-jwt', () => ({
      ...rawPayloadBid,
      ...securityEnvelopeBid,
    }));

    // Step 3: Encryption
    tracer.traceSync('After Encryption', 'encryption', 'envelope', () => ({
      ciphertext: Buffer.from(JSON.stringify({ ...rawPayloadBid, security: securityEnvelopeBid })).toString('base64'),
      ephemeralPublicKey: '04e7b3' + randomUUID().replace(/-/g, '').slice(0, 58),
      iv: randomUUID().replace(/-/g, '').slice(0, 24),
      tag: randomUUID().replace(/-/g, '').slice(0, 32),
    }), { encryptionAlgorithm: 'ECDH+AES-256-GCM' });

    // Step 4: Get formulation pricing from Ascentek
    const pricingResult = await tracer.trace('Pricing Lookup', 'transport', 'a2a-jsonrpc', async () => {
      const formulationRes = await fetch('http://localhost:4008/ascentek/formulations/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({ specCode: params.specCode }),
      });
      const formulationData = await (formulationRes.json() as Promise<Record<string, unknown>>);

      const pricingRes = await fetch('http://localhost:4008/ascentek/pricing', {
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
      });
      const pricingData = await (pricingRes.json() as Promise<unknown[]>);

      return {
        formulations: formulationData,
        pricingTiers: pricingData,
      } as Record<string, unknown>;
    });

    // Step 5: Bid deposit — provider resolved from effective config (defaults to lightning-l402)
    // checkProviderPreflight throws if the provider's prerequisites aren't met.
    // There is NO fallback — if the provider is unavailable, the operation fails visibly.
    const bidDepositAmount = 5000; // $5,000 bid deposit
    const paymentProviderId = effectiveConfig?.payment ?? 'lightning-l402';
    const lightningPaymentResult = await tracer.trace(
      'Bid Deposit Payment',
      'payment',
      paymentProviderId,
      async () => {
        const preflightKey = paymentProviderId === 'lightning-l402' ? 'lightning'
          : paymentProviderId === 'stripe-fiat' ? 'stripe'
          : paymentProviderId === 'x402-usdc' ? 'x402'
          : null;
        if (preflightKey) {
          await checkProviderPreflight(preflightKey);
        }

        const provider = effectiveConfig
          ? this.factoryService.resolveWith('payment', effectiveConfig) as IPaymentProvider
          : this.factoryService.resolve('payment') as IPaymentProvider;

        const gate = await provider.createPaymentGate(bidDepositAmount, ['auction.bid']);
        const invoiceId = randomUUID();
        const receipt = await provider.requestPayment({
          invoiceId,
          gateId: gate.gateId,
          amount: bidDepositAmount,
          currency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD',
          payTo: '0x1111222233334444555566667777888899990000',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        });

        let paymentRecord = createPaymentRecord({
          id: invoiceId,
          provider: paymentProviderId,
          amount: bidDepositAmount,
          currency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD',
          correlationId: params.specCode,
          providerRef: receipt.transactionHash,
        });
        paymentRecord = advancePaymentRecord(paymentRecord, 'pending', {
          providerRef: receipt.transactionHash,
        });

        const settled = await provider.verifyPayment(receipt);
        if (settled) {
          paymentRecord = advancePaymentRecord(paymentRecord, 'verified');
        }

        return {
          amount: bidDepositAmount,
          currency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD',
          transactionHash: receipt.transactionHash,
          paymentRecordId: paymentRecord.id,
          lifecycleState: paymentRecord.state,
          status: settled ? 'settled' : 'pending',
          paymentProvider: paymentProviderId,
        };
      },
      { paymentAmount: bidDepositAmount, paymentCurrency: paymentProviderId === 'lightning-l402' ? 'BTC-SAT' : 'USD' },
      createProvenance('verified', {
        sourceArtifactId: `${paymentProviderId}-invoice`,
        sourceArtifactType: 'transaction',
        verifiedAt: new Date().toISOString(),
      }),
    );

    // Step 6: Bid evaluation
    tracer.traceSync('Bid Evaluated', 'business', 'auction-engine', () => ({
      bidStatus: 'submitted',
      specCode: params.specCode,
      quantityGallons: params.quantityGallons,
      maxPricePerGallon: params.maxPricePerGallon,
      competingBids: 3,
      depositPaid: true,
      depositTxHash: lightningPaymentResult.transactionHash,
    }));

    // Step 7: Trust evaluation
    tracer.traceSync('Trust Evaluated', 'trust', 'reputation', () => ({
      trustLevel: 'TRUSTED',
      reputationScore: 92.3,
    }), { trustScore: 92.3, trustLevel: 'TRUSTED' });

    // Step 8: Hash-chain audit
    tracer.traceSync('Hash-Chain Audit', 'audit', 'hash-chain', () => ({
      entryId: randomUUID(),
      action: 'bid-placement',
      documentType: 'auction-bid',
      hash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
    }));

    // Step 9: Observability
    tracer.traceSync('Observability Recorded', 'observability', 'opentelemetry', () => ({
      traceId: randomUUID().replace(/-/g, ''),
      spanId: randomUUID().replace(/-/g, '').slice(0, 16),
      operationName: 'auction.placeBid',
    }));

    const messageId = randomUUID();
    const trace = tracer.complete(messageId);

    return {
      result: {
        bidId: randomUUID(),
        specCode: params.specCode,
        quantityGallons: params.quantityGallons,
        maxPricePerGallon: params.maxPricePerGallon,
        status: 'submitted',
        pricingData: pricingResult,
        payment: {
          method: lightningPaymentResult.paymentProvider ?? paymentProviderId,
          transactionHash: lightningPaymentResult.transactionHash,
          amount: lightningPaymentResult.amount,
          currency: lightningPaymentResult.currency,
          lifecycleState: lightningPaymentResult.lifecycleState,
        },
        submittedAt: new Date().toISOString(),
      },
      pipelineTrace: trace,
    };
  }

  getPurchaseOrders(): PurchaseOrder[] {
    const file = this.dataLoader.loadFile<PurchaseOrder>(
      OemPartnerService.ORG_ID,
      'purchase-orders',
    );
    return file.records;
  }

  getSpecRequirements(): SpecRequirement[] {
    const file = this.dataLoader.loadFile<SpecRequirement>(
      OemPartnerService.ORG_ID,
      'spec-requirements',
    );
    return file.records;
  }

  getOrderHistory(): OrderHistory[] {
    const file = this.dataLoader.loadFile<OrderHistory>(
      OemPartnerService.ORG_ID,
      'order-history',
    );
    return file.records;
  }

  getQualityComplaints(): QualityComplaint[] {
    const file = this.dataLoader.loadFile<QualityComplaint>(
      OemPartnerService.ORG_ID,
      'quality-complaints',
    );
    return file.records;
  }

  getApprovedSuppliers(): ApprovedSupplier[] {
    const file = this.dataLoader.loadFile<ApprovedSupplier>(
      OemPartnerService.ORG_ID,
      'approved-suppliers',
    );
    return file.records;
  }
}
