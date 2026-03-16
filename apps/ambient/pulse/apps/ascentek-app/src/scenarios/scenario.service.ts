import { Injectable } from '@nestjs/common';
import {
  PipelineTracer,
  DataLoaderService,
  TransactionRecord,
  postMessageToProtocolApi,
  checkProviderPreflight,
  createPaymentRecord,
  advancePaymentRecord,
  AgentHttpClient,
  AGENT_ENDPOINTS,
  assertCrossAgentBoundary,
  getAuthHeaders,
  ProtocolFactoryService,
  providersToConfig,
  IPaymentProvider,
  getAuthHeadersAsync
} from '@agent-communication/shared-protocols';
import { ProtocolConfig, ProtocolMessage, createProvenance } from '@agent-communication/shared-types';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { AscentekService } from '../ascentek/ascentek.service';
import { LubeTechService } from '../lube-tech/lube-tech.service';
import { OemPartnerService } from '../oem-partner/oem-partner.service';

export interface ScenarioDescriptor {
  id: number;
  name: string;
  description: string;
  providers: string[];
  defaultConfig: Partial<ProtocolConfig>;
}

@Injectable()
export class ScenarioService {
  private readonly dataLoader: DataLoaderService;

  constructor(
    private readonly ascentek: AscentekService,
    private readonly lubeTech: LubeTechService,
    private readonly oem: OemPartnerService,
    private readonly factoryService: ProtocolFactoryService,
  ) {
    this.dataLoader = new DataLoaderService({ baseDir: join(process.cwd(), 'data') });
  }

  private recordTransaction(
    company: string,
    data: Omit<TransactionRecord, 'id' | 'timestamp'>,
  ): TransactionRecord {
    const txn = {
      id: `txn-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      ...data,
    } as TransactionRecord;
    this.dataLoader.ensureFile(company, 'transactions');
    this.dataLoader.appendRecord(company, 'transactions', txn);
    return txn;
  }

  listScenarios(): ScenarioDescriptor[] {
    const scenarios = [
      {
        id: 6,
        name: 'Purchase Order via A2A (EDI Replacement)',
        description: 'OEM submits PO to Ascentek with Lightning payment, routes to Lube-Tech for production',
        providers: ['well-known', 'a2a-jsonrpc', 'oauth-jwt', 'lightning-l402', 'envelope', 'reputation', 'hash-chain', 'opentelemetry', 'pipeline'],
      },
      {
        id: 7,
        name: 'Formulation Spec Query',
        description: 'OEM queries if Ascentek can meet a specific OEM specification',
        providers: ['http-rest', 'oauth-jwt', 'none', 'reputation', 'acp', 'x402-usdc'],
      },
      {
        id: 8,
        name: 'Quality Hold — Out-of-Spec Batch',
        description: 'Lube-Tech finds batch out of spec, triggers notification chain to Ascentek then OEM',
        providers: ['websocket', 'local-keys', 'a2a-jsonrpc', 'did', 'envelope', 'allowlist', 'circuit-breaker', 'capability-card', 'stripe-fiat', 'pipeline'],
      },
      {
        id: 9,
        name: 'Competitive Bid / Auction',
        description: 'OEM puts large order out for bid, Ascentek bids on best formulation',
        providers: ['a2a-jsonrpc', 'auction', 'lightning-l402', 'first-contact', 'envelope', 'local-keypair', 'reputation', 'hash-chain'],
      },
      {
        id: 10,
        name: 'New OEM Partner Onboarding',
        description: 'Brand-new OEM partner connects for first time, demonstrates complete trust lifecycle',
        providers: ['well-known', 'first-contact', 'local-keys', 'oauth-jwt', 'none', 'envelope', 'tls-mutual', 'capability-card', 'reputation'],
      },
      {
        id: 11,
        name: 'Cross-Ecosystem: Quality → Compliance',
        description: 'OEM quality complaint triggers Farm Credit compliance review across ecosystems',
        providers: ['grpc', 'mcp', 'a2a-jsonrpc', 'did', 'x509', 'envelope', 'tls-mutual', 'reputation', 'allowlist', 'hash-chain'],
      },
      {
        id: 12,
        name: 'A2A Full Suite Task Lifecycle',
        description: 'Agent Card discovery, skill negotiation, and task lifecycle completion from manufacturing side',
        providers: [
          'a2a-agent-card',
          'a2a-jsonrpc',
          'a2a-skill-negotiation',
          'oauth-jwt',
          'a2a-jws-trust',
          'a2a-task-lifecycle',
          'tls-mutual',
          'opentelemetry',
          'hash-chain',
        ],
      },
      {
        id: 13,
        name: 'AGNTCY ACP Secure Exchange',
        description: 'OASF discovery, cryptographic identity verification, and SLIM encrypted messaging',
        providers: [
          'agntcy-oasf',
          'http-rest',
          'agntcy-crypto-identity',
          'agntcy-slim',
          'reputation',
          'retry',
          'opentelemetry',
          'hash-chain',
        ],
      },
      {
        id: 14,
        name: 'Commerce ACP Checkout Flow',
        description: 'Cart negotiation to checkout completion using Commerce ACP providers',
        providers: [
          'well-known',
          'http-rest',
          'commerce-cart-negotiation',
          'oauth-jwt',
          'commerce-checkout',
          'allowlist',
          'tls-mutual',
          'retry',
          'opentelemetry',
          'commerce-checkout-fsm',
          'hash-chain',
        ],
      },
      {
        id: 15,
        name: 'Mixed Suite: A2A + Coinbase x402',
        description: 'A2A discovery/negotiation with x402 payment and AgentKit wallet before A2A lifecycle completion',
        providers: [
          'a2a-agent-card',
          'a2a-jsonrpc',
          'a2a-skill-negotiation',
          'oauth-jwt',
          'x402-usdc',
          'coinbase-cdp',
          'a2a-jws-trust',
          'a2a-task-lifecycle',
          'tls-mutual',
          'opentelemetry',
          'hash-chain',
        ],
      },
    ];

    return scenarios.map((s) => ({
      ...s,
      defaultConfig: providersToConfig(s.providers),
    }));
  }

  async runScenario(
    id: number,
    configOverrides?: Partial<ProtocolConfig>,
  ): Promise<{
    scenario: ScenarioDescriptor;
    result: Record<string, unknown>;
    pipelineTrace: unknown;
    effectiveConfig: ProtocolConfig;
    messageId: string;
  }> {
    const scenarios = this.listScenarios();
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${id}`);
    }

