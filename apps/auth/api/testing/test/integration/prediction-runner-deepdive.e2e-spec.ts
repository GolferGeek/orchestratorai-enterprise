/**
 * E2E Test: Prediction Deep-Dive via A2A
 *
 * Tests the prediction.getDeepDive action that returns full lineage:
 * - Source article references
 * - Signal fingerprints
 * - Analyst reasoning chain
 * - Contributing predictors with signals
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 * - At least one prediction with full lineage data
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-deepdive.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL =
  process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';
const PREDICTION_AGENT = 'us-tech-stocks-2025';

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for dashboard operations
const DASHBOARD_TIMEOUT = 30000;

interface DashboardResponse {
  success: boolean;
  mode: string;
  payload: {
    content: unknown;
    metadata: Record<string, unknown>;
  };
}

interface PredictionLineage {
  prediction: {
    id: string;
    targetId: string;
    direction: string;
    magnitude: string;
    confidence: number;
    timeframeHours: number;
    status: string;
    predictedAt: string;
    expiresAt: string;
    outcomeValue: number | null;
    resolutionNotes: string | null;
    reasoning: string;
  };
  lineage: {
    predictors: Array<{
      id: string;
      direction: string;
      strength: number;
      confidence: number;
      reasoning: string;
      analystSlug: string;
      createdAt: string;
      signal: {
        id: string;
        content: string;
        direction: string;
        urgency: string;
        sourceId: string;
        detectedAt: string;
        url: string | null;
      } | null;
      fingerprint: {
        titleNormalized: string;
        keyPhrases: string[];
        fingerprintHash: string;
      } | null;
      sourceArticle: {
        url: string | null;
        title: string | undefined;
        firstSeenAt: string;
        contentHash: string;
      } | null;
    }>;
    analystAssessments: Array<{
      analystSlug: string;
      tier: string;
      direction: string;
      confidence: number;
      reasoning: string;
      keyFactors: string[];
      risks: string[];
      learningsApplied: string[];
    }>;
    llmEnsemble: unknown;
    thresholdEvaluation: unknown;
    timeline: unknown[];
  };
  stats: {
    predictorCount: number;
    signalCount: number;
    analystCount: number;
    averageConfidence: number;
  };
}

describe('Prediction Deep-Dive E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let testPredictionId: string | null = null;

  beforeAll(async () => {
    // Authenticate
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      console.error(
        'Authentication failed:',
        authResponse.status,
        authResponse.statusText,
      );
      throw new Error(
        `Authentication failed: ${authResponse.status} ${authResponse.statusText}`,
      );
    }

    const authData = (await authResponse.json()) as { accessToken: string };
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    // Extract userId from JWT sub claim
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        ) as { sub: string };
        userId = jwtPayload.sub;
      } else {
        userId = process.env.SUPABASE_TEST_USERID || '';
      }
    } catch {
      userId = process.env.SUPABASE_TEST_USERID || '';
    }
    expect(userId).toBeTruthy();
  }, 30000);

  /**
   * Helper to call A2A endpoint with dashboard mode
   */
  const callDashboard = async (
    agentSlug: string,
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<DashboardResponse> => {
    const response = await fetch(
      `${API_URL}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          mode: 'dashboard',
          context: {
            orgSlug: ORG_SLUG,
            agentSlug,
            agentType: 'prediction',
            userId,
            conversationId: NIL_UUID,
            taskId: NIL_UUID,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
            provider: NIL_UUID,
            model: NIL_UUID,
          },
          payload: {
            action,
            params,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Dashboard call failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return (await response.json()) as DashboardResponse;
  };

  describe('prediction.getDeepDive', () => {
    it('should get a prediction ID from list first', async () => {
      // First, get a list of predictions to find a valid ID
      const listResult = await callDashboard(PREDICTION_AGENT, 'predictions.list', {
        filters: { status: 'active' },
        pageSize: 1,
      });

      expect(listResult.success).toBe(true);
      expect(listResult.payload.content).toBeDefined();

      const content = listResult.payload.content as { data: { id: string }[] };
      if (content.data && content.data.length > 0) {
        const firstPrediction = content.data[0];
        if (firstPrediction) {
          testPredictionId = firstPrediction.id;
          console.log('Found prediction ID for deep-dive test:', testPredictionId);
        }
      } else {
        console.log('No predictions available for deep-dive test - skipping');
      }
    }, DASHBOARD_TIMEOUT);

    it('should return full lineage data for a valid prediction', async () => {
      if (!testPredictionId) {
        console.log('Skipping - no prediction available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'predictions.deep-dive', {
        id: testPredictionId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: PredictionLineage };
      expect(content.data).toBeDefined();

      const data = content.data;

      // Verify prediction structure
      expect(data.prediction).toBeDefined();
      expect(data.prediction.id).toBe(testPredictionId);
      expect(data.prediction.direction).toBeDefined();
      expect(data.prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(data.prediction.confidence).toBeLessThanOrEqual(1);

      // Verify lineage structure
      expect(data.lineage).toBeDefined();
      expect(data.lineage.predictors).toBeDefined();
      expect(Array.isArray(data.lineage.predictors)).toBe(true);
      expect(data.lineage.analystAssessments).toBeDefined();
      expect(Array.isArray(data.lineage.analystAssessments)).toBe(true);

      // Verify stats structure
      expect(data.stats).toBeDefined();
      expect(typeof data.stats.predictorCount).toBe('number');
      expect(typeof data.stats.signalCount).toBe('number');
      expect(typeof data.stats.analystCount).toBe('number');
      expect(typeof data.stats.averageConfidence).toBe('number');

      console.log('Deep-dive response stats:', data.stats);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing prediction ID', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'predictions.deep-dive', {});

      // Dashboard may return success=true with error in content, or success=false
      expect(result.payload).toBeDefined();

      // Check if content has error structure
      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Either outer success=false or content.success=false with MISSING_ID error
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_ID');
      } else {
        // Error returned at outer level
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for non-existent prediction', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'predictions.deep-dive', {
        id: '00000000-0000-0000-0000-000000000001', // Non-existent UUID
      });

      // Dashboard may return success=true with error in content, or success=false
      expect(result.payload).toBeDefined();

      // Check if content has error structure
      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Either outer success=false or content.success=false with NOT_FOUND error
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('NOT_FOUND');
      } else {
        // Error returned at outer level
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should include signal fingerprints when available', async () => {
      if (!testPredictionId) {
        console.log('Skipping - no prediction available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'predictions.deep-dive', {
        id: testPredictionId,
      });

      expect(result.success).toBe(true);
      const content = result.payload.content as { data: PredictionLineage };
      const data = content.data;

      // Check if any predictors have fingerprints
      const predictorsWithFingerprints = data.lineage.predictors.filter(
        (p) => p.fingerprint !== null,
      );

      if (predictorsWithFingerprints.length > 0) {
        const firstPredictor = predictorsWithFingerprints[0];
        const fingerprint = firstPredictor?.fingerprint;
        expect(fingerprint).toBeDefined();
        expect(fingerprint?.titleNormalized).toBeDefined();
        expect(Array.isArray(fingerprint?.keyPhrases)).toBe(true);
        expect(fingerprint?.fingerprintHash).toBeDefined();
        console.log('Found fingerprint data:', {
          titleNormalized: fingerprint?.titleNormalized?.substring(0, 50),
          keyPhrasesCount: fingerprint?.keyPhrases?.length,
        });
      } else {
        console.log('No fingerprint data available in test prediction');
      }
    }, DASHBOARD_TIMEOUT);

    it('should include analyst reasoning chain', async () => {
      if (!testPredictionId) {
        console.log('Skipping - no prediction available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'predictions.deep-dive', {
        id: testPredictionId,
      });

      expect(result.success).toBe(true);
      const content = result.payload.content as { data: PredictionLineage };
      const data = content.data;

      if (data.lineage.analystAssessments.length > 0) {
        const assessment = data.lineage.analystAssessments[0];
        if (assessment) {
          expect(assessment.analystSlug).toBeDefined();
          expect(assessment.direction).toBeDefined();
          expect(assessment.confidence).toBeGreaterThanOrEqual(0);
          expect(assessment.reasoning).toBeDefined();
          expect(Array.isArray(assessment.keyFactors)).toBe(true);
          expect(Array.isArray(assessment.risks)).toBe(true);
          console.log('Analyst assessment found:', {
            analyst: assessment.analystSlug,
            direction: assessment.direction,
            confidence: assessment.confidence,
          });
        }
      } else {
        console.log('No analyst assessments available in test prediction');
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Alternative action names', () => {
    it('should support getDeepDive action name', async () => {
      if (!testPredictionId) {
        console.log('Skipping - no prediction available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'predictions.getDeepDive', {
        id: testPredictionId,
      });

      expect(result.success).toBe(true);
      const content = result.payload.content as { data: PredictionLineage };
      expect(content.data.prediction).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should support get-deep-dive action name', async () => {
      if (!testPredictionId) {
        console.log('Skipping - no prediction available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'predictions.get-deep-dive', {
        id: testPredictionId,
      });

      expect(result.success).toBe(true);
      const content = result.payload.content as { data: PredictionLineage };
      expect(content.data.prediction).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should support deepdive action name', async () => {
      if (!testPredictionId) {
        console.log('Skipping - no prediction available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'predictions.deepdive', {
        id: testPredictionId,
      });

      expect(result.success).toBe(true);
      const content = result.payload.content as { data: PredictionLineage };
      expect(content.data.prediction).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });
});
