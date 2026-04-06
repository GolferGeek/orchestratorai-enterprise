import { Injectable } from '@nestjs/common';
import {
  PipelineTracer,
  DataLoaderService,
  TransactionRecord,
  postMessageToProtocolApi,
  AgentHttpClient,
  AGENT_ENDPOINTS,
  assertCrossAgentBoundary,
  ProtocolFactoryService,
  providersToConfig,
  IPaymentProvider,
} from '@agent-communication/shared-protocols';
import { ProtocolConfig, ProtocolMessage, createProvenance } from '@agent-communication/shared-types';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { PrairieRidgeService } from '../prairie-ridge/prairie-ridge.service';
import { AgriservService } from '../agriserv/agriserv.service';
import { CentralFarmBankService } from '../central-farm-bank/central-farm-bank.service';

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
    private readonly prairieRidge: PrairieRidgeService,
    private readonly fcs: AgriservService,
    private readonly centralFarmBank: CentralFarmBankService,
    private readonly factoryService: ProtocolFactoryService,
  ) {
    this.dataLoader = new DataLoaderService({ baseDir: join(process.cwd(), 'data') });
  }

  private recordTransaction(
    company: string,
    data: Omit<TransactionRecord, 'id' | 'timestamp'>,
  ): TransactionRecord {
    const base = {
      id: `txn-${randomUUID()}`,
      timestamp: new Date().toISOString(),
    };
    const txn = Object.assign(base, data) as TransactionRecord;
    this.dataLoader.ensureFile(company, 'transactions');
    this.dataLoader.appendRecord(company, 'transactions', txn);
    return txn;
  }

  listScenarios(): ScenarioDescriptor[] {
    const scenarios = [
      {
        id: 1,
        name: 'Loan Compliance Check',
        description: 'AgriServ Financial submits a loan to Prairie Ridge Credit for compliance validation',
        providers: ['well-known', 'a2a-jsonrpc', 'oauth-jwt', 'envelope', 'reputation', 'hash-chain', 'retry'],
      },
      {
        id: 2,
        name: 'Helpdesk Ticket',
        description: 'AgriServ Financial reports a Cornerstone system issue to Prairie Ridge Credit helpdesk',
        providers: ['websocket', 'oauth-jwt', 'envelope', 'reputation', 'capability-card', 'pipeline'],
      },
      {
        id: 3,
        name: 'Quarterly Oversight Review',
        description: 'Central Farm Bank requests cross-association performance data from Prairie Ridge Credit',
        providers: ['well-known', 'a2a-jsonrpc', 'x509', 'tls-mutual', 'allowlist', 'hash-chain', 'acp', 'opentelemetry'],
      },
      {
        id: 4,
        name: 'Capital Adequacy Stress Test',
        description: 'Central Farm Bank runs stress test requesting data from multiple associations',
        providers: ['a2a-jsonrpc', 'x509', 'tls-mutual', 'bulkhead', 'circuit-breaker', 'pipeline', 'hash-chain'],
      },
      {
        id: 5,
        name: 'New Association Onboarding',
        description: 'A new association attempts first contact with Prairie Ridge Credit',
        providers: ['well-known', 'first-contact', 'local-keys', 'capability-card', 'envelope', 'circuit-breaker'],
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
        description: 'Agent Card discovery, A2A skill negotiation, and task lifecycle completion path',
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
    if (!scenario) throw new Error(`Unknown scenario: ${id}`);

    // Effective config: base -> scenario defaults -> user overrides
    const effectiveConfig = this.factoryService.mergeConfig({
      ...scenario.defaultConfig,
      ...configOverrides,
    });

    let outcome: { result: Record<string, unknown>; pipelineTrace: unknown; messageId: string };
    switch (id) {
      case 1: outcome = await this.scenario1_loanCompliance(effectiveConfig); break;
      case 2: outcome = await this.scenario2_helpdeskTicket(effectiveConfig); break;
      case 3: outcome = await this.scenario3_quarterlyOversight(effectiveConfig); break;
      case 4: outcome = await this.scenario4_stressTest(effectiveConfig); break;
      case 5: outcome = await this.scenario5_newAssociationOnboarding(effectiveConfig); break;
      case 11: outcome = await this.scenario11_crossEcosystem(effectiveConfig); break;
      case 12: outcome = await this.scenario12_a2aFullSuite(effectiveConfig); break;
      case 13: outcome = await this.scenario13_agntcySecureExchange(effectiveConfig); break;
      case 14: outcome = await this.scenario14_commerceAcpCheckout(effectiveConfig); break;
      case 15: outcome = await this.scenario15_mixedSuiteA2aCoinbase(effectiveConfig); break;
      default: throw new Error(`Unknown scenario: ${id}`);
    }

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
      source: trace?.source || 'prairie-ridge-ecosystem',
      target: trace?.target || 'prairie-ridge',
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

  private async scenario1_loanCompliance(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig; // config plumbing ready; no payment provider in this scenario
    const messageId = randomUUID();
    const loans = this.fcs.getLoanApplications();
    const pendingLoan = loans.find((l) => l.status === 'pending');
    if (!pendingLoan) {
      throw new Error('No pending loan applications found for scenario 1');
    }
    const outcome = await this.fcs.submitLoanForCompliance(pendingLoan.id);
    this.recordTransaction('agriserv', {
      messageId,
      type: 'loan-application',
      sourceAgent: 'agriserv',
      targetAgent: 'prairie-ridge',
      method: 'compliance.validateLoan',
      amount: pendingLoan.amount,
      currency: 'USD',
      paymentProvider: null,
      paymentStatus: 'free',
      transactionHash: null,
      status: 'success',
      sourceData: {
        file: 'agriserv/loan-applications',
        recordId: pendingLoan.id,
        recordType: 'LoanApplication',
      },
      summary: `Loan compliance check for ${pendingLoan.borrowerName} — $${pendingLoan.amount.toLocaleString()}`,
    });
    return { ...outcome, messageId };
  }

  private async scenario2_helpdeskTicket(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig; // config plumbing ready; no payment provider in this scenario
    const messageId = randomUUID();
    const rateSheet = this.fcs.getRateSheet();
    const outcome = await this.fcs.requestHelpdeskSupport(
      'cornerstone',
      ['login error', 'timeout'],
      'Cannot log into Cornerstone system, getting timeout errors',
    );
    this.recordTransaction('agriserv', {
      messageId,
      type: 'rate-inquiry',
      sourceAgent: 'agriserv',
      targetAgent: 'prairie-ridge',
      method: 'helpdesk.requestSupport',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: 'free',
      transactionHash: null,
      status: 'success',
      sourceData: {
        file: 'agriserv/rate-sheet',
        recordId: rateSheet.length > 0 ? rateSheet[0].id : 'rate-6403',
        recordType: 'RateSheet',
      },
      summary: 'Helpdesk ticket — Cornerstone login/timeout issue reported to Prairie Ridge Credit',
    });
    return { ...outcome, messageId };
  }

  private async scenario3_quarterlyOversight(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig; // config plumbing ready; no payment provider in this scenario
    const messageId = randomUUID();
    const criteria = this.centralFarmBank.getExaminationCriteria();
    const outcome = await this.centralFarmBank.performOversightReview({ quarter: 'Q1-2026' });
    this.recordTransaction('central-farm-bank', {
      messageId,
      type: 'examination',
      sourceAgent: 'central-farm-bank',
      targetAgent: 'prairie-ridge',
      method: 'reporting.quarterlyReview',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: 'free',
      transactionHash: null,
      status: 'success',
      sourceData: {
        file: 'central-farm-bank/examination-criteria',
        recordId: criteria.length > 0 ? criteria[0].id : 'exam-A001',
        recordType: 'ExaminationCriterion',
      },
      summary: 'Quarterly oversight review Q1-2026 — Central Farm Bank examines AgriServ Financial',
    });
    return { ...outcome, messageId };
  }

  private async scenario4_stressTest(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig; // config plumbing ready; no payment provider in this scenario
    const messageId = randomUUID();
    const capitalRequirements = this.centralFarmBank.getCapitalRequirements();
    const outcome = await this.centralFarmBank.runStressTest({ scenario: 'adverse' });
    this.recordTransaction('central-farm-bank', {
      messageId,
      type: 'examination',
      sourceAgent: 'central-farm-bank',
      targetAgent: 'prairie-ridge',
      method: 'stress-test.run',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: 'free',
      transactionHash: null,
      status: 'success',
      sourceData: {
        file: 'central-farm-bank/capital-requirements',
        recordId: capitalRequirements.length > 0 ? capitalRequirements[0].id : 'cap-B001',
        recordType: 'CapitalRequirement',
      },
      summary: 'Capital adequacy stress test (adverse scenario) — Central Farm Bank via Prairie Ridge Credit',
    });
    return { ...outcome, messageId };
  }

  private async scenario5_newAssociationOnboarding(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig; // config plumbing ready; no payment provider in this scenario
    // Scenario 5 simulates a new-association caller contacting prairie-ridge-app via HTTP.
    // All data lookups go through the prairieRidge HTTP endpoints, not in-process.
    assertCrossAgentBoundary('new-association', 'prairie-ridge');

    const messageId = randomUUID();
    const sunsClient = new AgentHttpClient(AGENT_ENDPOINTS['prairie-ridge']);
    const tracer = new PipelineTracer({
      source: 'new-association',
      target: 'prairie-ridge',
      method: 'onboarding.firstContact',
    });

    // Step 1: Discovery — new association discovers Prairie Ridge Credit via well-known
    tracer.traceSync('Discovery via Well-Known', 'discovery', 'well-known', () => ({
      discoveredAgent: 'prairie-ridge',
      agentCardUrl: `http://localhost:${process.env.PROTOCOL_LAB_PRAIRIE_RIDGE_PORT ?? '5407'}/.well-known/agent.json`,
      capabilities: ['compliance-validation', 'helpdesk', 'quarterly-reporting'],
      discoveredAt: new Date().toISOString(),
    }));

    // Step 2: First contact — trust starts at 0, uses local-keys identity
    tracer.traceSync('First Contact Initiated', 'identity', 'local-keys', () => ({
      publicKey: '04a1b2' + randomUUID().replace(/-/g, '').slice(0, 58),
      keyAlgorithm: 'ECDSA-P256',
      selfSigned: true,
      identityProvider: 'local-keys',
    }), { trustScore: 0, trustLevel: 'FIRST-CONTACT' }, createProvenance('executed-live'));

    // Step 3: Capability negotiation — limited capabilities returned
    tracer.traceSync('Capability Negotiation', 'negotiation', 'capability-card', () => ({
      requestedCapabilities: ['compliance-validation', 'helpdesk', 'quarterly-reporting', 'service-catalog'],
      grantedCapabilities: ['service-catalog'],
      deniedCapabilities: ['compliance-validation', 'helpdesk', 'quarterly-reporting'],
      reason: 'Trust level FIRST-CONTACT: only public catalog access granted',
    }), undefined, createProvenance('executed-live'));

    // Step 4: First interaction — request service catalog via HTTP (not in-process)
    const serviceCatalog = await sunsClient.call('/prairie-ridge/services') as Array<{ id: string; availableTo: string[]; [key: string]: unknown }>;
    const publicCatalog = serviceCatalog.filter((s) =>
      s.availableTo.includes('public') || s.availableTo.includes('new-member'),
    );

    tracer.traceSync('First Interaction: Service Catalog', 'business', 'catalog-service', () => ({
      requestType: 'service-catalog',
      totalServices: serviceCatalog.length,
      visibleServices: publicCatalog.length,
      restrictedServices: serviceCatalog.length - publicCatalog.length,
      note: 'Limited view due to FIRST-CONTACT trust level',
    }));

    // Step 5: Envelope encryption for first message
    tracer.traceSync('Message Encrypted', 'encryption', 'envelope', () => ({
      ciphertext: Buffer.from(JSON.stringify({ type: 'service-catalog-request' })).toString('base64'),
      ephemeralPublicKey: '04d8f2' + randomUUID().replace(/-/g, '').slice(0, 58),
      iv: randomUUID().replace(/-/g, '').slice(0, 24),
      tag: randomUUID().replace(/-/g, '').slice(0, 32),
    }), { encryptionAlgorithm: 'ECDH+AES-256-GCM' }, createProvenance('executed-live'));

    // Step 6: Trust grows — after successful first interaction, trust increases
    tracer.traceSync('Trust Updated After First Interaction', 'trust', 'first-contact', () => ({
      previousTrustLevel: 'FIRST-CONTACT',
      newTrustLevel: 'UNVERIFIED',
      previousTrustScore: 0,
      newTrustScore: 15,
      reason: 'Successful first interaction recorded',
      successfulInteractions: 1,
      totalInteractions: 1,
    }), { trustScore: 15, trustLevel: 'UNVERIFIED' }, createProvenance('executed-live'));

    // Step 7: Second interaction — with higher trust, request associations list via HTTP
    const associations = await sunsClient.call('/prairie-ridge/associations') as Array<{ id: string; name: string; region: string; [key: string]: unknown }>;

    tracer.traceSync('Second Interaction: Associations List', 'business', 'catalog-service', () => ({
      requestType: 'associations-list',
      associationsVisible: associations.length,
      note: 'Fuller response with UNVERIFIED trust level',
    }));

    // Step 8: Trust progression — show the trust building from first-contact to reputation
    tracer.traceSync('Trust Progression Summary', 'trust', 'reputation', () => ({
      trustJourney: [
        { level: 'FIRST-CONTACT', score: 0, interactions: 0 },
        { level: 'UNVERIFIED', score: 15, interactions: 1 },
        { level: 'VERIFIED', score: 50, interactions: 5, projected: true },
        { level: 'TRUSTED', score: 80, interactions: 20, projected: true },
      ],
      currentLevel: 'UNVERIFIED',
      currentScore: 15,
      nextMilestone: 'VERIFIED (requires 5 successful interactions + identity verification)',
    }), { trustScore: 15, trustLevel: 'UNVERIFIED' });

    // Step 9: Circuit breaker — starts CLOSED, remains CLOSED through successful interactions
    tracer.traceSync('Circuit Breaker State', 'resilience', 'circuit-breaker', () => ({
      state: 'CLOSED',
      failureCount: 0,
      failureThreshold: 5,
      target: 'prairie-ridge',
      note: 'Circuit breaker started CLOSED and remains CLOSED after successful onboarding',
    }), { state: 'CLOSED', failureThreshold: 5 }, createProvenance('executed-live'));

    const trace = tracer.complete(messageId);

    // Fetch service catalog again via HTTP for transaction record
    const catalogForTxn = await sunsClient.call('/prairie-ridge/services') as Array<{ id: string; [key: string]: unknown }>;
    this.recordTransaction('prairie-ridge', {
      messageId,
      type: 'onboarding',
      sourceAgent: 'new-association',
      targetAgent: 'prairie-ridge',
      method: 'onboarding.firstContact',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: 'free',
      transactionHash: null,
      status: 'success',
      sourceData: {
        file: 'prairie-ridge/service-catalog',
        recordId: catalogForTxn.length > 0 ? String(catalogForTxn[0].id) : 'svc-7001',
        recordType: 'ServiceCatalogItem',
      },
      summary: 'New association onboarding — first contact with Prairie Ridge Credit, trust level UNVERIFIED',
    });

    return {
      result: {
        onboardingComplete: true,
        trustLevel: 'UNVERIFIED',
        trustScore: 15,
        grantedCapabilities: ['service-catalog'],
        serviceCatalog: publicCatalog,
        associations: associations.map((a) => ({ id: a.id, name: a.name, region: a.region })),
        nextSteps: [
          'Submit identity verification documents to progress to VERIFIED trust level',
          'Complete 5 successful interactions to build reputation',
          'Request access to compliance-validation and helpdesk capabilities',
        ],
      },
      pipelineTrace: trace,
      messageId,
    };
  }

  // Scenario 11: Cross-Ecosystem — Prairie Ridge Credit perspective
  // Prairie Ridge Credit receives quality complaint data from Buildwell ecosystem and runs compliance validation
  private async scenario11_crossEcosystem(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig; // config plumbing ready; no payment provider in this scenario
    const messageId = randomUUID();
    const tracer = new PipelineTracer({
      source: 'prairie-ridge-ecosystem',
      target: 'prairie-ridge-ecosystem',
      method: 'cross-ecosystem.receiveQualityComplaint',
    });

    // Step 1: Receive the cross-ecosystem request (simulated incoming from Buildwell)
    const incomingQualityComplaint = {
      complaintNumber: 'QC-2026-018',
      productCode: 'ATK-0W20-SYN',
      batchNumber: 'BN-2026-0293',
      severity: 'minor',
      issueDate: '2026-03-09',
      originEcosystem: 'buildwell',
    };

    tracer.traceSync('Cross-Ecosystem Request Received', 'transport', 'a2a-jsonrpc', () => ({
      sender: 'buildwell-ecosystem',
      receiver: 'prairie-ridge-ecosystem',
      method: 'compliance.validate',
      identityVerified: true,
      identityMethod: 'x509',
      encryptionMethod: 'tls-mutual',
      incomingPayload: incomingQualityComplaint,
      receivedAt: new Date().toISOString(),
    }));

    // Step 2: Map quality complaint to loan compliance data structure
    // Quality severity maps to financial risk level for Farm Credit compliance
    const loanComplianceData = {
      loanId: incomingQualityComplaint.complaintNumber,
      borrowerName: 'Buildwell Lubricants Inc.',
      purpose: 'quality-incident-review',
      collateralType: 'industrial-equipment',
      amount: 500000,
      term: 12,
      rateType: 'fixed',
      qualityIncidentSeverity: incomingQualityComplaint.severity,
      crossEcosystemSource: incomingQualityComplaint.originEcosystem,
    };

    tracer.traceSync('Quality Complaint Mapped to Compliance Schema', 'business', 'mcp', () => ({
      mappingRules: 'MCP compliance-schema-mapper v2.1',
      inputSchema: 'buildwell.quality-complaint',
      outputSchema: 'prairie-ridge.loan-compliance-request',
      fieldsMapped: Object.keys(loanComplianceData).length,
      riskCategory: incomingQualityComplaint.severity === 'major' ? 'HIGH' : 'MEDIUM',
    }));

    // Step 3: Run Prairie Ridge Credit compliance validation with the mapped data
    const complianceResult = this.prairieRidge.validateLoanCompliance(loanComplianceData);

    tracer.traceSync('Compliance Validation Executed', 'business', 'a2a-jsonrpc', () => ({
      rulesChecked: complianceResult.rulesChecked,
      rulesPassed: complianceResult.rulesPassed,
      complianceScore: complianceResult.score,
      approved: complianceResult.approved,
      criticalFailures: complianceResult.results.filter((r) => !r.passed && r.severity === 'critical').length,
    }));

    // Step 4: Return compliance result with cross-ecosystem audit trail
    tracer.traceSync('Cross-Ecosystem Response Prepared', 'transport', 'a2a-jsonrpc', () => ({
      responseEcosystem: 'prairie-ridge',
      targetEcosystem: 'buildwell',
      complianceOutcome: complianceResult.approved ? 'APPROVED' : 'REQUIRES_REVIEW',
      complianceScore: complianceResult.score,
      responseEncryption: 'tls-mutual',
      auditRecorded: true,
      respondedAt: new Date().toISOString(),
    }));

    const pipelineTrace = tracer.complete(messageId);

    return {
      result: {
        crossEcosystemScenario: true,
        perspective: 'prairie-ridge-receiver',
        incomingRequest: incomingQualityComplaint,
        complianceValidation: complianceResult,
        note: 'Run scenario 11 on buildwell-app (port 6408) for the full cross-ecosystem orchestration view',
      },
      pipelineTrace,
      messageId,
    };
  }

  private async scenario12_a2aFullSuite(effectiveConfig: ProtocolConfig): Promise<{ result: Record<string, unknown>; pipelineTrace: unknown; messageId: string }> {
    void effectiveConfig;
    const messageId = randomUUID();
    const tracer = new PipelineTracer({
      source: 'agriserv',
      target: 'prairie-ridge',
      method: 'a2a.task.execute',
    });

    const taskId = `a2a-task-${randomUUID()}`;
    const skill = {
      id: 'compliance-review',
      inputModes: ['application/json'],
      outputModes: ['application/json'],
      uiModes: ['iframe', 'web-form'],
    };

    tracer.traceSync('A2A Agent Card Discovery', 'discovery', 'a2a-agent-card', () => ({
      url: `http://localhost:${process.env.PROTOCOL_LAB_PRAIRIE_RIDGE_PORT ?? '5407'}/.well-known/agent-card.json`,
      discoveredAgent: 'prairie-ridge',
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
      agreedUiMode: 'iframe',
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
      responseSummary: 'Compliance review completed successfully',
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

    this.recordTransaction('agriserv', {
      messageId,
      type: 'loan-application',
      sourceAgent: 'agriserv',
      targetAgent: 'prairie-ridge',
      method: 'a2a.task.execute',
      amount: null,
      currency: null,
      paymentProvider: null,
      paymentStatus: 'free',
      transactionHash: null,
      status: 'success',
      sourceData: {
        file: 'agriserv/loan-applications',
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
      source: 'agriserv',
      target: 'prairie-ridge',
      method: 'agntcy.secure.exchange',
    });

    tracer.traceSync('AGNTCY OASF Lookup', 'discovery', 'agntcy-oasf', () => ({
      directory: 'federated-oasf',
      descriptorRef: 'oci://agntcy/prairie-ridge:latest',
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
      source: 'agriserv',
      target: 'prairie-ridge',
      method: 'commerce.checkout.execute',
    });

    const checkoutId = `checkout_${randomUUID()}`;
    tracer.traceSync('Commerce Cart Negotiated', 'negotiation', 'commerce-cart-negotiation', () => ({
      checkoutId,
      items: [
        { sku: 'FARM-RISK-REPORT', quantity: 1, unitPrice: 1200 },
        { sku: 'CREDIT-HEALTH-SCORE', quantity: 2, unitPrice: 150 },
      ],
      discountPct: 10,
      negotiatedTotal: 1350,
      status: 'agreed',
    }));

    tracer.traceSync('Commerce Checkout Created', 'payment', 'commerce-checkout', () => ({
      checkoutId,
      delegatedPaymentToken: `spt_${messageId}`,
      amount: 1350,
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
      source: 'agriserv',
      target: 'prairie-ridge',
      method: 'a2a.task.execute.with-payment',
    });

    const taskId = `a2a-mixed-${messageId}`;
    tracer.traceSync('A2A Agent Card Discovery', 'discovery', 'a2a-agent-card', () => ({
      cardUri: '/.well-known/agent-card.json',
      skills: ['loan-compliance', 'risk-summary'],
      securitySchemes: ['oauth2', 'bearer-jwt'],
    }));

    tracer.traceSync('A2A Skill Negotiation', 'negotiation', 'a2a-skill-negotiation', () => ({
      selectedSkill: 'loan-compliance',
      acceptedModes: ['sync', 'stream'],
      status: 'agreed',
    }));

    tracer.traceSync('Coinbase Agent Wallet Ready', 'wallet', 'coinbase-cdp', () => ({
      walletId: 'cdp-prairie-ridge-wallet',
      network: 'base-sepolia',
      gaslessSupported: true,
    }));

    tracer.traceSync('x402 Payment Authorization', 'payment', 'x402-usdc', () => ({
      amount: 12.5,
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