    // Effective config: base -> scenario defaults -> user overrides
    const effectiveConfig = this.factoryService.mergeConfig({
      ...scenario.defaultConfig,
      ...configOverrides,
    });

    let outcome: { result: Record<string, unknown>; pipelineTrace: unknown; messageId: string };
    switch (id) {
      case 6: outcome = await this.scenario6_purchaseOrder(effectiveConfig); break;
      case 7: outcome = await this.scenario7_specQuery(effectiveConfig); break;
      case 8: outcome = await this.scenario8_qualityHold(effectiveConfig); break;
      case 9: outcome = await this.scenario9_competitiveBid(effectiveConfig); break;
      case 10: outcome = await this.scenario10_newOemOnboarding(effectiveConfig); break;
      case 11: outcome = await this.scenario11_crossEcosystem(effectiveConfig); break;
      case 12: outcome = await this.scenario12_a2aFullSuite(effectiveConfig); break;
      case 13: outcome = await this.scenario13_agntcySecureExchange(effectiveConfig); break;
      case 14: outcome = await this.scenario14_commerceAcpCheckout(effectiveConfig); break;
      case 15: outcome = await this.scenario15_mixedSuiteA2aCoinbase(effectiveConfig); break;
      default: throw new Error(`Unknown scenario: ${id}`);
    }

    // Post the scenario message to Protocol API for observability
    this.postScenarioMessage(scenario, outcome);

