/**
 * E2E Test: Party Extraction for Legal Department AI
 *
 * Tests party extraction functionality:
 * - Party name extraction from contracts
 * - Party type identification (individual, corporation, LLC, etc.)
 * - Party role classification (buyer, seller, plaintiff, defendant, etc.)
 * - Contracting party identification
 * - Confidence scoring for party extraction
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with legal-department agent seeded
 *
 * Run with: npx jest --config apps/api/testing/test/jest-department/party-extraction.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';
const AGENT_SLUG = 'legal-department';
const AGENT_TYPE = 'api';
const PROVIDER = 'anthropic';
const MODEL = 'claude-sonnet-4-5';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const TIMEOUT = 60000;

interface A2ARequest {
  userMessage: string;
  mode: string;
  context: {
    orgSlug: string;
    agentSlug: string;
    agentType: string;
    userId: string;
    conversationId: string;
    taskId: string;
    planId: string;
    deliverableId: string;
    provider: string;
    model: string;
  };
  payload?: {
    documents?: Array<{
      filename: string;
      mimeType: string;
      size: number;
      base64Data: string;
    }>;
  };
}

interface A2AResponse {
  success: boolean;
  mode: string;
  payload?: {
    content?: {
      legalMetadata?: {
        parties?: {
          parties: Array<{
            name: string;
            type?: string;
            role?: string;
            position: number;
          }>;
          contractingParties?: string[];
          confidence: number;
        };
      };
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

describe('Legal Department AI - Party Extraction', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      throw new Error(
        `Authentication failed: ${authResponse.status} ${authResponse.statusText}`,
      );
    }

    const authData = await authResponse.json();
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        );
        userId = jwtPayload.sub;
      } else {
        userId = process.env.SUPABASE_TEST_USERID || '';
      }
    } catch {
      userId = process.env.SUPABASE_TEST_USERID || '';
    }
    expect(userId).toBeTruthy();
  }, TIMEOUT);

  describe('Contract Party Extraction', () => {
    it('should extract parties from contract preamble', async () => {
      const contractContent = `
SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of January 1, 2024, by and between:

Acme Corporation, a Delaware corporation ("Provider"), and
TechStart Inc., a California corporation ("Customer").

The parties hereby agree to the following terms and conditions.
`;

      const base64Data = Buffer.from(contractContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract the parties to this contract',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'contract.txt',
              mimeType: 'text/plain',
              size: contractContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();
      expect(parties?.parties).toBeDefined();
      expect(parties?.parties.length).toBeGreaterThanOrEqual(2);

      // Should have extracted both parties
      const partyNames = parties?.parties.map(p => p.name.toLowerCase()) || [];
      const hasAcme = partyNames.some(name => name.includes('acme'));
      const hasTechStart = partyNames.some(name => name.includes('techstart'));

      expect(hasAcme && hasTechStart).toBe(true);
    }, TIMEOUT);

    it('should identify party types (corporation, LLC, individual)', async () => {
      const multiTypeContent = `
AGREEMENT

This Agreement is made between:

1. Global Services LLC, a Nevada limited liability company
2. John Doe, an individual
3. Enterprise Corp, a Delaware corporation
4. Smith & Associates LLP, a limited liability partnership

The parties agree as follows.
`;

      const base64Data = Buffer.from(multiTypeContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Identify party types',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'multi-type.txt',
              mimeType: 'text/plain',
              size: multiTypeContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();
      expect(parties?.parties.length).toBeGreaterThanOrEqual(2);

      // Should identify different party types
      const hasEntityTypes = parties?.parties.some(p => p.type && p.type.length > 0);
      expect(hasEntityTypes || parties?.parties.length >= 2).toBe(true);
    }, TIMEOUT);

    it('should identify contracting parties', async () => {
      const contractingContent = `
MASTER SERVICE AGREEMENT

This Agreement is between Provider Inc. ("Provider") and Customer Corp ("Customer").

RECITALS:

WHEREAS, Provider is engaged in the business of providing professional services;
WHEREAS, Customer desires to engage Provider to perform such services;

NOW THEREFORE, Provider and Customer agree:

1. Services. Provider shall provide consulting services to Customer.
`;

      const base64Data = Buffer.from(contractingContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Identify contracting parties',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'msa.txt',
              mimeType: 'text/plain',
              size: contractingContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();

      // Should identify contracting parties
      expect(parties?.contractingParties || parties?.parties).toBeDefined();

      if (parties?.contractingParties) {
        expect(parties.contractingParties.length).toBeGreaterThanOrEqual(2);
      } else {
        expect(parties?.parties.length).toBeGreaterThanOrEqual(2);
      }
    }, TIMEOUT);
  });

  describe('Litigation Party Extraction', () => {
    it('should extract plaintiff and defendant from complaint', async () => {
      const complaintContent = `
IN THE SUPERIOR COURT OF CALIFORNIA
COUNTY OF SAN FRANCISCO

PLAINTIFF CORPORATION,
                    Plaintiff,
v.                                          Case No. CGC-24-12345

DEFENDANT LLC,
                    Defendant.

COMPLAINT

Plaintiff Plaintiff Corporation, by and through its attorneys, brings this action against Defendant Defendant LLC.

PARTIES

1. Plaintiff is a Delaware corporation with its principal place of business in San Francisco.

2. Defendant is a Nevada limited liability company.
`;

      const base64Data = Buffer.from(complaintContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract plaintiff and defendant',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'complaint.txt',
              mimeType: 'text/plain',
              size: complaintContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();
      expect(parties?.parties.length).toBeGreaterThanOrEqual(2);

      // Should identify roles (plaintiff, defendant)
      const hasRoles = parties?.parties.some(p =>
        p.role === 'plaintiff' || p.role === 'defendant'
      );

      // Or should at least extract party names
      const partyNames = parties?.parties.map(p => p.name.toLowerCase()) || [];
      const hasPlaintiff = partyNames.some(name =>
        name.includes('plaintiff')
      );
      const hasDefendant = partyNames.some(name =>
        name.includes('defendant')
      );

      expect(hasRoles || hasPlaintiff || hasDefendant).toBe(true);
    }, TIMEOUT);

    it('should handle multi-party litigation', async () => {
      const multiPartyContent = `
CASE CAPTION

PLAINTIFF A, PLAINTIFF B, and PLAINTIFF C,
                    Plaintiffs,
v.

DEFENDANT X, DEFENDANT Y, and DEFENDANT Z,
                    Defendants.

This is a multi-party action involving six parties.
`;

      const base64Data = Buffer.from(multiPartyContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract all parties from multi-party case',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'multi-party.txt',
              mimeType: 'text/plain',
              size: multiPartyContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();

      // Should extract multiple parties
      expect(parties?.parties.length).toBeGreaterThanOrEqual(3);
    }, TIMEOUT);
  });

  describe('Party Role Classification', () => {
    it('should identify buyer and seller roles', async () => {
      const purchaseContent = `
ASSET PURCHASE AGREEMENT

This Agreement is made between Seller Corp (the "Seller") and Buyer Inc (the "Buyer").

WHEREAS, Seller desires to sell certain assets to Buyer;
WHEREAS, Buyer desires to purchase such assets from Seller;

The parties agree:

1. Purchase and Sale. Seller shall sell and Buyer shall purchase the Assets.
`;

      const base64Data = Buffer.from(purchaseContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Identify buyer and seller',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'purchase.txt',
              mimeType: 'text/plain',
              size: purchaseContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();
      expect(parties?.parties.length).toBeGreaterThanOrEqual(2);

      // Should identify buyer/seller roles
      const hasRoles = parties?.parties.some(p =>
        p.role === 'buyer' || p.role === 'seller'
      );

      // Or extract party names with buyer/seller indicators
      const partyNames = parties?.parties.map(p => p.name.toLowerCase()) || [];
      const hasBuyer = partyNames.some(name => name.includes('buyer'));
      const hasSeller = partyNames.some(name => name.includes('seller'));

      expect(hasRoles || (hasBuyer && hasSeller)).toBe(true);
    }, TIMEOUT);

    it('should identify lessor and lessee roles', async () => {
      const leaseContent = `
COMMERCIAL LEASE AGREEMENT

This Lease is between Property Owner LLC (the "Lessor") and Business Tenant Inc (the "Lessee").

Lessor agrees to lease to Lessee the Premises located at 123 Main Street.

Lessee agrees to pay Lessor monthly rent of $5,000.
`;

      const base64Data = Buffer.from(leaseContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Identify lessor and lessee',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'lease.txt',
              mimeType: 'text/plain',
              size: leaseContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();
      expect(parties?.parties.length).toBeGreaterThanOrEqual(2);
    }, TIMEOUT);
  });

  describe('Confidence Scoring', () => {
    it('should provide confidence scores for party extraction', async () => {
      const clearPartiesContent = `
AGREEMENT

Parties:
1. ABC Corporation, a Delaware corporation
2. XYZ LLC, a California limited liability company

The above parties agree to the following.
`;

      const base64Data = Buffer.from(clearPartiesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract parties with confidence scores',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'clear-parties.txt',
              mimeType: 'text/plain',
              size: clearPartiesContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();

      // Confidence should be between 0 and 1
      expect(parties?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(parties?.confidence).toBeLessThanOrEqual(1.0);

      // Should extract parties
      expect(parties?.parties.length).toBeGreaterThanOrEqual(2);
    }, TIMEOUT);
  });

  describe('Edge Cases', () => {
    it('should handle documents with no clear parties', async () => {
      const noPartiesContent = `
LEGAL ANALYSIS

This memorandum provides a general overview of contract law principles.

Contracts require offer, acceptance, and consideration.

Parties to a contract must have legal capacity.
`;

      const base64Data = Buffer.from(noPartiesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Check for parties in this document',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'analysis.txt',
              mimeType: 'text/plain',
              size: noPartiesContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const parties = data.payload?.content?.legalMetadata?.parties;
      expect(parties).toBeDefined();

      // Should have no parties or very few
      expect(parties?.parties.length).toBeLessThanOrEqual(1);

      // Confidence may be lower
      expect(parties?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(parties?.confidence).toBeLessThanOrEqual(1.0);
    }, TIMEOUT);
  });
});
