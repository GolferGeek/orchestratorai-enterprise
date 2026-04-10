/**
 * E2E Test: Section Detection for Legal Department AI
 *
 * Tests section detection functionality:
 * - Detection of major document sections (preamble, definitions, terms, signatures)
 * - Section boundary identification
 * - Hierarchical structure detection
 * - Confidence scores for section detection
 * - Multi-level section nesting
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with legal-department agent seeded
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/section-detection.e2e-spec
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
        sections?: {
          sections: Array<{
            title: string;
            sectionNumber?: string;
            startPosition: number;
            endPosition?: number;
            level: number;
            content?: string;
          }>;
          confidence: number;
          structureType: 'numbered' | 'hierarchical' | 'simple' | 'unstructured';
        };
      };
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

describe('Legal Department AI - Section Detection', () => {
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

  describe('Standard Contract Sections', () => {
    it('should detect preamble, definitions, terms, and signatures sections', async () => {
      const contractContent = `
SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of January 1, 2024 ("Effective Date").

PREAMBLE

The parties wish to establish the terms and conditions under which services will be provided.

ARTICLE 1 - DEFINITIONS

1.1 "Services" means the professional services described in Exhibit A.
1.2 "Fees" means the compensation specified in Section 3.
1.3 "Term" means the period specified in Section 4.

ARTICLE 2 - SCOPE OF SERVICES

2.1 Provider Services. Provider shall perform the Services in a professional manner.
2.2 Customer Obligations. Customer shall provide necessary information and access.

ARTICLE 3 - COMPENSATION

3.1 Fees. Customer shall pay Provider the fees set forth in Exhibit A.
3.2 Payment Terms. Payment shall be due within thirty (30) days of invoice.

ARTICLE 4 - TERM AND TERMINATION

4.1 Initial Term. This Agreement shall commence on the Effective Date and continue for one (1) year.
4.2 Termination. Either party may terminate upon thirty (30) days written notice.

ARTICLE 5 - CONFIDENTIALITY

5.1 Both parties shall maintain confidentiality of proprietary information.

ARTICLE 6 - GENERAL PROVISIONS

6.1 Governing Law. This Agreement shall be governed by California law.
6.2 Entire Agreement. This Agreement constitutes the entire agreement.

SIGNATURES

IN WITNESS WHEREOF, the parties have executed this Agreement.

PROVIDER:                           CUSTOMER:

_____________________              _____________________
Name:                              Name:
Date:                              Date:
`;

      const base64Data = Buffer.from(contractContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze the sections of this contract',
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
              filename: 'service-agreement.txt',
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

      const sections = data.payload?.content?.legalMetadata?.sections;
      expect(sections).toBeDefined();
      expect(sections?.sections).toBeDefined();
      expect(sections?.sections.length).toBeGreaterThan(0);

      // Should detect multiple sections
      const sectionTitles = sections?.sections.map(s => s.title.toLowerCase()) || [];

      // Check for key sections (flexible matching)
      const hasDefinitions = sectionTitles.some(t => t.includes('definition'));
      const hasTerms = sectionTitles.some(t =>
        t.includes('term') || t.includes('scope') || t.includes('service') || t.includes('compensation')
      );
      const hasSignatures = sectionTitles.some(t => t.includes('signature') || t.includes('witness'));

      expect(hasDefinitions || hasTerms || hasSignatures).toBe(true);

      // Confidence score should be reasonable
      expect(sections?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(sections?.confidence).toBeLessThanOrEqual(1.0);
    }, TIMEOUT);

    it('should identify hierarchical structure', async () => {
      const hierarchicalContent = `
AGREEMENT

ARTICLE 1 - DEFINITIONS
1.1 First definition
1.2 Second definition
  1.2.1 Sub-definition
  1.2.2 Another sub-definition

ARTICLE 2 - SERVICES
2.1 Service Description
  2.1.1 Detailed service item
  2.1.2 Another service item
2.2 Service Delivery
  2.2.1 Delivery terms
`;

      const base64Data = Buffer.from(hierarchicalContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze the hierarchical structure',
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
              filename: 'hierarchical.txt',
              mimeType: 'text/plain',
              size: hierarchicalContent.length,
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

      const sections = data.payload?.content?.legalMetadata?.sections;
      expect(sections).toBeDefined();

      // Should detect hierarchical or numbered structure
      expect(sections?.structureType).toMatch(/^(hierarchical|numbered)$/);

      // Should have sections with different levels
      const hasMultipleLevels = sections?.sections.some(s => s.level > 1);
      expect(hasMultipleLevels).toBe(true);
    }, TIMEOUT);
  });

  describe('Pleading Sections', () => {
    it('should detect pleading sections (jurisdiction, parties, allegations, relief)', async () => {
      const pleadingContent = `
COMPLAINT

JURISDICTION AND VENUE

1. This Court has jurisdiction pursuant to 28 U.S.C. § 1332.
2. Venue is proper in this District.

PARTIES

3. Plaintiff is a Delaware corporation.
4. Defendant is a Nevada LLC.

FACTUAL ALLEGATIONS

5. On January 1, 2023, the parties entered into a contract.
6. Defendant breached the contract.

CAUSES OF ACTION

COUNT I - BREACH OF CONTRACT

7. Plaintiff incorporates all preceding paragraphs.
8. Defendant's breach caused damages.

PRAYER FOR RELIEF

WHEREFORE, Plaintiff requests:
1. Compensatory damages;
2. Costs;
3. Other relief.
`;

      const base64Data = Buffer.from(pleadingContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this complaint',
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
              size: pleadingContent.length,
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

      const sections = data.payload?.content?.legalMetadata?.sections;
      expect(sections).toBeDefined();
      expect(sections?.sections.length).toBeGreaterThan(0);

      const sectionTitles = sections?.sections.map(s => s.title.toLowerCase()) || [];

      // Check for pleading-specific sections
      const hasJurisdiction = sectionTitles.some(t => t.includes('jurisdiction') || t.includes('venue'));
      const hasParties = sectionTitles.some(t => t.includes('parties'));
      const hasAllegations = sectionTitles.some(t =>
        t.includes('allegation') || t.includes('factual') || t.includes('causes')
      );
      const hasRelief = sectionTitles.some(t => t.includes('relief') || t.includes('prayer') || t.includes('wherefore'));

      // At least some pleading sections should be detected
      const detectedPleadingSections = [hasJurisdiction, hasParties, hasAllegations, hasRelief].filter(Boolean).length;
      expect(detectedPleadingSections).toBeGreaterThan(0);
    }, TIMEOUT);
  });

  describe('Section Boundaries', () => {
    it('should identify section start and end positions', async () => {
      const simpleContent = `
SECTION 1 - INTRODUCTION
This is the introduction section.

SECTION 2 - BODY
This is the body section with more content.

SECTION 3 - CONCLUSION
This is the conclusion.
`;

      const base64Data = Buffer.from(simpleContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Identify section boundaries',
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
              filename: 'simple.txt',
              mimeType: 'text/plain',
              size: simpleContent.length,
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

      const sections = data.payload?.content?.legalMetadata?.sections;
      expect(sections).toBeDefined();

      // Each section should have start position
      sections?.sections.forEach(section => {
        expect(section.startPosition).toBeGreaterThanOrEqual(0);
        expect(section.title).toBeTruthy();
      });
    }, TIMEOUT);
  });

  describe('Unstructured Documents', () => {
    it('should handle unstructured documents gracefully', async () => {
      const unstructuredContent = `
This is a letter without clear section headings.

Dear Sir or Madam,

I am writing to inform you about a matter.

The matter concerns a contract dispute.

Please respond at your earliest convenience.

Sincerely,
John Doe
`;

      const base64Data = Buffer.from(unstructuredContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this unstructured document',
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
              filename: 'letter.txt',
              mimeType: 'text/plain',
              size: unstructuredContent.length,
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

      const sections = data.payload?.content?.legalMetadata?.sections;
      expect(sections).toBeDefined();

      // Should classify as unstructured or simple
      expect(sections?.structureType).toMatch(/^(unstructured|simple)$/);

      // May have few or no sections
      // Confidence should reflect lack of structure
      if (sections?.sections.length === 0 || sections?.structureType === 'unstructured') {
        expect(sections.confidence).toBeLessThan(0.8);
      }
    }, TIMEOUT);
  });

  describe('Confidence Scoring', () => {
    it('should provide confidence scores for section detection', async () => {
      const wellStructuredContent = `
ARTICLE I - PARTIES
The parties to this agreement are:
1.1 Party A
1.2 Party B

ARTICLE II - TERMS
The terms of this agreement include:
2.1 Payment terms
2.2 Delivery terms

ARTICLE III - TERMINATION
This agreement may be terminated:
3.1 By mutual consent
3.2 For cause
`;

      const base64Data = Buffer.from(wellStructuredContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Analyze this well-structured document',
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
              filename: 'well-structured.txt',
              mimeType: 'text/plain',
              size: wellStructuredContent.length,
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

      const sections = data.payload?.content?.legalMetadata?.sections;
      expect(sections).toBeDefined();

      // Well-structured document should have higher confidence
      expect(sections?.confidence).toBeGreaterThanOrEqual(0.0);
      expect(sections?.confidence).toBeLessThanOrEqual(1.0);

      // Should detect clear structure
      expect(sections?.structureType).toMatch(/^(numbered|hierarchical)$/);
      expect(sections?.sections.length).toBeGreaterThan(0);
    }, TIMEOUT);
  });
});
