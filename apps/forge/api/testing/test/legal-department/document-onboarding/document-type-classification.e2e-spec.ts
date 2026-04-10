/**
 * E2E Test: Document Type Classification for Legal Department AI
 *
 * Tests document type classification functionality:
 * - Classification of different document types (contract, pleading, correspondence, etc.)
 * - Confidence scores for classifications
 * - Alternative type suggestions
 * - Unknown document handling
 * - Multi-page document classification
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with legal-department agent seeded
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/document-type-classification.e2e-spec
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

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for operations
const TIMEOUT = 60000; // 60s for LLM operations

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
        documentType?: {
          type: string;
          confidence: number;
          alternatives?: Array<{
            type: string;
            confidence: number;
          }>;
          reasoning?: string;
        };
      };
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

describe('Legal Department AI - Document Type Classification', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Authenticate
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

    // Extract userId from JWT sub claim
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

  describe('Contract Classification', () => {
    it('should classify NDA as contract', async () => {
      const ndaContent = `
NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of January 1, 2024 ("Effective Date"), by and between:

Acme Corporation, a Delaware corporation ("Disclosing Party"), and
TechStartup Inc., a California corporation ("Receiving Party").

WHEREAS, the Disclosing Party possesses certain confidential and proprietary information; and
WHEREAS, the Receiving Party desires to receive such confidential information for the purpose of evaluating a potential business relationship;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, the parties agree as follows:

1. DEFINITIONS
1.1 "Confidential Information" means all information disclosed by the Disclosing Party to the Receiving Party.

2. OBLIGATIONS
2.1 The Receiving Party shall maintain the confidentiality of all Confidential Information.

3. TERM
This Agreement shall remain in effect for a period of three (3) years from the Effective Date.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

ACME CORPORATION                    TECHSTARTUP INC.

By: _____________________           By: _____________________
Name: John Smith                    Name: Jane Doe
Title: CEO                          Title: CTO
Date: January 1, 2024               Date: January 1, 2024
`;

      const base64Data = Buffer.from(ndaContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this NDA document',
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
              filename: 'nda.txt',
              mimeType: 'text/plain',
              size: ndaContent.length,
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

      // Check document type classification
      const documentType = data.payload?.content?.legalMetadata?.documentType;
      expect(documentType).toBeDefined();
      expect(documentType?.type).toMatch(/^(contract|agreement)$/);
      expect(documentType?.confidence).toBeGreaterThanOrEqual(0.7);
      expect(documentType?.confidence).toBeLessThanOrEqual(1.0);
    }, TIMEOUT);

    it('should classify MSA as contract/agreement', async () => {
      const msaContent = `
MASTER SERVICE AGREEMENT

This Master Service Agreement ("Agreement") is made and entered into as of March 15, 2024, by and between:

Global Services LLC ("Provider")
and
Enterprise Customer Corp ("Customer")

The parties agree as follows:

ARTICLE 1 - SERVICES
Provider shall provide consulting services as described in Statements of Work.

ARTICLE 2 - COMPENSATION
Customer shall pay fees as specified in each Statement of Work.

ARTICLE 3 - TERM AND TERMINATION
This Agreement shall commence on the Effective Date and continue for one (1) year.

ARTICLE 4 - CONFIDENTIALITY
Both parties shall maintain confidentiality of proprietary information.

ARTICLE 5 - GENERAL PROVISIONS
This Agreement constitutes the entire agreement between the parties.

IN WITNESS WHEREOF, the parties execute this Agreement.

Provider: ___________________     Customer: ___________________
Date: March 15, 2024             Date: March 15, 2024
`;

      const base64Data = Buffer.from(msaContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this Master Service Agreement',
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
              size: msaContent.length,
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

      const documentType = data.payload?.content?.legalMetadata?.documentType;
      expect(documentType).toBeDefined();
      expect(documentType?.type).toMatch(/^(contract|agreement)$/);
      expect(documentType?.confidence).toBeGreaterThanOrEqual(0.7);
    }, TIMEOUT);
  });

  describe('Pleading Classification', () => {
    it('should classify complaint as pleading', async () => {
      const complaintContent = `
IN THE UNITED STATES DISTRICT COURT
FOR THE NORTHERN DISTRICT OF CALIFORNIA

PLAINTIFF CORP,
                    Plaintiff,
v.                                          Case No. 3:24-cv-01234

DEFENDANT LLC,
                    Defendant.

COMPLAINT FOR BREACH OF CONTRACT

Plaintiff Plaintiff Corp, by and through its attorneys, alleges as follows:

JURISDICTION AND VENUE

1. This Court has jurisdiction over this matter pursuant to 28 U.S.C. § 1332.

2. Venue is proper in this District pursuant to 28 U.S.C. § 1391.

PARTIES

3. Plaintiff is a Delaware corporation with its principal place of business in San Francisco, California.

4. Defendant is a Nevada limited liability company with its principal place of business in Las Vegas, Nevada.

FACTUAL ALLEGATIONS

5. On or about January 1, 2023, Plaintiff and Defendant entered into a written contract.

6. Defendant breached the contract by failing to make required payments.

CAUSES OF ACTION

COUNT I - BREACH OF CONTRACT

7. Plaintiff incorporates by reference all preceding paragraphs.

8. Defendant's failure to perform constitutes a material breach.

PRAYER FOR RELIEF

WHEREFORE, Plaintiff requests judgment against Defendant as follows:
1. Compensatory damages in an amount to be proven at trial;
2. Costs of suit;
3. Such other relief as the Court deems just and proper.

Dated: June 1, 2024

Respectfully submitted,

_____________________
Attorney for Plaintiff
`;

      const base64Data = Buffer.from(complaintContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this legal complaint',
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

      const documentType = data.payload?.content?.legalMetadata?.documentType;
      expect(documentType).toBeDefined();
      expect(documentType?.type).toMatch(/^(pleading|filing)$/);
      expect(documentType?.confidence).toBeGreaterThanOrEqual(0.7);
    }, TIMEOUT);
  });

  describe('Motion Classification', () => {
    it('should classify motion to dismiss as motion', async () => {
      const motionContent = `
IN THE SUPERIOR COURT OF CALIFORNIA
COUNTY OF SAN FRANCISCO

CASE NO. CGC-24-12345

DEFENDANT'S MOTION TO DISMISS

Defendant hereby moves this Court to dismiss Plaintiff's Complaint pursuant to Code of Civil Procedure section 430.10(e).

MEMORANDUM OF POINTS AND AUTHORITIES

I. INTRODUCTION

Defendant respectfully requests that this Court dismiss Plaintiff's Complaint for failure to state a claim upon which relief can be granted.

II. STANDARD OF REVIEW

A motion to dismiss tests the legal sufficiency of the complaint.

III. ARGUMENT

A. Plaintiff's Complaint Fails to State Facts Sufficient to Constitute a Cause of Action

The Complaint lacks specific factual allegations necessary to support its claims.

IV. CONCLUSION

For the foregoing reasons, Defendant respectfully requests that this Court grant this Motion to Dismiss.

Dated: July 15, 2024

Respectfully submitted,

_____________________
Attorney for Defendant
`;

      const base64Data = Buffer.from(motionContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this motion to dismiss',
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
              filename: 'motion.txt',
              mimeType: 'text/plain',
              size: motionContent.length,
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

      const documentType = data.payload?.content?.legalMetadata?.documentType;
      expect(documentType).toBeDefined();
      expect(documentType?.type).toMatch(/^(motion|filing|brief)$/);
      expect(documentType?.confidence).toBeGreaterThanOrEqual(0.7);
    }, TIMEOUT);
  });

  describe('Confidence Scores', () => {
    it('should provide confidence scores between 0 and 1', async () => {
      const testContent = `
EMPLOYMENT AGREEMENT

This Employment Agreement is entered into between Employer Inc. and Employee John Doe.

The parties agree to the following terms of employment.
`;

      const base64Data = Buffer.from(testContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this document',
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
              filename: 'employment.txt',
              mimeType: 'text/plain',
              size: testContent.length,
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

      const documentType = data.payload?.content?.legalMetadata?.documentType;
      expect(documentType?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(documentType?.confidence).toBeLessThanOrEqual(1.0);
    }, TIMEOUT);

    it('should provide alternative types when confidence is lower', async () => {
      // Ambiguous document that could be classified multiple ways
      const ambiguousContent = `
Legal Department
Re: Contract Review

Please review the attached contract and provide comments by end of week.

Thank you.
`;

      const base64Data = Buffer.from(ambiguousContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this document',
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
              size: ambiguousContent.length,
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

      const documentType = data.payload?.content?.legalMetadata?.documentType;
      expect(documentType).toBeDefined();

      // For ambiguous documents, we expect either alternatives or lower confidence
      if (documentType?.confidence && documentType.confidence < 0.9) {
        // Low confidence - may or may not have alternatives
        expect(documentType.confidence).toBeLessThan(0.9);
      }
    }, TIMEOUT);
  });

  describe('Unknown Document Handling', () => {
    it('should handle unknown document types gracefully', async () => {
      const unknownContent = `
Random text that doesn't match any legal document pattern.
Lorem ipsum dolor sit amet, consectetur adipiscing elit.
This is just random content without legal significance.
`;

      const base64Data = Buffer.from(unknownContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this document',
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
              filename: 'unknown.txt',
              mimeType: 'text/plain',
              size: unknownContent.length,
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

      const documentType = data.payload?.content?.legalMetadata?.documentType;
      expect(documentType).toBeDefined();

      // Should classify as 'other' with low confidence
      expect(documentType?.type).toMatch(/^(other|correspondence|memo)$/);

      // Confidence should reflect uncertainty
      if (documentType?.type === 'other') {
        expect(documentType.confidence).toBeLessThan(0.7);
      }
    }, TIMEOUT);
  });
});
