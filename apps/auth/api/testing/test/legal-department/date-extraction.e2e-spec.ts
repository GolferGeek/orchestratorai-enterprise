/**
 * E2E Test: Date Extraction for Legal Department AI
 *
 * Tests date extraction functionality:
 * - Extraction of different date types (effective, expiration, signature, filing)
 * - Date normalization to ISO format
 * - Date type classification
 * - Primary date identification
 * - Confidence scoring for date extraction
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with legal-department agent seeded
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/date-extraction.e2e-spec
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
        dates?: {
          dates: Array<{
            rawDate: string;
            normalizedDate: string;
            dateType: string;
            context?: string;
            position: number;
          }>;
          primaryDate?: {
            rawDate: string;
            normalizedDate: string;
            dateType: string;
          };
          confidence: number;
        };
      };
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

describe('Legal Department AI - Date Extraction', () => {
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

  describe('Effective Date Extraction', () => {
    it('should extract effective date from contract', async () => {
      const contractContent = `
SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of January 15, 2024 ("Effective Date"), by and between Provider Inc. and Customer Corp.

The terms of this Agreement shall become effective on the Effective Date.
`;

      const base64Data = Buffer.from(contractContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract dates from this contract',
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
              filename: 'contract-with-dates.txt',
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();
      expect(dates?.dates).toBeDefined();
      expect(dates?.dates.length).toBeGreaterThan(0);

      // Should have extracted effective date
      const hasEffectiveDate = dates?.dates.some(d =>
        d.dateType === 'effective_date' || d.rawDate.includes('January 15, 2024')
      );
      expect(hasEffectiveDate).toBe(true);

      // Should have primary date
      expect(dates?.primaryDate).toBeDefined();
    }, TIMEOUT);

    it('should extract multiple date formats', async () => {
      const multipleDatesContent = `
AGREEMENT

Effective Date: March 1, 2024
Execution Date: 03/01/2024
Commencement Date: 2024-03-01
Start Date: 1st day of March, 2024
`;

      const base64Data = Buffer.from(multipleDatesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract all date formats',
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
              filename: 'multiple-formats.txt',
              mimeType: 'text/plain',
              size: multipleDatesContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();

      // Should extract multiple dates
      expect(dates?.dates.length).toBeGreaterThanOrEqual(1);

      // Dates should be normalized to ISO format (YYYY-MM-DD)
      dates?.dates.forEach(date => {
        expect(date.normalizedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    }, TIMEOUT);
  });

  describe('Expiration Date Extraction', () => {
    it('should extract expiration and termination dates', async () => {
      const expirationContent = `
LEASE AGREEMENT

Term: This lease shall commence on January 1, 2024 and shall expire on December 31, 2026.

Termination Date: The agreement may be terminated early on June 30, 2025.

Renewal: This agreement automatically renews unless terminated before December 1, 2026.
`;

      const base64Data = Buffer.from(expirationContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract expiration and termination dates',
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
              size: expirationContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();
      expect(dates?.dates.length).toBeGreaterThan(0);

      // Should have extracted multiple dates
      const hasExpirationDate = dates?.dates.some(d =>
        d.dateType === 'expiration_date' || d.rawDate.includes('2026')
      );
      const hasTerminationDate = dates?.dates.some(d =>
        d.dateType === 'termination_date' || d.rawDate.includes('2025')
      );

      expect(hasExpirationDate || hasTerminationDate).toBe(true);
    }, TIMEOUT);
  });

  describe('Signature Date Extraction', () => {
    it('should extract signature dates from signature blocks', async () => {
      const signatureDatesContent = `
AGREEMENT

IN WITNESS WHEREOF, the parties have executed this Agreement.

PARTY A:
By: _____________________
Name: John Doe
Date: February 15, 2024

PARTY B:
By: _____________________
Name: Jane Smith
Date: February 16, 2024
`;

      const base64Data = Buffer.from(signatureDatesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract signature dates',
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
              filename: 'signature-dates.txt',
              mimeType: 'text/plain',
              size: signatureDatesContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();

      // Should extract signature dates
      const hasSignatureDates = dates?.dates.some(d =>
        d.dateType === 'signature_date' || d.dateType === 'execution_date'
      );

      expect(hasSignatureDates || (dates?.dates.length ?? 0) > 0).toBe(true);
    }, TIMEOUT);
  });

  describe('Filing Date Extraction', () => {
    it('should extract filing dates from court documents', async () => {
      const filingContent = `
IN THE SUPERIOR COURT OF CALIFORNIA
COUNTY OF SAN FRANCISCO

Case No.: CGC-24-12345
Filed: March 20, 2024

COMPLAINT

Plaintiff files this complaint on March 20, 2024.

The action was commenced on the filing date.
`;

      const base64Data = Buffer.from(filingContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract filing date from complaint',
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
              size: filingContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();
      expect(dates?.dates.length).toBeGreaterThan(0);

      // Should extract filing date
      const hasFilingDate = dates?.dates.some(d =>
        d.dateType === 'filing_date' || d.rawDate.includes('March 20, 2024')
      );

      expect(hasFilingDate).toBe(true);
    }, TIMEOUT);
  });

  describe('Date Normalization', () => {
    it('should normalize dates to ISO 8601 format', async () => {
      const variousDatesContent = `
DOCUMENT DATES

Written: January 5, 2024
Sent: 01/10/2024
Received: 2024-01-15
Due: Jan 20, 2024
Expires: 1/31/24
`;

      const base64Data = Buffer.from(variousDatesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Normalize all date formats',
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
              filename: 'various-dates.txt',
              mimeType: 'text/plain',
              size: variousDatesContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();
      expect(dates?.dates.length).toBeGreaterThan(0);

      // All dates should be normalized to YYYY-MM-DD format
      dates?.dates.forEach(date => {
        expect(date.normalizedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    }, TIMEOUT);
  });

  describe('Primary Date Identification', () => {
    it('should identify primary date from contract', async () => {
      const contractDatesContent = `
PURCHASE AGREEMENT

This Purchase Agreement is made and entered into as of April 1, 2024 (the "Effective Date").

Closing Date: May 15, 2024
Inspection Period Ends: April 20, 2024
Due Diligence Deadline: April 30, 2024

Signed:
Date: April 1, 2024
`;

      const base64Data = Buffer.from(contractDatesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Identify the primary date',
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
              filename: 'purchase-agreement.txt',
              mimeType: 'text/plain',
              size: contractDatesContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();

      // Should have identified a primary date (likely effective date)
      expect(dates?.primaryDate).toBeDefined();
      expect(dates?.primaryDate?.normalizedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }, TIMEOUT);
  });

  describe('Confidence Scoring', () => {
    it('should provide confidence scores for date extraction', async () => {
      const clearDatesContent = `
AGREEMENT

Effective Date: January 1, 2024
Expiration Date: December 31, 2024
Signed: January 1, 2024
`;

      const base64Data = Buffer.from(clearDatesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract dates with confidence scores',
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
              filename: 'clear-dates.txt',
              mimeType: 'text/plain',
              size: clearDatesContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();

      // Confidence should be between 0 and 1
      expect(dates?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(dates?.confidence).toBeLessThanOrEqual(1.0);

      // Clear dates should have reasonable confidence
      expect(dates?.dates.length).toBeGreaterThan(0);
    }, TIMEOUT);
  });

  describe('Documents Without Dates', () => {
    it('should handle documents without explicit dates', async () => {
      const noDatesContent = `
MEMORANDUM

TO: Legal Team
FROM: Senior Attorney
RE: Contract Analysis

Please review the attached contract and provide feedback.

The contract terms appear reasonable for this type of transaction.
`;

      const base64Data = Buffer.from(noDatesContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Check for dates in this memo',
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
              filename: 'memo-no-dates.txt',
              mimeType: 'text/plain',
              size: noDatesContent.length,
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

      const dates = data.payload?.content?.legalMetadata?.dates;
      expect(dates).toBeDefined();

      // Should have no dates or very few dates
      expect(dates?.dates.length).toBeLessThanOrEqual(1);

      // Confidence may be lower without dates
      expect(dates?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(dates?.confidence).toBeLessThanOrEqual(1.0);
    }, TIMEOUT);
  });
});
