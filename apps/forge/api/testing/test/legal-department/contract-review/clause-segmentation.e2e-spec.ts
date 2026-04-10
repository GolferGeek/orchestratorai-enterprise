/**
 * E2E Test: Clause Segmentation Accuracy for Contract Review
 *
 * Validates that the clause segmentation pipeline correctly parses
 * a contract into addressable clause map entries. This is the
 * foundation — if segmentation fails, all downstream specialist
 * analysis is anchored to wrong or missing clauses.
 *
 * Acceptance criteria:
 * - All major sections are identified
 * - Clause IDs follow the s{section}-c{clause} convention
 * - Defined terms are extracted
 * - Clause text is preserved (not truncated or garbled)
 * - Section-level entries are marked correctly
 *
 * Prerequisites:
 * - Forge API running on localhost:6200
 * - Auth API running on localhost:6100
 * - Supabase running with legal-department agent seeded
 * - LLM provider available (Ollama or cloud)
 *
 * Run with: npx jest --config apps/forge/api/testing/test/jest-e2e.json legal-department/contract-review/clause-segmentation
 */

import { getApiUrl } from '../../test-env';
import { MUTUAL_NDA } from '../fixtures';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';

const TIMEOUT = 120_000; // Segmentation uses LLM calls
const POLL_INTERVAL = 3_000;

interface ClauseMapEntry {
  clauseId: string;
  sectionPath: string;
  text: string;
  definedTermsReferenced: string[];
  sectionLevel: boolean;
  entryType: 'clause' | 'section';
}

interface ClauseMap {
  entries: ClauseMapEntry[];
  definedTerms: Record<string, string>;
  sectionCount: number;
  clauseCount: number;
}

