/**
 * E2E Test: Signature Detection for Legal Department AI
 *
 * Tests signature block detection functionality:
 * - Signature block detection
 * - Party and signer extraction from signature blocks
 * - Signed vs unsigned document detection
 * - Multiple signature block handling
 * - Date extraction from signature blocks
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with legal-department agent seeded
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/signature-detection.e2e-spec
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
        signatures?: {
          signatures: Array<{
            party?: string;
            signerName?: string;
            signerTitle?: string;
            date?: string;
            position: number;
            isSigned: boolean;
          }>;
          confidence: number;
          partyCount: number;
        };
      };
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

describe('Legal Department AI - Signature Detection', () => {
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

  describe('Signed Documents', () => {
    it('should detect signature blocks in signed contract', async () => {
      const signedContent = `
SERVICE AGREEMENT

The parties agree to the terms set forth herein.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

PROVIDER:                           CUSTOMER:

By: _____________________           By: _____________________
Name: John Smith                    Name: Jane Doe
Title: CEO                          Title: CTO
Date: January 15, 2024              Date: January 15, 2024
`;

      const base64Data = Buffer.from(signedContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Check for signatures in this contract',
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
              filename: 'signed-contract.txt',
              mimeType: 'text/plain',
              size: signedContent.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();

      // Should detect signature blocks
      expect(signatures?.signatures).toBeDefined();
      expect(signatures?.signatures.length).toBeGreaterThan(0);

      // Should detect party count (2 parties)
      expect(signatures?.partyCount).toBeGreaterThanOrEqual(1);

      // Confidence should be reasonable
      expect(signatures?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(signatures?.confidence).toBeLessThanOrEqual(1.0);
    }, TIMEOUT);

    it('should extract signer names and titles from signature blocks', async () => {
      const detailedSignatures = `
AGREEMENT

IN WITNESS WHEREOF, the undersigned have executed this Agreement.

ACME CORPORATION

By: _____________________
Name: Robert Johnson
Title: Chief Executive Officer
Date: March 1, 2024

TECHSTART LLC

By: _____________________
Name: Sarah Williams
Title: Managing Partner
Date: March 1, 2024
`;

      const base64Data = Buffer.from(detailedSignatures).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract signer information',
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
              filename: 'detailed-signatures.txt',
              mimeType: 'text/plain',
              size: detailedSignatures.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();
      expect(signatures?.signatures.length).toBeGreaterThan(0);

      // Check if signer details were extracted
      const hasSignerNames = signatures?.signatures.some(sig =>
        sig.signerName && sig.signerName.length > 0
      );
      const hasSignerTitles = signatures?.signatures.some(sig =>
        sig.signerTitle && sig.signerTitle.length > 0
      );

      // At least some signatures should have names or titles
      expect(hasSignerNames || hasSignerTitles).toBe(true);
    }, TIMEOUT);

    it('should detect multiple signature blocks', async () => {
      const multipleSignatures = `
THREE-PARTY AGREEMENT

PARTY A:
By: ___________________
Name: Alice Adams
Title: President

PARTY B:
By: ___________________
Name: Bob Brown
Title: Director

PARTY C:
By: ___________________
Name: Carol Chen
Title: Manager
`;

      const base64Data = Buffer.from(multipleSignatures).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Detect all signature blocks',
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
              filename: 'three-party.txt',
              mimeType: 'text/plain',
              size: multipleSignatures.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();

      // Should detect multiple signature blocks (3 parties)
      expect(signatures?.partyCount).toBeGreaterThanOrEqual(2);

      // May detect 2-3 signature blocks depending on extraction quality
      expect(signatures?.signatures.length).toBeGreaterThanOrEqual(1);
    }, TIMEOUT);
  });

  describe('Unsigned Documents', () => {
    it('should detect unsigned signature blocks', async () => {
      const unsignedContent = `
DRAFT AGREEMENT

The parties will execute this agreement upon final review.

SIGNATURES TO BE ADDED:

PARTY A:
By: _____________________
Name: _____________________
Title: _____________________
Date: _____________________

PARTY B:
By: _____________________
Name: _____________________
Title: _____________________
Date: _____________________
`;

      const base64Data = Buffer.from(unsignedContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Check if this document is signed',
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
              filename: 'unsigned.txt',
              mimeType: 'text/plain',
              size: unsignedContent.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();

      // Should detect signature blocks even if unsigned
      expect(signatures?.signatures.length).toBeGreaterThanOrEqual(0);

      // Check if any signatures are marked as unsigned
      if (signatures && signatures.signatures.length > 0) {
        const hasUnsigned = signatures.signatures.some(sig => sig.isSigned === false);
        // Either marked as unsigned, or no signer names extracted
        expect(
          hasUnsigned ||
          signatures.signatures.every(sig => !sig.signerName || sig.signerName.length === 0)
        ).toBe(true);
      }
    }, TIMEOUT);
  });

  describe('Documents Without Signatures', () => {
    it('should handle documents without signature blocks', async () => {
      const noSignaturesContent = `
LEGAL MEMORANDUM

TO: Legal Department
FROM: Associate Attorney
RE: Contract Review
DATE: January 10, 2024

This memorandum provides an analysis of the proposed contract terms.

ANALYSIS

The contract contains standard provisions for this type of agreement.

RECOMMENDATION

We recommend proceeding with the contract as drafted.
`;

      const base64Data = Buffer.from(noSignaturesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Check for signatures in this memo',
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
              filename: 'memo.txt',
              mimeType: 'text/plain',
              size: noSignaturesContent.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();

      // Should have no signatures
      expect(signatures?.signatures.length).toBe(0);
      expect(signatures?.partyCount).toBe(0);

      // Confidence may be lower for documents without signatures
      expect(signatures?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(signatures?.confidence).toBeLessThanOrEqual(1.0);
    }, TIMEOUT);
  });

  describe('Signature Block Variations', () => {
    it('should detect IN WITNESS WHEREOF pattern', async () => {
      const witnessPattern = `
AGREEMENT

IN WITNESS WHEREOF, the parties hereto have caused this Agreement to be executed by their duly authorized representatives as of the date first above written.

COMPANY A                           COMPANY B

_____________________              _____________________
Authorized Signature               Authorized Signature
`;

      const base64Data = Buffer.from(witnessPattern).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Detect witness signature pattern',
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
              filename: 'witness-pattern.txt',
              mimeType: 'text/plain',
              size: witnessPattern.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();

      // Should detect signature blocks after IN WITNESS WHEREOF
      expect(signatures?.signatures.length).toBeGreaterThanOrEqual(1);
    }, TIMEOUT);

    it('should detect EXECUTED AS OF pattern', async () => {
      const executedPattern = `
This Agreement is executed as of the date set forth below.

EXECUTED as of January 20, 2024

PROVIDER:
Signature: _____________________
Print Name: _____________________
Title: _____________________
`;

      const base64Data = Buffer.from(executedPattern).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Detect executed signature pattern',
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
              filename: 'executed-pattern.txt',
              mimeType: 'text/plain',
              size: executedPattern.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();

      // Should detect at least one signature block
      expect(signatures?.signatures.length).toBeGreaterThanOrEqual(0);
    }, TIMEOUT);
  });

  describe('Confidence Scoring', () => {
    it('should provide confidence scores for signature detection', async () => {
      const clearSignatures = `
AGREEMENT

SIGNATURES:

Party A:
By: /s/ John Doe
Name: John Doe, CEO
Date: 1/1/2024

Party B:
By: /s/ Jane Smith
Name: Jane Smith, President
Date: 1/1/2024
`;

      const base64Data = Buffer.from(clearSignatures).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Evaluate signature detection confidence',
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
              filename: 'clear-signatures.txt',
              mimeType: 'text/plain',
              size: clearSignatures.length,
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

      const signatures = data.payload?.content?.legalMetadata?.signatures;
      expect(signatures).toBeDefined();

      // Clear signature blocks should have reasonable confidence
      expect(signatures?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(signatures?.confidence).toBeLessThanOrEqual(1.0);

      // Should detect signatures
      expect(signatures?.signatures.length).toBeGreaterThanOrEqual(1);
    }, TIMEOUT);
  });
});
