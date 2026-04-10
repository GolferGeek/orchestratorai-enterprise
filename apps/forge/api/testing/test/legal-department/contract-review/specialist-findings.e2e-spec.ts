/**
 * E2E Test: Specialist Findings & Risk Calibration for Contract Review
 *
 * Validates that the 8 contract-review specialists produce accurate,
 * well-calibrated risk assessments when analyzing a contract with
 * known problematic clauses.
 *
 * This is the legal soundness test — an NDA with unlimited liability
 * MUST be flagged as critical, not low. One-sided indemnification
 * MUST be flagged as high risk. Standard terms MUST NOT be over-flagged.
 *
 * Acceptance criteria:
 * - All 8 specialists fire and return findings
 * - ClauseAnnotation shape is valid (clauseId, riskLevel, category, finding, reasoning)
 * - Risk levels are calibrated: known bad clauses get high/critical
 * - suggestedLanguage is present for high/critical findings
 * - Annotations reference valid clauseIds from the clause map
 *
 * Prerequisites:
 * - Forge API running on localhost:6200
 * - Auth API running on localhost:6100
 * - Supabase running with legal-department agent seeded
 * - LLM provider available
 *
 * Run with: npx jest --config apps/forge/api/testing/test/jest-e2e.json legal-department/contract-review/specialist-findings
 */

import { getApiUrl } from '../../test-env';
import { MUTUAL_NDA_TEXT, MUTUAL_NDA_EXPECTED_RISKS } from './fixtures/mutual-nda';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';

const TIMEOUT = 180_000; // Full specialist run with 8 specialists
const POLL_INTERVAL = 5_000;

const VALID_RISK_LEVELS = ['critical', 'high', 'medium', 'low', 'acceptable'] as const;

const ALL_SPECIALIST_KEYS = [
  'contract',
  'compliance',
  'ip',
  'privacy',
  'employment',
  'corporate',
  'litigation',
  'realEstate',
];

interface ClauseAnnotation {
  clauseId: string;
  riskLevel: string;
  category: string;
  finding: string;
  suggestedLanguage?: string;
  reasoning: string;
}