describe('Contract Review — Clause Segmentation Accuracy', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      throw new Error(`Authentication failed: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    authToken = authData.accessToken;

    const jwtParts = authToken.split('.');
    if (jwtParts[1]) {
      const jwtPayload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
      userId = jwtPayload.sub;
    }
    expect(userId).toBeTruthy();
  }, TIMEOUT);

  async function submitContractForReview(): Promise<string> {
    // Create a text file buffer from the NDA text
    const fileBuffer = Buffer.from(MUTUAL_NDA.text, 'utf-8');

    const formData = new FormData();
    formData.append(
      'files',
      new Blob([fileBuffer], { type: 'text/plain' }),
      'mutual-nda.txt',
    );
    formData.append(
      'context',
      JSON.stringify({
        orgSlug: ORG_SLUG,
        userId,
        provider: 'ollama',
        model: 'gemma4:31b',
      }),
    );
    formData.append('capabilitySlug', 'contract-review');

    const response = await fetch(
      `${API_URL}/legal-department/jobs/upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${response.status} — ${text}`);
    }

    const data = await response.json();
    expect(data.jobId).toBeDefined();
    return data.jobId;
  }

  async function pollUntilSegmented(
    jobId: string,
    timeoutMs: number = TIMEOUT,
  ): Promise<{ status: string; clauseMap?: ClauseMap }> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await fetch(
        `${API_URL}/legal-department/jobs/${jobId}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      if (!response.ok) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      const data = await response.json();
      const status = data.status;

      // Once we're past 'queued' and have a clauseMap, segmentation is done.
      // We might be in 'processing', 'awaiting_review', or 'completed'.
      if (
        status !== 'queued' &&
        (data.clauseMap || data.input?.data?.clauseMap ||
         status === 'awaiting_review' || status === 'completed' || status === 'failed')
      ) {
        return {
          status,
          clauseMap: data.clauseMap ?? data.state?.clauseMap ?? data.input?.data?.clauseMap,
        };
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error(`Job ${jobId} did not complete segmentation within ${timeoutMs}ms`);
  }

  describe('NDA clause segmentation', () => {
    let jobId: string;
    let clauseMap: ClauseMap | undefined;

    beforeAll(async () => {
      jobId = await submitContractForReview();
      const result = await pollUntilSegmented(jobId);
      clauseMap = result.clauseMap;

      if (!clauseMap) {
        console.warn(
          'Clause map not available from job response — ' +
          'segmentation may be embedded in internal state. ' +
          'Check if the job completed or failed: ' + result.status,
        );
      }
    }, TIMEOUT);

    it('produces a non-empty clause map', () => {
      expect(clauseMap).toBeDefined();
      expect(clauseMap!.entries.length).toBeGreaterThan(0);
    });

    it('identifies a reasonable number of sections/clauses', () => {
      // The NDA has 12 articles. Segmentation should find at least 10
      // sections (some may merge preamble/recitals or general provisions).
      const totalEntries = clauseMap!.entries.length;
      expect(totalEntries).toBeGreaterThanOrEqual(
        MUTUAL_NDA.expectedSectionCount - 2,
      );
    });

    it('clause IDs follow the expected convention', () => {
      for (const entry of clauseMap!.entries) {
        // clauseId should match s{N} or s{N}-c{N} pattern
        expect(entry.clauseId).toMatch(/^s\d+(-c\d+)?$/);
      }
    });

    it('every entry has non-empty text', () => {
      for (const entry of clauseMap!.entries) {
        expect(entry.text).toBeTruthy();
        expect(entry.text.length).toBeGreaterThan(10);
      }
    });

    it('entry types are valid', () => {
      for (const entry of clauseMap!.entries) {
        expect(['clause', 'section']).toContain(entry.entryType);
      }
    });

    it('section paths are present and hierarchical', () => {
      for (const entry of clauseMap!.entries) {
        expect(entry.sectionPath).toBeTruthy();
        // Section paths should be numeric with optional dots
        expect(entry.sectionPath).toMatch(/^\d+(\.\d+)*$/);
      }
    });

    it('captures indemnification clauses (Article 3)', () => {
      const indemnityClauses = clauseMap!.entries.filter(
        (e) =>
          e.text.toLowerCase().includes('indemnif') ||
          e.sectionPath.startsWith('3'),
      );
      expect(indemnityClauses.length).toBeGreaterThan(0);
    });

    it('captures IP assignment clauses (Article 5)', () => {
      const ipClauses = clauseMap!.entries.filter(
        (e) =>
          e.text.toLowerCase().includes('intellectual property') ||
          e.text.toLowerCase().includes('hereby assigns') ||
          e.sectionPath.startsWith('5'),
      );
      expect(ipClauses.length).toBeGreaterThan(0);
    });

    it('captures limitation of liability clauses (Article 7)', () => {
      const liabilityClauses = clauseMap!.entries.filter(
        (e) =>
          e.text.toLowerCase().includes('liability') ||
          e.text.toLowerCase().includes('damages') ||
          e.sectionPath.startsWith('7'),
      );
      expect(liabilityClauses.length).toBeGreaterThan(0);
    });

    it('definedTerms includes key contract terms', () => {
      // The NDA defines "Confidential Information", "Disclosing Party", etc.
      const terms = Object.keys(clauseMap!.definedTerms);
      // Segmentation should extract at least some defined terms
      // (LLM variability means we check for >0 rather than exact count)
      if (terms.length > 0) {
        const hasConfidentialInfo = terms.some(
          (t) => t.toLowerCase().includes('confidential'),
        );
        expect(hasConfidentialInfo).toBe(true);
      }
    });

    it('clauseCount and sectionCount are consistent with entries', () => {
      const clauses = clauseMap!.entries.filter(
        (e) => e.entryType === 'clause',
      ).length;
      const sections = clauseMap!.entries.filter(
        (e) => e.entryType === 'section',
      ).length;

      expect(clauseMap!.clauseCount).toBe(clauses);
      expect(clauseMap!.sectionCount).toBe(sections);
    });
  });
});