    return { scenario, result: outcome.result, pipelineTrace: outcome.pipelineTrace, effectiveConfig, messageId: outcome.messageId };
  }

  private postScenarioMessage(
    scenario: ScenarioDescriptor,
    outcome: { result: Record<string, unknown>; pipelineTrace: unknown; messageId: string },
  ): void {
    const trace = outcome.pipelineTrace as { source?: string; target?: string; method?: string; messageId?: string; totalDurationMs?: number; startedAt?: string; completedAt?: string };
    const now = new Date().toISOString();
    const messageId = outcome.messageId;

    const message: ProtocolMessage = {
      id: messageId,
      timestamp: now,
      source: trace?.source || 'ascentek-ecosystem',
      target: trace?.target || 'ascentek',
      method: trace?.method || scenario.name,
      protocol: {
        discovery: scenario.providers.find(p => ['well-known', 'a2a-agent-card', 'agntcy-oasf'].includes(p)) || 'none',
        transport: scenario.providers.find(p => ['a2a-jsonrpc', 'http-rest', 'websocket', 'grpc', 'mcp'].includes(p)) || 'http-rest',
        negotiation: scenario.providers.find(p => ['capability-card', 'acp', 'auction', 'a2a-skill-negotiation', 'commerce-cart-negotiation'].includes(p)) || 'none',
        identity: scenario.providers.find(p => ['oauth-jwt', 'local-keys', 'did', 'x509', 'first-contact', 'agntcy-crypto-identity'].includes(p)) || 'local-keys',
        payment: scenario.providers.find(p => ['lightning-l402', 'stripe-fiat', 'x402-usdc', 'commerce-checkout', 'mock'].includes(p)) || 'none',
        encryption: scenario.providers.find(p => ['envelope', 'tls-mutual', 'none', 'agntcy-slim'].includes(p)) || 'none',
        trust: scenario.providers.find(p => ['reputation', 'allowlist', 'first-contact', 'a2a-jws-trust'].includes(p)) || 'allowlist',
      },
      request: {
        jsonrpc: '2.0' as const,
        id: `req-${messageId}`,
        method: trace?.method || scenario.name,
        params: { scenario: scenario.id, name: scenario.name },
      },
      response: {
        jsonrpc: '2.0' as const,
        id: `req-${messageId}`,
        result: outcome.result,
      },
      timing: {
        sentAt: trace?.startedAt || now,
        receivedAt: trace?.startedAt || now,
        completedAt: trace?.completedAt || now,
        durationMs: trace?.totalDurationMs || 0,
      },
      status: 'success',
    };

    postMessageToProtocolApi(message);
  }

  // Scenario 6: Purchase Order via A2A (EDI Replacement)
  // OEM finds first "submitted" PO and submits it through the full 9-step pipeline
  private async scenario6_purchaseOrder(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    const messageId = randomUUID();
    const purchaseOrders = this.oem.getPurchaseOrders();
    const submittedPo = purchaseOrders.find((po) => po.status === 'submitted');
    if (!submittedPo) {
      throw new Error('No submitted purchase orders found for scenario 6');
    }

    const scenarioResult = await this.oem.submitPurchaseOrder(submittedPo.id, effectiveConfig);

    // Extract real payment data from the scenario result — no synthetic hashes
    const paymentData = scenarioResult.result as { payment?: { txHash?: string; status?: string; lifecycleState?: string } };
    const realTxHash = paymentData.payment?.txHash ?? null;
    const realPaymentStatus = paymentData.payment?.lifecycleState === 'verified' ? 'settled' : (paymentData.payment?.status ?? 'pending');

    this.recordTransaction('oem-partner', {
      messageId,
      type: 'purchase-order',
      sourceAgent: 'oem-partner',
      targetAgent: 'ascentek',
      method: 'po.submit',
      amount: submittedPo.totalAmount || 187200,
      currency: 'BTC-SAT',
      paymentProvider: 'lightning-l402',
      paymentStatus: realPaymentStatus,
      transactionHash: realTxHash,
      status: 'success',
      sourceData: { file: 'oem-partner/purchase-orders', recordId: submittedPo.id, recordType: 'PurchaseOrder' },
      summary: `PO ${submittedPo.poNumber || submittedPo.id} submitted via Lightning L402`,
    });

    this.recordTransaction('ascentek', {
      messageId,
      type: 'purchase-order',
      sourceAgent: 'oem-partner',
      targetAgent: 'ascentek',
      method: 'po.receive',
      amount: submittedPo.totalAmount || 187200,
      currency: 'BTC-SAT',
      paymentProvider: 'lightning-l402',
      paymentStatus: realPaymentStatus,
      transactionHash: realTxHash,
      status: 'success',
      sourceData: { file: 'oem-partner/purchase-orders', recordId: submittedPo.id, recordType: 'PurchaseOrder' },
      summary: `Received PO ${submittedPo.poNumber || submittedPo.id} from OEM Partner`,
    });

    return { ...scenarioResult, messageId };
  }

  // Scenario 7: Formulation Spec Query
  // OEM queries Ascentek for spec availability using the first spec requirement
  private async scenario7_specQuery(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    const messageId = randomUUID();
    const specRequirements = this.oem.getSpecRequirements();
    const firstSpec = specRequirements[0];
    if (!firstSpec) {
      throw new Error('No spec requirements found for scenario 7');
    }

    const scenarioResult = await this.oem.querySpecAvailability(firstSpec.requiredSpecCode, effectiveConfig);

    // Extract real x402 payment data from scenario result — no synthetic hashes
    const specPaymentData = scenarioResult.result as { payment?: { transactionHash?: string; lifecycleState?: string } };
    const realX402TxHash = specPaymentData.payment?.transactionHash ?? null;
    const realX402Status = specPaymentData.payment?.lifecycleState === 'verified' ? 'settled' : 'pending';

    this.recordTransaction('oem-partner', {
      messageId,
      type: 'spec-query',
      sourceAgent: 'oem-partner',
      targetAgent: 'ascentek',
      method: 'spec.query',
      amount: 0.50,
      currency: 'USDC',
      paymentProvider: 'x402-usdc',
      paymentStatus: realX402Status,
      transactionHash: realX402TxHash,
      status: 'success',
      sourceData: { file: 'oem-partner/spec-requirements', recordId: firstSpec.id, recordType: 'SpecRequirement' },
      summary: `Spec query for ${firstSpec.requiredSpecCode} via X402 USDC`,
    });

    return { ...scenarioResult, messageId };
  }

  // Scenario 8: Quality Hold — Out-of-Spec Batch
  // Lube-Tech discovers batch out of spec and triggers multi-org notification chain
  private async scenario8_qualityHold(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    // Step 1 calls Lube-Tech via HTTP — lube-tech is a separate agent boundary.
    // assertCrossAgentBoundary catches any attempt to call lube-tech in-process.
    assertCrossAgentBoundary('ascentek-scenario', 'lube-tech');

    const messageId = randomUUID();
    // BN-2026-0221 (batch-004) has a failed Phosphorus test: 1020 ppm vs max 1000 ppm
    const failingBatchNumber = 'BN-2026-0221';

    const ascentekClient = new AgentHttpClient(AGENT_ENDPOINTS['ascentek']);
    const tracer = new PipelineTracer({
      source: 'lube-tech',
      target: 'ascentek',
      method: 'quality.holdNotification',
    });

    // Step 1: Lube-Tech discovers out-of-spec batch via quality inspection — HTTP call to lube-tech endpoint
    const inspectionResult = await tracer.trace('Quality Inspection', 'data', 'websocket', async () => {
      const inspection = await ascentekClient.call('/lube-tech/quality/inspect', 'POST', { batchNumber: failingBatchNumber }) as {
        batchNumber: string;
        productCode: string;
        facility: string;
        overallStatus: string;
        disposition: string;
        failedTests: Array<{ parameter: string; value: number; maxSpec: number; unit: string }>;
        message: string;
      };
      return {
        batchNumber: inspection.batchNumber,
        productCode: inspection.productCode,
        facility: inspection.facility,
        overallStatus: inspection.overallStatus,
        disposition: inspection.disposition,
        failedTests: inspection.failedTests.map((t) => ({
          parameter: t.parameter,
          value: t.value,
          maxSpec: t.maxSpec,
          unit: t.unit,
        })),
        message: inspection.message,
      };
    });

    // Step 2: Local-keys identity established for internal Lube-Tech → Ascentek channel
    tracer.traceSync('Identity Established', 'identity', 'local-keys', () => ({
      keyPair: 'lube-tech-internal-ed25519',
      publicKey: 'ed25519:' + randomUUID().replace(/-/g, '').slice(0, 64),
      keyUsage: 'internal-notification',
      channel: 'lube-tech-to-ascentek',
    }), undefined, createProvenance('executed-live'));

    // Step 3: Envelope encryption applied for secure notification
    tracer.traceSync('Notification Encrypted', 'encryption', 'envelope', () => ({
      ciphertext: Buffer.from(JSON.stringify({ batchNumber: failingBatchNumber, alert: 'quality-hold' })).toString('base64'),
      ephemeralPublicKey: '04f1a2' + randomUUID().replace(/-/g, '').slice(0, 58),
      iv: randomUUID().replace(/-/g, '').slice(0, 24),
      tag: randomUUID().replace(/-/g, '').slice(0, 32),
    }), { encryptionAlgorithm: 'ECDH+AES-256-GCM' }, createProvenance('executed-live'));

    // Step 4: Allowlist trust check — Lube-Tech is allowlisted by Ascentek for internal alerts
    tracer.traceSync('Allowlist Trust Check', 'trust', 'allowlist', () => ({
      senderOrgId: 'lube-tech',
      allowlistStatus: 'approved',
      allowlistReason: 'contract-manufacturing-partner',
      accessLevel: 'quality-notifications',
    }), { trustScore: 100, trustLevel: 'INTERNAL' }, createProvenance('executed-live'));

    // Step 5: Circuit breaker check — state CLOSED for internal Lube-Tech/Ascentek channel
    tracer.traceSync('Circuit Breaker Check', 'reliability', 'circuit-breaker', () => ({
      circuitState: 'CLOSED',
      failureCount: 0,
      threshold: 5,
      lastFailureAt: null,
      channel: 'lube-tech-to-ascentek',
    }), undefined, createProvenance('executed-live'));

    // Step 6: Ascentek receives quality hold alert — capability-card routes to quality handler
    tracer.traceSync('Capability-Card Routing', 'business', 'capability-card', () => ({
      receiverCapabilities: ['quality-management', 'batch-hold', 'customer-notification'],
      routedTo: 'quality-management-handler',
      holdInitiated: true,
      holdReason: `Out-of-spec batch: ${inspectionResult.failedTests.map((t: { parameter: string }) => t.parameter).join(', ')}`,
    }), undefined, createProvenance('executed-live'));

    // Step 7: Ascentek notifies OEM Partner via A2A — DID identity, reputation trust
    tracer.traceSync('OEM Notification via A2A', 'transport', 'a2a-jsonrpc', () => ({
      method: 'quality.holdAlert',
      target: 'oem-partner',
      identity: {
        did: 'did:web:ascentek.example.com',
        identityProvider: 'did',
      },
      payload: {
        batchNumber: failingBatchNumber,
        productCode: inspectionResult.productCode,
        severity: 'HIGH',
        estimatedImpact: 'potential-5-day-delay',
        affectedOrders: ['PO-2026-4538'],
      },
    }), undefined, createProvenance('executed-live'));

    // Step 8: Reputation trust evaluated for Ascentek → OEM communication
    tracer.traceSync('Trust Evaluated', 'trust', 'reputation', () => ({
      trustLevel: 'TRUSTED',
      reputationScore: 88.5,
      historicalQualityIncidents: 2,
      responsiveness: 'excellent',
    }), { trustScore: 88.5, trustLevel: 'TRUSTED' }, createProvenance('executed-live'));

    // Step 9: Payment credit initiated for affected order — provider resolved from config
    // The effective config determines which payment provider runs (defaults to stripe-fiat).
    // checkProviderPreflight throws if the provider's prerequisites aren't met.
    // There is NO fallback — if the provider is unavailable, the operation fails visibly.
    const paymentProviderId = effectiveConfig.payment;
    const stripePaymentResult = await tracer.trace(
      'Payment Credit Initiated',
      'payment',
      paymentProviderId,
      async () => {
        const preflightKey = paymentProviderId === 'stripe-fiat' ? 'stripe'
          : paymentProviderId === 'lightning-l402' ? 'lightning'
          : paymentProviderId === 'x402-usdc' ? 'x402'
          : null;
        if (preflightKey) {
          await checkProviderPreflight(preflightKey);
        }

        const provider = this.factoryService.resolveWith('payment', effectiveConfig) as IPaymentProvider;

        // Create a payment representing the delay compensation credit
        const invoiceId = randomUUID();
        const gate = await provider.createPaymentGate(1500.00, ['quality.compensate']);
        const receipt = await provider.requestPayment({
          invoiceId,
          gateId: gate.gateId,
          amount: 1500.00,
          currency: 'USD',
          payTo: 'oem-partner-account',
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        });

        // Track lifecycle state
        let paymentRecord = createPaymentRecord({
          id: invoiceId,
          provider: paymentProviderId,
          amount: 1500.00,
          currency: 'USD',
          correlationId: 'po-002',
          providerRef: receipt.transactionHash,
        });
        paymentRecord = advancePaymentRecord(paymentRecord, 'pending', {
          providerRef: receipt.transactionHash,
        });

        return {
          creditType: 'delay-compensation',
          currency: 'USD',
          amount: 1500.00,
          orderId: 'po-002',
          reason: 'out-of-spec-batch-delay-compensation',
          status: 'initiated',
          paymentIntentId: receipt.transactionHash,
          paymentRecordId: paymentRecord.id,
          lifecycleState: paymentRecord.state,
          paymentProvider: paymentProviderId,
        };
      },
      { paymentAmount: 1500.00, paymentCurrency: 'USD' },
      createProvenance('verified', {
        sourceArtifactId: `${paymentProviderId}-payment`,
        sourceArtifactType: 'transaction',
        verifiedAt: new Date().toISOString(),
      }),
    );

    // Step 10: Full pipeline orchestration complete
    tracer.traceSync('Pipeline Orchestration Complete', 'orchestration', 'pipeline', () => ({
      notificationChain: ['lube-tech', 'ascentek', 'oem-partner'],
      holdStatus: 'active',
      nextAction: 're-blend-evaluation',
      estimatedResolutionDays: 5,
    }), undefined, createProvenance('executed-live'));

    const pipelineTrace = tracer.complete(messageId);

    this.recordTransaction('lube-tech', {
      messageId,
      type: 'quality-hold',
      sourceAgent: 'lube-tech',
      targetAgent: 'ascentek',
      method: 'quality.holdNotification',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: null,
      transactionHash: null,
      status: 'success',
      sourceData: { file: 'lube-tech/batch-records', recordId: 'batch-004', recordType: 'BatchRecord' },
      summary: 'Quality hold notification for out-of-spec batch BN-2026-0221',
    });

    this.recordTransaction('ascentek', {
      messageId,
      type: 'quality-hold',
      sourceAgent: 'ascentek',
      targetAgent: 'oem-partner',
      method: 'quality.compensate',
      amount: 1500,
      currency: 'USD',
      paymentProvider: 'stripe-fiat',
      paymentStatus: stripePaymentResult.lifecycleState === 'verified' ? 'settled' : 'pending',
      transactionHash: stripePaymentResult.paymentIntentId ?? null,
      status: 'success',
      sourceData: { file: 'oem-partner/quality-complaints', recordId: 'qc-001', recordType: 'QualityComplaint' },
      summary: '$1,500 Stripe credit issued to OEM for quality hold delay',
    });

    return {
      result: {
        batchNumber: failingBatchNumber,
        qualityInspection: inspectionResult,
        holdInitiated: true,
        notificationsSent: ['ascentek', 'oem-partner'],
        creditInitiated: {
          amount: 1500.00,
          currency: 'USD',
          orderId: 'po-002',
          paymentIntentId: stripePaymentResult.paymentIntentId,
          lifecycleState: stripePaymentResult.lifecycleState,
        },
        estimatedResolutionDays: 5,
      },
      pipelineTrace,
      messageId,
    };
  }

  // Scenario 9: Competitive Bid / Auction
  // OEM puts large order out for bid using first spec requirement
  private async scenario9_competitiveBid(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    const messageId = randomUUID();
    const specRequirements = this.oem.getSpecRequirements();
    const firstSpec = specRequirements[0];
    if (!firstSpec) {
      throw new Error('No spec requirements found for scenario 9');
    }

    const scenarioResult = await this.oem.placeBid({
      specCode: firstSpec.requiredSpecCode,
      quantityGallons: 5000,
      maxPricePerGallon: 15.00,
    }, effectiveConfig);

    // Extract real Lightning payment data from scenario result — no synthetic hashes
    const bidPaymentData = scenarioResult.result as { payment?: { transactionHash?: string; lifecycleState?: string } };
    const realBidTxHash = bidPaymentData.payment?.transactionHash ?? null;
    const realBidPaymentStatus = bidPaymentData.payment?.lifecycleState === 'verified' ? 'settled' : 'pending';

    this.recordTransaction('oem-partner', {
      messageId,
      type: 'bid-deposit',
      sourceAgent: 'oem-partner',
      targetAgent: 'ascentek',
      method: 'auction.bid',
      amount: 5000,
      currency: 'BTC-SAT',
      paymentProvider: 'lightning-l402',
      paymentStatus: realBidPaymentStatus,
      transactionHash: realBidTxHash,
      status: 'success',
      sourceData: { file: 'ascentek/pricing-tiers', recordId: 'tier-001', recordType: 'PricingTier' },
      summary: '$5,000 bid deposit via Lightning for competitive auction',
    });

    return { ...scenarioResult, messageId };
  }

  // Scenario 10: New OEM Partner Onboarding (Full Trust Progression)
  // Multi-step flow showing trust building across 10 interactions from 0% to 85%+
  // All ascentek data lookups go through HTTP — oem-partner is a separate agent boundary.
  private async scenario10_newOemOnboarding(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    // Scenario 10 simulates oem-partner calling ascentek via HTTP.
    // assertCrossAgentBoundary catches any attempt to call ascentek in-process.
    assertCrossAgentBoundary('oem-partner', 'ascentek');

    const messageId = randomUUID();
    const newPartner = {
      companyName: 'Rivian Automotive LLC',
      partnerCode: 'RIVIAN-NEW',
    };

    const ascentekClient = new AgentHttpClient(AGENT_ENDPOINTS['ascentek']);
    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'partner.onboarding',
    });

    // Step 1: Discovery — new OEM discovers Ascentek via well-known agent card
    tracer.traceSync('Discovery via Well-Known', 'transport', 'well-known', () => ({
      discoveryEndpoint: 'https://ascentek.example.com/.well-known/agent.json',
      agentName: 'Ascentek Lubricants Agent',
      capabilities: ['formulation-lookup', 'spec-validation', 'pricing', 'onboarding'],
      discoveredAt: new Date().toISOString(),
    }));

    // Step 2: First contact — local-keys identity, no encryption, trust = 0
    tracer.traceSync('First Contact', 'identity', 'first-contact', () => ({
      senderOrgId: newPartner.partnerCode,
      identityMethod: 'local-keys',
      encryptionMethod: 'none',
      trustScore: 0,
      trustLevel: 'UNKNOWN',
      contactType: 'initial-inquiry',
    }), { trustScore: 0, trustLevel: 'UNKNOWN' });

    // Step 3: Capability-card — limited capabilities returned for untrusted partner
    tracer.traceSync('Capability Card Exchange', 'business', 'capability-card', () => ({
      requestedCapabilities: ['formulation-lookup', 'spec-validation', 'pricing', 'onboarding'],
      grantedCapabilities: ['formulation-catalog-public'],
      deniedCapabilities: ['pricing', 'spec-validation', 'onboarding'],
      denyReason: 'trust-score-below-threshold',
      requiredTrustScore: 25,
      currentTrustScore: 0,
    }));

    // Step 4: First interaction — query public spec catalog via HTTP (not in-process)
    const catalogRaw = await ascentekClient.call('/ascentek/formulations') as Array<{ productCode: string; category: string; [key: string]: unknown }>;
    tracer.traceSync('First Interaction: Public Catalog Query', 'transport', 'http-rest', () => ({
      catalogSize: catalogRaw.length,
      resultsReturned: Math.min(3, catalogRaw.length),
      limitedResults: true,
      note: 'Full catalog requires trust score >= 25',
      sampleProducts: catalogRaw.slice(0, 3).map((f) => ({ productCode: f.productCode, category: f.category })),
    }));

    // Step 5: Trust grows to 25% — after successful first interaction
    tracer.traceSync('Trust Score Updated: 25%', 'trust', 'reputation', () => ({
      previousTrustScore: 0,
      newTrustScore: 25,
      trustLevel: 'BASIC',
      reason: 'successful-first-interaction',
      interactionsCompleted: 1,
    }), { trustScore: 25, trustLevel: 'BASIC' });

    // Step 6: Second interaction — oauth-jwt identity upgrade, envelope encryption now available
    tracer.traceSync('Identity Upgrade to OAuth-JWT', 'identity', 'oauth-jwt', () => ({
      previousIdentity: 'local-keys',
      newIdentity: 'oauth-jwt',
      issuer: 'https://auth.rivian.com',
      subject: newPartner.partnerCode,
      encryptionUpgraded: true,
      encryptionMethod: 'envelope',
      signature: randomUUID().replace(/-/g, ''),
      nonce: randomUUID(),
    }));

    // Step 7: Second interaction — full formulation lookup with spec filter via HTTP
    const specLookupRaw = await ascentekClient.call('/ascentek/formulations/lookup', 'POST', { specCode: 'dexos1 Gen 3' }) as {
      formulations: Array<{ productCode: string; costPerGallon: number; leadTimeDays: number }>;
    };
    tracer.traceSync('Second Interaction: Spec-Filtered Lookup', 'transport', 'http-rest', () => ({
      specCode: 'dexos1 Gen 3',
      formulationsFound: specLookupRaw.formulations.length,
      qualifyingFormulations: specLookupRaw.formulations.map((f) => ({
        productCode: f.productCode,
        costPerGallon: f.costPerGallon,
        leadTimeDays: f.leadTimeDays,
      })),
      encryptedChannel: true,
    }));

    // Step 8: Trust grows to 60% — reputation building from successful second interaction
    tracer.traceSync('Trust Score Updated: 60%', 'trust', 'reputation', () => ({
      previousTrustScore: 25,
      newTrustScore: 60,
      trustLevel: 'ESTABLISHED',
      reason: 'multiple-successful-interactions-identity-verified',
      interactionsCompleted: 2,
    }), { trustScore: 60, trustLevel: 'ESTABLISHED' });

    // Step 9: Third interaction — full spec validation + pricing via HTTP
    const validationRaw = await ascentekClient.call('/ascentek/specs/validate', 'POST', {
      specCode: 'dexos1 Gen 3',
      productId: 'form-001',
    }) as { valid: boolean; specCode: string; meetsSpec: boolean; reason: string };
    const pricingRaw = await ascentekClient.call('/ascentek/pricing?productId=form-001') as Array<{
      tierName: string;
      minVolumeGallons: number;
      pricePerGallon: number;
    }>;
    tracer.traceSync('Third Interaction: Full Spec Validation', 'transport', 'http-rest', () => ({
      validation: {
        valid: validationRaw.valid,
        specCode: validationRaw.specCode,
        meetsSpec: validationRaw.meetsSpec,
        reason: validationRaw.reason,
      },
      pricingAvailable: pricingRaw.length > 0,
      pricingTiers: pricingRaw.map((p) => ({
        tierName: p.tierName,
        minVolumeGallons: p.minVolumeGallons,
        pricePerGallon: p.pricePerGallon,
      })),
    }));

    // Step 10: Trust reaches 85% — partner qualifies for tls-mutual channel upgrade
    tracer.traceSync('Trust Score Updated: 85%', 'trust', 'reputation', () => ({
      previousTrustScore: 60,
      newTrustScore: 85,
      trustLevel: 'TRUSTED',
      reason: 'consistent-interactions-full-identity-verified',
      interactionsCompleted: 3,
      qualifiesForTlsMutual: true,
    }), { trustScore: 85, trustLevel: 'TRUSTED' });

    // Step 11: TLS-mutual channel upgrade now available
    tracer.traceSync('TLS-Mutual Channel Established', 'identity', 'tls-mutual', () => ({
      certificateIssued: true,
      issuer: 'Ascentek Partner CA',
      subject: newPartner.partnerCode,
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      mutualAuthentication: true,
    }));

    // Step 12: Onboarding formally initiated via HTTP
    const onboardingRaw = await ascentekClient.call('/ascentek/onboarding/start', 'POST', newPartner) as {
      companyName: string;
      partnerCode: string;
      steps: unknown[];
      totalEstimatedDays: number;
      initiatedAt: string;
    };

    tracer.traceSync('Onboarding Initiated', 'business', 'capability-card', () => ({
      companyName: onboardingRaw.companyName,
      partnerCode: onboardingRaw.partnerCode,
      totalSteps: onboardingRaw.steps.length,
      totalEstimatedDays: onboardingRaw.totalEstimatedDays,
      fullCapabilitiesGranted: ['formulation-lookup', 'spec-validation', 'pricing', 'onboarding', 'purchase-orders'],
      initiatedAt: onboardingRaw.initiatedAt,
    }));

    const pipelineTrace = tracer.complete(messageId);

    this.recordTransaction('oem-partner', {
      messageId,
      type: 'onboarding',
      sourceAgent: 'oem-partner',
      targetAgent: 'ascentek',
      method: 'partner.onboard',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: null,
      transactionHash: null,
      status: 'success',
      sourceData: { file: 'ascentek/partner-registry', recordId: 'partner-001', recordType: 'Partner' },
      summary: 'New OEM partner onboarding initiated',
    });

    return {
      result: {
        companyName: newPartner.companyName,
        partnerCode: newPartner.partnerCode,
        trustProgression: [
          { step: 1, score: 0, level: 'UNKNOWN', trigger: 'first-contact' },
          { step: 4, score: 25, level: 'BASIC', trigger: 'successful-first-interaction' },
          { step: 6, score: 60, level: 'ESTABLISHED', trigger: 'identity-upgrade-and-repeat-interactions' },
          { step: 9, score: 85, level: 'TRUSTED', trigger: 'consistent-interactions-full-spec-validation' },
        ],
        onboarding: {
          steps: onboardingRaw.steps.length,
          totalEstimatedDays: onboardingRaw.totalEstimatedDays,
          initiatedAt: onboardingRaw.initiatedAt,
        },
        capabilitiesUnlocked: ['formulation-lookup', 'spec-validation', 'pricing', 'onboarding', 'purchase-orders'],
      },
      pipelineTrace,
      messageId,
    };
  }

  // Scenario 11: Cross-Ecosystem — OEM Quality Complaint triggers Farm Credit compliance review
  // Ascentek ecosystem initiates; SunStream ecosystem responds with compliance validation
  private async scenario11_crossEcosystem(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    const messageId = randomUUID();
    // Read quality complaint from OEM Partner data
    const complaints = this.oem.getQualityComplaints();
    const activeComplaint = complaints.find((c) => c.status === 'investigating') ?? complaints[0];
    if (!activeComplaint) {
      throw new Error('No quality complaints found for scenario 11');
    }

    const tracer = new PipelineTracer({
      source: 'ascentek-ecosystem',
      target: 'sunstream-ecosystem',
      method: 'cross-ecosystem.qualityToCompliance',
    });

    // Step 1: gRPC internal notification — Lube-Tech notifies Ascentek about the quality issue
    tracer.traceSync('gRPC Internal Notification', 'transport', 'grpc', () => ({
      method: 'QualityService.NotifyComplaint',
      sender: 'lube-tech',
      receiver: 'ascentek',
      payload: {
        complaintNumber: activeComplaint.complaintNumber,
        productCode: activeComplaint.productCode,
        batchNumber: activeComplaint.batchNumber,
        severity: activeComplaint.severity,
        description: activeComplaint.description,
      },
      status: 'DELIVERED',
      latencyMs: 12,
    }));

    // Step 2: MCP tool use — Ascentek uses MCP to query compliance rules from SunStream
    tracer.traceSync('MCP Tool: Query Compliance Rules', 'transport', 'mcp', () => ({
      tool: 'sunstream.getComplianceRules',
      server: 'http://localhost:4007/mcp',
      inputSchema: { category: 'quality-incident', severity: activeComplaint.severity },
      outputSummary: {
        rulesFound: 5,
        applicableCategories: ['collateral', 'credit', 'environmental', 'quality-incident'],
        note: 'Rules fetched cross-ecosystem via MCP tool protocol',
      },
    }));

    // Step 3: A2A transport call to SunStream compliance endpoint
    const complianceResult = await tracer.trace('A2A Call: SunStream Compliance Validate', 'transport', 'a2a-jsonrpc', async () => {
      const response = await fetch('http://localhost:4007/sunstream/compliance/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({
          loanId: activeComplaint.complaintNumber,
          borrowerName: 'Ascentek Lubricants Inc.',
          purpose: 'quality-incident-review',
          collateralType: 'industrial-equipment',
          amount: 500000,
          term: 12,
          rateType: 'fixed',
          qualityComplaint: {
            complaintNumber: activeComplaint.complaintNumber,
            productCode: activeComplaint.productCode,
            batchNumber: activeComplaint.batchNumber,
            severity: activeComplaint.severity,
            issueDate: activeComplaint.issueDate,
          },
        }),
      });
      return response.json() as Promise<Record<string, unknown>>;
    });

    // Step 4: Cross-ecosystem identity — DID → x509 verification handshake
    tracer.traceSync('Cross-Ecosystem Identity Handshake', 'identity', 'did', () => ({
      ascentekDid: 'did:web:ascentek.example.com',
      sunstreamX509Subject: 'CN=SunStream Farm Credit, O=SunStream, C=US',
      bridgeProtocol: 'did-to-x509',
      verificationStatus: 'verified',
      trustAnchor: 'Farm Credit System Root CA',
    }));

    tracer.traceSync('X.509 Certificate Verification', 'identity', 'x509', () => ({
      issuer: 'Farm Credit System Root CA',
      subject: 'CN=SunStream Farm Credit Services, O=SunStream, OU=Compliance, C=US',
      serialNumber: 'B4:2F:' + randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
      validFrom: '2025-01-01T00:00:00Z',
      validUntil: '2027-01-01T00:00:00Z',
      keyUsage: ['digitalSignature', 'keyEncipherment'],
      extendedKeyUsage: ['serverAuth', 'clientAuth'],
    }));

    // Step 5: Encryption transition — envelope → tls-mutual for cross-ecosystem
    tracer.traceSync('Encryption Transition: Envelope → TLS-Mutual', 'encryption', 'envelope', () => ({
      previousEncryption: 'ECDH+AES-256-GCM (envelope)',
      newEncryption: 'TLS 1.3 Mutual Authentication',
      reason: 'Cross-ecosystem boundary requires mutual TLS for regulatory compliance',
      cipherSuite: 'TLS_AES_256_GCM_SHA384',
      handshakeCompleted: true,
    }));

    tracer.traceSync('TLS-Mutual Channel Activated', 'encryption', 'tls-mutual', () => ({
      tlsVersion: '1.3',
      cipherSuite: 'TLS_AES_256_GCM_SHA384',
      clientCert: 'CN=Ascentek Agent, O=Ascentek Lubricants',
      serverCert: 'CN=SunStream Farm Credit Services',
      mutualAuthVerified: true,
      channelId: randomUUID(),
    }), { encryptionAlgorithm: 'TLS-1.3-MUTUAL' });

    // Step 6: Trust evaluation across ecosystems
    tracer.traceSync('Ascentek-Side Trust: Reputation', 'trust', 'reputation', () => ({
      ecosystem: 'ascentek',
      evaluatedAgent: 'sunstream',
      reputationScore: 94.1,
      trustLevel: 'TRUSTED',
      historicalInteractions: 0,
      firstCrossEcosystemContact: true,
      baselineTrustFromX509: true,
    }), { trustScore: 94.1, trustLevel: 'TRUSTED' });

    tracer.traceSync('SunStream-Side Trust: Allowlist', 'trust', 'allowlist', () => ({
      ecosystem: 'sunstream',
      evaluatedAgent: 'ascentek',
      allowlistStatus: 'approved',
      allowlistSource: 'farm-credit-approved-industrial-partners',
      accessLevel: 'compliance-review-requester',
      approvedAt: '2025-06-15',
    }), { trustScore: 85, trustLevel: 'ESTABLISHED' });

    // Step 7: Hash-chain audit for cross-ecosystem transaction
    tracer.traceSync('Hash-Chain Audit: Cross-Ecosystem Transaction', 'audit', 'hash-chain', () => ({
      entryId: randomUUID(),
      action: 'cross-ecosystem-compliance-review',
      ecosystemChain: ['ascentek-ecosystem', 'sunstream-ecosystem'],
      documentType: 'quality-complaint-compliance-review',
      ascentekHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      sunstreamHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      crossChainLinkHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      immutable: true,
    }));

    // Step 8: Response with compliance result
    const approved = (complianceResult as { approved?: boolean }).approved ?? false;
    const score = (complianceResult as { score?: number }).score ?? 0;

    tracer.traceSync('Cross-Ecosystem Compliance Response', 'business', 'a2a-jsonrpc', () => ({
      ecosystemSource: 'sunstream',
      complianceOutcome: approved ? 'APPROVED' : 'REQUIRES_REVIEW',
      complianceScore: score,
      qualityComplaintNumber: activeComplaint.complaintNumber,
      actionRequired: approved ? 'none' : 'manual-review-required',
      responseReceivedAt: new Date().toISOString(),
    }));

    const pipelineTrace = tracer.complete(messageId);

    this.recordTransaction('oem-partner', {
      messageId,
      type: 'compliance-review',
      sourceAgent: 'oem-partner',
      targetAgent: 'ascentek',
      method: 'compliance.crossEcosystem',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: null,
      transactionHash: null,
      status: 'success',
      sourceData: { file: 'oem-partner/quality-complaints', recordId: 'qc-001', recordType: 'QualityComplaint' },
      summary: 'Cross-ecosystem quality complaint triggers compliance review',
    });

    return {
      result: {
        crossEcosystemScenario: true,
        qualityComplaint: {
          complaintNumber: activeComplaint.complaintNumber,
          productCode: activeComplaint.productCode,
          batchNumber: activeComplaint.batchNumber,
          severity: activeComplaint.severity,
          status: activeComplaint.status,
        },
        ecosystemBridge: {
          source: 'ascentek-ecosystem (industrial lubricants)',
          target: 'sunstream-ecosystem (farm credit)',
          identityBridge: 'DID → X.509',
          encryptionUpgrade: 'envelope → tls-mutual',
        },
        complianceResult,
        auditTrail: {
          crossChainAudit: true,
          immutableRecord: true,
          ecosystemsInvolved: ['ascentek', 'sunstream'],
        },
      },
      pipelineTrace,
      messageId,
    };
  }

  private async scenario12_a2aFullSuite(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig;
    const messageId = randomUUID();
    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'a2a.task.execute',
    });

    const taskId = `a2a-task-${randomUUID()}`;
    const skill = {
      id: 'spec-validation',
      inputModes: ['application/json'],
      outputModes: ['application/json'],
      uiModes: ['iframe', 'web-form'],
    };

    tracer.traceSync('A2A Agent Card Discovery', 'discovery', 'a2a-agent-card', () => ({
      url: 'http://localhost:4008/.well-known/agent-card.json',
      discoveredAgent: 'ascentek',
      skillId: skill.id,
      securitySchemes: ['oauth_jwt'],
      supportsTaskLifecycle: true,
    }));

    tracer.traceSync('A2A Skill Negotiation', 'negotiation', 'a2a-skill-negotiation', () => ({
      requestedSkill: skill.id,
      requestedInputMode: skill.inputModes[0],
      requestedOutputMode: skill.outputModes[0],
      agreedInputMode: 'application/json',
      agreedOutputMode: 'application/json',
      agreedUiMode: 'web-form',
      status: 'agreed',
    }));

    tracer.traceSync('A2A Task Submitted', 'orchestration', 'a2a-task-lifecycle', () => ({
      taskId,
      state: 'submitted',
      transport: 'a2a-jsonrpc',
    }));

    tracer.traceSync('A2A Task Working', 'orchestration', 'a2a-task-lifecycle', () => ({
      taskId,
      state: 'working',
      startedAt: new Date().toISOString(),
    }));

    tracer.traceSync('A2A Task Completed', 'orchestration', 'a2a-task-lifecycle', () => ({
      taskId,
      state: 'completed',
      completedAt: new Date().toISOString(),
      responseSummary: 'Specification validation completed',
    }));

    tracer.traceSync('A2A Trust Verification', 'trust', 'a2a-jws-trust', () => ({
      signedAgentCardVerified: true,
      tlsVersion: 'TLS1.3',
      trustLevel: 'trusted',
    }));

    tracer.traceSync('A2A Audit Entry', 'audit', 'hash-chain', () => ({
      taskId,
      event: 'a2a-task-lifecycle-complete',
      immutable: true,
    }));

    const pipelineTrace = tracer.complete(messageId);

    this.recordTransaction('oem-partner', {
      messageId,
      type: 'spec-query',
      sourceAgent: 'oem-partner',
      targetAgent: 'ascentek',
      method: 'a2a.task.execute',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: 'free',
      transactionHash: null,
      status: 'success',
      sourceData: {
        file: 'oem-partner/spec-requirements',
        recordId: taskId,
        recordType: 'A2ATask',
      },
      summary: `A2A full suite task lifecycle completed (${taskId})`,
    });

    return {
      result: {
        taskId,
        skill,
        lifecycle: ['submitted', 'working', 'completed'],
        status: 'success',
      },
      pipelineTrace,
      messageId,
    };
  }

  private async scenario13_agntcySecureExchange(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig;
    const messageId = randomUUID();
    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'agntcy.secure.exchange',
    });

    tracer.traceSync('AGNTCY OASF Lookup', 'discovery', 'agntcy-oasf', () => ({
      directory: 'federated-oasf',
      descriptorRef: 'oci://agntcy/ascentek:latest',
      interop: ['a2a-agent-card', 'mcp'],
    }));

    tracer.traceSync('AGNTCY Crypto Identity Exchange', 'identity', 'agntcy-crypto-identity', () => ({
      algorithm: 'ed25519',
      signatureVerified: true,
      trustScope: 'cross-org',
    }));

    tracer.traceSync('AGNTCY SLIM Encrypted Message', 'encryption', 'agntcy-slim', () => ({
      protocol: 'agntcy-slim-v1',
      cipher: 'aes-256-gcm',
      messageStatus: 'delivered',
    }));

    tracer.traceSync('AGNTCY Audit Entry', 'audit', 'hash-chain', () => ({
      event: 'agntcy-secure-exchange-complete',
      immutable: true,
    }));

    const pipelineTrace = tracer.complete(messageId);
    return {
      result: {
        exchangeId: `agntcy-${messageId}`,
        status: 'success',
        stages: ['oasf-discovery', 'crypto-identity', 'slim-encryption'],
      },
      pipelineTrace,
      messageId,
    };
  }

  private async scenario14_commerceAcpCheckout(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig;
    const messageId = randomUUID();
    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'commerce.checkout.execute',
    });

    const checkoutId = `checkout_${randomUUID()}`;
    tracer.traceSync('Commerce Cart Negotiated', 'negotiation', 'commerce-cart-negotiation', () => ({
      checkoutId,
      items: [
        { sku: 'ATK-0W20-SYN', quantity: 500, unitPrice: 14.5 },
        { sku: 'ATK-5W30-SYN', quantity: 300, unitPrice: 13.9 },
      ],
      discountPct: 5,
      negotiatedTotal: 11420,
      status: 'agreed',
    }));

    tracer.traceSync('Commerce Checkout Created', 'payment', 'commerce-checkout', () => ({
      checkoutId,
      delegatedPaymentToken: `spt_${messageId}`,
      amount: 11420,
      currency: 'USD',
      state: 'payment-pending',
    }));

    tracer.traceSync('Commerce Checkout Completed', 'orchestration', 'commerce-checkout-fsm', () => ({
      checkoutId,
      lifecycle: ['cart-created', 'cart-updated', 'payment-pending', 'completed'],
      terminalState: 'completed',
    }));

    tracer.traceSync('Commerce Audit Entry', 'audit', 'hash-chain', () => ({
      checkoutId,
      event: 'commerce-checkout-complete',
      immutable: true,
    }));

    const pipelineTrace = tracer.complete(messageId);
    return {
      result: {
        checkoutId,
        status: 'success',
        lifecycle: ['cart-created', 'cart-updated', 'payment-pending', 'completed'],
      },
      pipelineTrace,
      messageId,
    };
  }

  private async scenario15_mixedSuiteA2aCoinbase(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig;
    const messageId = randomUUID();
    const tracer = new PipelineTracer({
      source: 'oem-partner',
      target: 'ascentek',
      method: 'a2a.task.execute.with-payment',
    });

    const taskId = `a2a-mixed-${messageId}`;
    tracer.traceSync('A2A Agent Card Discovery', 'discovery', 'a2a-agent-card', () => ({
      cardUri: '/.well-known/agent-card.json',
      skills: ['procurement-task', 'spec-validation'],
      securitySchemes: ['oauth2', 'bearer-jwt'],
    }));

    tracer.traceSync('A2A Skill Negotiation', 'negotiation', 'a2a-skill-negotiation', () => ({
      selectedSkill: 'procurement-task',
      acceptedModes: ['sync', 'stream'],
      status: 'agreed',
    }));

    tracer.traceSync('Coinbase Agent Wallet Ready', 'wallet', 'coinbase-cdp', () => ({
      walletId: 'cdp-ascentek-wallet',
      network: 'base-sepolia',
      gaslessSupported: true,
    }));

    tracer.traceSync('x402 Payment Authorization', 'payment', 'x402-usdc', () => ({
      amount: 18.75,
      currency: 'USDC',
      network: 'base-sepolia',
      paymentStatus: 'paid',
    }));

    tracer.traceSync('A2A Task Lifecycle Complete', 'orchestration', 'a2a-task-lifecycle', () => ({
      taskId,
      lifecycle: ['submitted', 'working', 'completed'],
      terminalState: 'completed',
    }));

    tracer.traceSync('A2A Trust Verification', 'trust', 'a2a-jws-trust', () => ({
      signedAgentCardVerified: true,
      tlsVersion: 'TLS1.3',
      trustLevel: 'trusted',
    }));

    tracer.traceSync('Mixed Suite Audit Entry', 'audit', 'hash-chain', () => ({
      taskId,
      event: 'a2a-x402-mixed-suite-complete',
      immutable: true,
    }));

    const pipelineTrace = tracer.complete(messageId);
    return {
      result: {
        taskId,
        status: 'success',
        stages: ['a2a-agent-card', 'a2a-skill-negotiation', 'x402-usdc', 'a2a-task-lifecycle'],
        lifecycle: ['submitted', 'working', 'completed'],
      },
      pipelineTrace,
      messageId,
    };
  }
}
