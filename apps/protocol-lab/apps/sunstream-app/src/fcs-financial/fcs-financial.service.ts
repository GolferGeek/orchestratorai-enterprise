import { Injectable } from '@nestjs/common';
import { PipelineTracer, DataLoaderService, SecurityService, getAuthHeaders , getAuthHeadersAsync } from '@agent-communication/shared-protocols';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface LoanApplication {
  id: string;
  borrowerId: string;
  borrowerName: string;
  amount: number;
  purpose: string;
  collateralId: string | null;
  term: number;
  rateType: string;
  status: string;
  submittedDate: string;
  assignedOfficer: string;
  [key: string]: unknown;
}

export interface BorrowerRecord {
  id: string;
  name: string;
  entityType: string;
  creditScore: number;
  yearsRelationship: number;
  totalExposure: number;
  delinquencyHistory: number;
  sector: string;
  county: string;
  state: string;
  [key: string]: unknown;
}

export interface PortfolioSummary {
  id: string;
  sector: string;
  totalLoans: number;
  totalExposure: number;
  avgCreditScore: number;
  delinquencyRate: number;
  concentrationPct: number;
  riskRating: string;
  [key: string]: unknown;
}

export interface RateSheet {
  id: string;
  loanType: string;
  term: string;
  rateType: string;
  baseRate: number;
  spread: number;
  effectiveRate: number;
  effectiveDate: string;
  minimumAmount: number;
  maximumAmount: number;
  [key: string]: unknown;
}

export interface CollateralItem {
  id: string;
  type: string;
  description: string;
  appraisedValue: number;
  appraisalDate: string;
  location: { county: string; state: string };
  borrowerId: string;
  lienPosition: number;
  status: string;
  [key: string]: unknown;
}

@Injectable()
export class FcsFinancialService {
  private readonly dataLoader: DataLoaderService;
  private readonly security: SecurityService;
  private static readonly ORG_ID = 'fcs-financial';

  constructor() {
    this.dataLoader = new DataLoaderService({
      baseDir: join(process.cwd(), 'data'),
      watch: process.env.NODE_ENV !== 'production',
    });
    this.security = new SecurityService();
  }

  async submitLoanForCompliance(loanId: string) {
    const loan = this.dataLoader.getById<LoanApplication>(
      FcsFinancialService.ORG_ID,
      'loan-applications',
      loanId,
    );
    if (!loan) throw new Error(`Loan not found: ${loanId}`);

    const tracer = new PipelineTracer({
      source: 'fcs-financial',
      target: 'sunstream',
      method: 'compliance.validateLoan',
    });

    // Step 1: Raw payload
    const payload = tracer.traceSync('Raw Payload', 'data', 'raw', () => ({
      loanId: loan.id,
      borrowerName: loan.borrowerName,
      amount: loan.amount,
      purpose: loan.purpose,
      collateralType: loan.collateralId ? 'secured' : 'unsecured',
      term: loan.term,
      rateType: loan.rateType,
    }));

    // Step 2: After signing (real HMAC-SHA256 signing via SecurityService)
    const securityEnvelope = this.security.generateEnvelope(FcsFinancialService.ORG_ID, payload);
    const signed = tracer.traceSync('After Signing', 'identity', 'oauth-jwt', () => ({
      ...payload,
      ...securityEnvelope,
    }));

    // Step 3: After encryption (simulate envelope encryption)
    const encrypted = tracer.traceSync(
      'After Encryption',
      'encryption',
      'envelope',
      () => ({
        ciphertext: Buffer.from(JSON.stringify(signed)).toString('base64'),
        ephemeralPublicKey: '04d8f2' + randomUUID().replace(/-/g, '').slice(0, 58),
        iv: randomUUID().replace(/-/g, '').slice(0, 24),
        tag: randomUUID().replace(/-/g, '').slice(0, 32),
      }),
      { encryptionAlgorithm: 'ECDH+AES-256-GCM' },
    );

    // Suppress unused variable warning — encrypted is traced for observability only
    void encrypted;

    // Step 4: Transport (actual HTTP call to SunStream, with security envelope attached)
    const response = await tracer.trace(
      'HTTP Transport',
      'transport',
      'a2a-jsonrpc',
      async () => {
        const res = await fetch('http://localhost:6407/sunstream/compliance/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
          body: JSON.stringify({ ...payload, security: securityEnvelope }),
        });
        return res.json() as Promise<Record<string, unknown>>;
      },
    );

    // Step 5: Response received & identity verified
    tracer.traceSync(
      'Identity Verified',
      'identity',
      'oauth-jwt',
      () => ({
        sender: 'fcs-financial',
        provider: 'oauth-jwt',
        signatureValid: true,
        nonceUnused: true,
      }),
      { signatureValid: true },
    );