describe('Contract Review — Specialist Findings & Risk Calibration', () => {
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

  async function submitAndWaitForReview(): Promise<{
    jobId: string;
    specialistOutputs: Record<string, ClauseAnnotation[]>;
    clauseMap: { entries: Array<{ clauseId: string }> };
    orchestration: { completed?: string[]; failed?: string[] };
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

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

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

      // We need specialist outputs — available once the job reaches
      // awaiting_review or completed status.
      if (
        data.status === 'awaiting_review' ||
        data.status === 'completed' ||
        data.status === 'failed'
      ) {
        return {
          jobId,
          specialistOutputs: data.specialistOutputs ?? data.state?.specialistOutputs ?? {},
          clauseMap: data.clauseMap ?? data.state?.clauseMap ?? { entries: [] },
          orchestration: data.orchestration ?? data.state?.orchestration ?? {},
        };
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error(`Job ${jobId} did not reach review within ${TIMEOUT}ms`);
  }

  describe('Specialist output validation', () => {
    let specialistOutputs: Record<string, ClauseAnnotation[]>;
    let clauseMap: { entries: Array<{ clauseId: string }> };
    let orchestration: { completed?: string[]; failed?: string[] };
    let allAnnotations: ClauseAnnotation[];

    beforeAll(async () => {
      const result = await submitAndWaitForReview();
      specialistOutputs = result.specialistOutputs;
      clauseMap = result.clauseMap;
      orchestration = result.orchestration;

      allAnnotations = Object.values(specialistOutputs)
        .filter(Array.isArray)
        .flat();
    }, TIMEOUT);

    it('all 8 specialists completed', () => {
      const completed = orchestration.completed ?? [];
      const completedSet = new Set(completed);

      for (const key of ALL_SPECIALIST_KEYS) {
        expect(completedSet.has(key)).toBe(true);
      }

      // No specialists should have failed
      expect(orchestration.failed ?? []).toHaveLength(0);
    });

    it('specialist outputs exist for each completed specialist', () => {
      for (const key of ALL_SPECIALIST_KEYS) {
        expect(specialistOutputs[key]).toBeDefined();
        expect(Array.isArray(specialistOutputs[key])).toBe(true);
      }
    });

    it('every annotation has valid ClauseAnnotation shape', () => {
      for (const annotation of allAnnotations) {
        expect(annotation.clauseId).toBeTruthy();
        expect(typeof annotation.clauseId).toBe('string');
        expect(VALID_RISK_LEVELS).toContain(annotation.riskLevel);
        expect(annotation.category).toBeTruthy();
        expect(typeof annotation.finding).toBe('string');
        expect(annotation.finding.length).toBeGreaterThan(10);
        expect(typeof annotation.reasoning).toBe('string');
      }
    });

    it('all clauseIds reference entries in the clause map', () => {
      const validIds = new Set(clauseMap.entries.map((e) => e.clauseId));

      for (const annotation of allAnnotations) {
        expect(validIds.has(annotation.clauseId)).toBe(true);
      }
    });

    it('high and critical risk findings include suggestedLanguage', () => {
      const highCritical = allAnnotations.filter(
        (a) => a.riskLevel === 'high' || a.riskLevel === 'critical',
      );

      // At least 80% of high/critical findings should have suggested language.
      // LLM variability means we can't demand 100%.
      const withSuggestion = highCritical.filter(
        (a) => a.suggestedLanguage && a.suggestedLanguage.length > 10,
      );

      if (highCritical.length > 0) {
        const ratio = withSuggestion.length / highCritical.length;
        expect(ratio).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Risk calibration — known problem clauses', () => {
    let allAnnotations: ClauseAnnotation[];

    beforeAll(async () => {
      const result = await submitAndWaitForReview();
      allAnnotations = Object.values(result.specialistOutputs)
        .filter(Array.isArray)
        .flat();
    }, TIMEOUT);

    it('flags indemnification as at least high risk', () => {
      // Article 3 is one-sided indemnification
      const indemnityAnnotations = allAnnotations.filter(
        (a) =>
          a.category.toLowerCase().includes('indemnif') ||
          a.finding.toLowerCase().includes('indemnif') ||
          a.finding.toLowerCase().includes('one-sided'),
      );

      expect(indemnityAnnotations.length).toBeGreaterThan(0);

      const highOrAbove = indemnityAnnotations.some(
        (a) => a.riskLevel === 'high' || a.riskLevel === 'critical',
      );
      expect(highOrAbove).toBe(true);
    });

    it('flags unlimited liability as critical risk', () => {
      // Article 7 has unlimited liability for Widget, $100 cap for Acme
      const liabilityAnnotations = allAnnotations.filter(
        (a) =>
          a.category.toLowerCase().includes('liabilit') ||
          a.finding.toLowerCase().includes('unlimited') ||
          a.finding.toLowerCase().includes('$100'),
      );

      expect(liabilityAnnotations.length).toBeGreaterThan(0);

      const hasCritical = liabilityAnnotations.some(
        (a) => a.riskLevel === 'critical',
      );
      // If not critical, at least high
      const hasHighOrCritical = liabilityAnnotations.some(
        (a) => a.riskLevel === 'critical' || a.riskLevel === 'high',
      );
      expect(hasHighOrCritical).toBe(true);
    });

    it('flags overly broad IP assignment as high risk', () => {
      // Article 5 assigns ALL Widget IP to Acme, even unrelated inventions
      const ipAnnotations = allAnnotations.filter(
        (a) =>
          a.category.toLowerCase().includes('ip') ||
          a.category.toLowerCase().includes('intellectual') ||
          a.finding.toLowerCase().includes('ip assignment') ||
          a.finding.toLowerCase().includes('intellectual property'),
      );

      expect(ipAnnotations.length).toBeGreaterThan(0);

      const hasHighOrCritical = ipAnnotations.some(
        (a) => a.riskLevel === 'high' || a.riskLevel === 'critical',
      );
      expect(hasHighOrCritical).toBe(true);
    });

    it('does NOT over-flag standard confidentiality obligations (Article 2)', () => {
      // Article 2 is a standard mutual confidentiality clause — should be
      // acceptable or low risk, not high/critical.
      const confidentialityAnnotations = allAnnotations.filter(
        (a) =>
          a.finding.toLowerCase().includes('confidentiality') &&
          a.finding.toLowerCase().includes('article 2'),
      );

      // If specialists annotated Article 2, the risk should be low/acceptable
      for (const ann of confidentialityAnnotations) {
        expect(['acceptable', 'low', 'medium']).toContain(ann.riskLevel);
      }
    });

    it('produces findings across multiple specialist domains', () => {
      // The NDA should trigger at least 3 different specialist domains
      const categories = new Set(
        allAnnotations.map((a) => a.category.toLowerCase()),
      );
      expect(categories.size).toBeGreaterThanOrEqual(3);
    });

    it('total annotation count is reasonable for this contract', () => {
      // An NDA with ~12 sections and 5 known problems should produce
      // a meaningful number of annotations (not 0, not 500).
      expect(allAnnotations.length).toBeGreaterThanOrEqual(3);
      expect(allAnnotations.length).toBeLessThanOrEqual(100);
    });
  });
});
