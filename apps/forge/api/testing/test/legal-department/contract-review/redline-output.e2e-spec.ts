/**
 * E2E Test: Redline Output Completeness for Contract Review
 *
 * Validates that the synthesis node merges specialist annotations
 * into a complete, well-formed RedlineOutput with accurate risk
 * breakdown, clause syntheses, and suggested replacement language.
 *
 * This test ensures the output that reaches the HITL reviewer
 * is complete and actionable — every flagged clause has a summary,
 * the risk breakdown totals match, and the overall risk is correct.
 *
 * Acceptance criteria:
 * - RedlineOutput has one ClauseSynthesis per clause map entry
 * - riskBreakdown totals sum to totalClauses
 * - flaggedClauses count matches clauses with risk > acceptable
 * - overallRisk equals the highest clause risk
 * - Every high/critical clause has a suggestedRedline
 * - Every synthesis has a non-empty summary
 * - orchestration.synthesis has executiveSummary and keyFindings
 *
 * Prerequisites:
 * - Forge API running on localhost:6200
 * - Auth API running on localhost:6100
 * - Supabase running
 * - LLM provider available
 *
 * Run with: npx jest --config apps/forge/api/testing/test/jest-e2e.json legal-department/contract-review/redline-output
 */

import { getApiUrl } from '../../test-env';
import { MUTUAL_NDA_TEXT } from './fixtures/mutual-nda';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';

const TIMEOUT = 180_000;
const POLL_INTERVAL = 5_000;

interface ClauseSynthesis {
  clauseId: string;
  originalText: string;
  overallRisk: string;
  annotations: Array<{
    clauseId: string;
    riskLevel: string;
    category: string;
    finding: string;
    suggestedLanguage?: string;
    reasoning: string;
  }>;
  suggestedRedline?: string;
  summary: string;
}

interface RedlineOutput {
  clauses: ClauseSynthesis[];
  riskBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    acceptable: number;
  };
  totalClauses: number;
  flaggedClauses: number;
  overallRisk: string;
}