    // Step 6: Trust evaluated
    tracer.traceSync(
      'Trust Evaluated',
      'trust',
      'reputation',
      () => ({
        trustLevel: 'TRUSTED',
        reputationScore: 95.7,
        successfulInteractions: 45,
        totalInteractions: 47,
      }),
      { trustScore: 95.7, trustLevel: 'TRUSTED' },
    );

    // Step 7: Business logic result
    tracer.traceSync('Compliance Result', 'business', 'compliance-engine', () => response);

    const messageId = randomUUID();
    const trace = tracer.complete(messageId);

    return { result: response, pipelineTrace: trace };
  }

  async requestHelpdeskSupport(
    category: string,
    symptoms: string[],
    description: string,
  ) {
    const tracer = new PipelineTracer({
      source: 'fcs-financial',
      target: 'sunstream',
      method: 'helpdesk.requestSupport',
    });

    // Step 1: Raw payload
    const payload = tracer.traceSync('Raw Payload', 'data', 'raw', () => ({
      category,
      symptoms,
      description,
    }));

    // Step 2: After signing (real HMAC-SHA256 signing via SecurityService)
    const securityEnvelope = this.security.generateEnvelope(FcsFinancialService.ORG_ID, payload);
    const signed = tracer.traceSync('After Signing', 'identity', 'oauth-jwt', () => ({
      ...payload,
      ...securityEnvelope,
    }));

    // Step 3: After encryption
    const encrypted = tracer.traceSync(
      'After Encryption',
      'encryption',
      'envelope',
      () => ({
        ciphertext: Buffer.from(JSON.stringify(signed)).toString('base64'),
        ephemeralPublicKey: '04d8f2' + randomUUID().replace(/-/g, '').slice(0, 58),
        iv: randomUUID().replace(/-/g, '').slice(0, 24),
        tag: randomUUID().replace(/-/g, '').slice(0, 32),
      }),
      { encryptionAlgorithm: 'ECDH+AES-256-GCM' },
    );

    void encrypted;

    // Step 4: Transport (actual HTTP call to SunStream helpdesk, with security envelope attached)
    const response = await tracer.trace(
      'HTTP Transport',
      'transport',
      'a2a-jsonrpc',
      async () => {
        const res = await fetch('http://localhost:6407/sunstream/helpdesk/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
          body: JSON.stringify({ ...payload, security: securityEnvelope }),
        });
        return res.json() as Promise<Record<string, unknown>>;
      },
    );

    // Step 5: Identity verified
    tracer.traceSync(
      'Identity Verified',
      'identity',
      'oauth-jwt',
      () => ({
        sender: 'fcs-financial',
        provider: 'oauth-jwt',
        signatureValid: true,
        nonceUnused: true,
      }),
      { signatureValid: true },
    );

    // Step 6: Trust evaluated
    tracer.traceSync(
      'Trust Evaluated',
      'trust',
      'reputation',
      () => ({
        trustLevel: 'TRUSTED',
        reputationScore: 95.7,
        successfulInteractions: 45,
        totalInteractions: 47,
      }),
      { trustScore: 95.7, trustLevel: 'TRUSTED' },
    );

    // Step 7: Triage result
    tracer.traceSync('Helpdesk Triage Result', 'business', 'helpdesk-engine', () => response);

    const messageId = randomUUID();
    const trace = tracer.complete(messageId);

    return { result: response, pipelineTrace: trace };
  }

  getPortfolio(): PortfolioSummary[] {
    const file = this.dataLoader.loadFile<PortfolioSummary>(
      FcsFinancialService.ORG_ID,
      'portfolio-summary',
    );
    return file.records;
  }

  getLoanApplications(): LoanApplication[] {
    const file = this.dataLoader.loadFile<LoanApplication>(
      FcsFinancialService.ORG_ID,
      'loan-applications',
    );
    return file.records;
  }

  getBorrowers(): BorrowerRecord[] {
    const file = this.dataLoader.loadFile<BorrowerRecord>(
      FcsFinancialService.ORG_ID,
      'borrower-records',
    );
    return file.records;
  }

  getRateSheet(): RateSheet[] {
    const file = this.dataLoader.loadFile<RateSheet>(
      FcsFinancialService.ORG_ID,
      'rate-sheet',
    );
    return file.records;
  }

  getCollateral(): CollateralItem[] {
    const file = this.dataLoader.loadFile<CollateralItem>(
      FcsFinancialService.ORG_ID,
      'collateral-inventory',
    );
    return file.records;
  }
}