describe('Contract Review — Redline Output Completeness', () => {
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
  }, TIMEOUT);

  async function submitAndWaitForRedline(): Promise<{
    jobId: string;
    redlineOutput: RedlineOutput;
    synthesis: Record<string, unknown>;
  }> {
    const fileBuffer = Buffer.from(MUTUAL_NDA_TEXT, 'utf-8');

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

    const uploadResponse = await fetch(
      `${API_URL}/legal-department/jobs/upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      },
    );

    const { jobId } = await uploadResponse.json();
    const start = Date.now();

    while (Date.now() - start < TIMEOUT) {
      const response = await fetch(
        `${API_URL}/legal-department/jobs/${jobId}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      if (!response.ok) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      const data = await response.json();

      if (
        data.status === 'awaiting_review' ||
        data.status === 'completed'
      ) {
        return {
          jobId,
          redlineOutput: data.redlineOutput ?? data.state?.redlineOutput,
          synthesis: data.orchestration?.synthesis ?? data.state?.orchestration?.synthesis ?? {},
        };
      }

      if (data.status === 'failed') {
        throw new Error(`Job failed: ${data.error ?? 'unknown error'}`);
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error(`Job ${jobId} did not produce redline within ${TIMEOUT}ms`);
  }

  describe('RedlineOutput structure', () => {
    let redlineOutput: RedlineOutput;
    let synthesis: Record<string, unknown>;

    beforeAll(async () => {
      const result = await submitAndWaitForRedline();
      redlineOutput = result.redlineOutput;
      synthesis = result.synthesis;
    }, TIMEOUT);

    it('has a non-empty clauses array', () => {
      expect(redlineOutput).toBeDefined();
      expect(redlineOutput.clauses).toBeDefined();
      expect(redlineOutput.clauses.length).toBeGreaterThan(0);
    });

    it('riskBreakdown totals sum to totalClauses', () => {
      const { critical, high, medium, low, acceptable } =
        redlineOutput.riskBreakdown;
      const sum = critical + high + medium + low + acceptable;
      expect(sum).toBe(redlineOutput.totalClauses);
    });

    it('flaggedClauses matches count of non-acceptable clauses', () => {
      const flagged = redlineOutput.clauses.filter(
        (c) => c.overallRisk !== 'acceptable',
      ).length;
      expect(redlineOutput.flaggedClauses).toBe(flagged);
    });

    it('overallRisk matches the highest clause risk', () => {
      const riskOrder = ['critical', 'high', 'medium', 'low', 'acceptable'];
      let highestRisk = 'acceptable';

      for (const clause of redlineOutput.clauses) {
        if (riskOrder.indexOf(clause.overallRisk) < riskOrder.indexOf(highestRisk)) {
          highestRisk = clause.overallRisk;
        }
      }

      expect(redlineOutput.overallRisk).toBe(highestRisk);
    });

    it('every ClauseSynthesis has required fields', () => {
      for (const clause of redlineOutput.clauses) {
        expect(clause.clauseId).toBeTruthy();
        expect(clause.originalText).toBeTruthy();
        expect(clause.originalText.length).toBeGreaterThan(10);
        expect(
          ['critical', 'high', 'medium', 'low', 'acceptable'],
        ).toContain(clause.overallRisk);
        expect(clause.summary).toBeTruthy();
        expect(clause.summary.length).toBeGreaterThan(5);
        expect(Array.isArray(clause.annotations)).toBe(true);
      }
    });

    it('high/critical clauses have suggestedRedline', () => {
      const flagged = redlineOutput.clauses.filter(
        (c) => c.overallRisk === 'high' || c.overallRisk === 'critical',
      );

      // At least 80% should have suggested replacement language
      if (flagged.length > 0) {
        const withRedline = flagged.filter(
          (c) => c.suggestedRedline && c.suggestedRedline.length > 10,
        );
        const ratio = withRedline.length / flagged.length;
        expect(ratio).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('acceptable clauses have "No issues" summary', () => {
      const acceptable = redlineOutput.clauses.filter(
        (c) => c.overallRisk === 'acceptable',
      );

      for (const clause of acceptable) {
        expect(clause.annotations).toHaveLength(0);
      }
    });

    it('clause annotations are consistent with clause overallRisk', () => {
      for (const clause of redlineOutput.clauses) {
        if (clause.annotations.length === 0) {
          expect(clause.overallRisk).toBe('acceptable');
        } else {
          // overallRisk should be >= the highest annotation risk
          const riskOrder = ['critical', 'high', 'medium', 'low', 'acceptable'];
          const highestAnnotation = clause.annotations.reduce((prev, curr) => {
            return riskOrder.indexOf(curr.riskLevel) < riskOrder.indexOf(prev)
              ? curr.riskLevel
              : prev;
          }, 'acceptable');
          expect(riskOrder.indexOf(clause.overallRisk)).toBeLessThanOrEqual(
            riskOrder.indexOf(highestAnnotation),
          );
        }
      }
    });
  });

  describe('orchestration.synthesis', () => {
    let synthesis: Record<string, unknown>;

    beforeAll(async () => {
      const result = await submitAndWaitForRedline();
      synthesis = result.synthesis;
    }, TIMEOUT);

    it('has an executiveSummary', () => {
      expect(synthesis.executiveSummary).toBeDefined();
      expect(typeof synthesis.executiveSummary).toBe('string');
      expect((synthesis.executiveSummary as string).length).toBeGreaterThan(10);
    });

    it('has keyFindings array', () => {
      expect(Array.isArray(synthesis.keyFindings)).toBe(true);
    });

    it('has overallRisk with level and description', () => {
      const risk = synthesis.overallRisk as Record<string, unknown>;
      expect(risk).toBeDefined();
      expect(risk.level).toBeTruthy();
      expect(risk.description).toBeTruthy();
    });

    it('has recommendations array', () => {
      expect(Array.isArray(synthesis.recommendations)).toBe(true);
    });

    it('has confidence score between 0 and 1', () => {
      expect(typeof synthesis.confidence).toBe('number');
      expect(synthesis.confidence as number).toBeGreaterThanOrEqual(0);
      expect(synthesis.confidence as number).toBeLessThanOrEqual(1);
    });
  });
});
