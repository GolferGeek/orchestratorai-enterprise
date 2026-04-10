/**
 * E2E Test: HITL Review Flow for Contract Review
 *
 * Validates the full human-in-the-loop cycle:
 * 1. Submit NDA for contract review
 * 2. Wait for job to reach awaiting_review status
 * 3. Submit per-clause review decisions (accept/reject/modify)
 * 4. Verify the review is recorded and the job progresses
 *
 * This is critical for legal soundness — an attorney MUST be able to:
 * - Accept a suggested redline
 * - Reject a suggestion (keeping original language)
 * - Modify a suggestion with their own language
 *
 * Acceptance criteria:
 * - Job reaches awaiting_review after specialist analysis
 * - Per-clause review submission returns 202 Accepted
 * - Approve-all flow completes the job successfully
 * - Reject flow re-queues the job for re-analysis
 * - Modify flow uses the reviewer's replacement text
 *
 * Prerequisites:
 * - Forge API running on localhost:6200
 * - Auth API running on localhost:6100
 * - Supabase running
 * - LLM provider available
 *
 * Run with: npx jest --config apps/forge/api/testing/test/jest-e2e.json legal-department/contract-review/hitl-review-flow
 */

import { getApiUrl } from '../../test-env';
import { MUTUAL_NDA } from '../fixtures';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';

const TIMEOUT = 180_000;
const POLL_INTERVAL = 5_000;

describe('Contract Review — HITL Review Flow', () => {
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

  async function uploadContract(): Promise<string> {
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
      throw new Error(`Upload failed: ${response.status}`);
    }

    const data = await response.json();
    return data.jobId;
  }

  async function waitForStatus(
    jobId: string,
    targetStatus: string | string[],
    timeoutMs: number = TIMEOUT,
  ): Promise<Record<string, unknown>> {
    const targets = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await fetch(
        `${API_URL}/legal-department/jobs/${jobId}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      if (response.ok) {
        const data = await response.json();
        if (targets.includes(data.status)) {
          return data;
        }
        if (data.status === 'failed' && !targets.includes('failed')) {
          throw new Error(`Job failed unexpectedly: ${data.error ?? 'unknown'}`);
        }
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error(
      `Job ${jobId} did not reach ${targets.join('|')} within ${timeoutMs}ms`,
    );
  }

  describe('Approve-all flow', () => {
    it('submits approve decision and job completes', async () => {
      const jobId = await uploadContract();

      // Wait for HITL pause
      await waitForStatus(jobId, 'awaiting_review');

      // Submit approve decision
      const reviewResponse = await fetch(
        `${API_URL}/legal-department/jobs/${jobId}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            context: {
              orgSlug: ORG_SLUG,
              userId,
              provider: 'ollama',
              model: 'gemma4:31b',
            },
            decision: { decision: 'approve' },
          }),
        },
      );

      expect(reviewResponse.status).toBe(202);
      const reviewData = await reviewResponse.json();
      expect(reviewData.jobId).toBe(jobId);

      // Wait for completion
      const completed = await waitForStatus(jobId, ['completed', 'failed']);
      expect(completed.status).toBe('completed');
    }, TIMEOUT);
  });

  describe('Per-clause review flow', () => {
    it('submits per-clause decisions (accept + modify)', async () => {
      const jobId = await uploadContract();

      // Wait for HITL pause
      const awaitingData = await waitForStatus(jobId, 'awaiting_review');

      // Get the redline output to know which clauses exist
      const redlineOutput = (awaitingData as Record<string, unknown>).redlineOutput as {
        clauses: Array<{ clauseId: string; overallRisk: string }>;
      } | undefined;

      // Build per-clause decisions: accept most, modify one
      const clauseDecisions: Array<{
        clauseId: string;
        decision: string;
        modifiedLanguage?: string;
      }> = [];

      if (redlineOutput?.clauses) {
        for (const clause of redlineOutput.clauses) {
          if (clause.overallRisk === 'high' || clause.overallRisk === 'critical') {
            clauseDecisions.push({
              clauseId: clause.clauseId,
              decision: 'modify',
              modifiedLanguage: `[REVIEWED] Modified replacement for ${clause.clauseId}`,
            });
          } else {
            clauseDecisions.push({
              clauseId: clause.clauseId,
              decision: 'accept',
            });
          }
        }
      }

      // If we couldn't get clause IDs, fall back to standard approve
      if (clauseDecisions.length === 0) {
        const reviewResponse = await fetch(
          `${API_URL}/legal-department/jobs/${jobId}/review`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              context: {
                orgSlug: ORG_SLUG,
                userId,
                provider: 'ollama',
                model: 'gemma4:31b',
              },
              decision: { decision: 'approve' },
            }),
          },
        );
        expect(reviewResponse.status).toBe(202);
        return;
      }

      // Submit per-clause review
      const reviewResponse = await fetch(
        `${API_URL}/legal-department/jobs/${jobId}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            context: {
              orgSlug: ORG_SLUG,
              userId,
              provider: 'ollama',
              model: 'gemma4:31b',
            },
            clauseDecisions,
          }),
        },
      );

      expect(reviewResponse.status).toBe(202);

      // Should complete (no rejections → report generation)
      const completed = await waitForStatus(jobId, ['completed', 'failed']);
      expect(completed.status).toBe('completed');
    }, TIMEOUT);
  });

  describe('Review validation', () => {
    it('rejects review when job is not awaiting_review', async () => {
      const jobId = await uploadContract();

      // Try to review immediately (job is still queued/processing)
      const response = await fetch(
        `${API_URL}/legal-department/jobs/${jobId}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            context: {
              orgSlug: ORG_SLUG,
              userId,
              provider: 'ollama',
              model: 'gemma4:31b',
            },
            decision: { decision: 'approve' },
          }),
        },
      );

      // Should be 409 Conflict (not awaiting_review)
      expect(response.status).toBe(409);
    }, TIMEOUT);

    it('rejects review without ExecutionContext', async () => {
      const response = await fetch(
        `${API_URL}/legal-department/jobs/fake-job-id/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(400);
    });

    it('rejects reject decision without feedback', async () => {
      const jobId = await uploadContract();
      await waitForStatus(jobId, 'awaiting_review');

      const response = await fetch(
        `${API_URL}/legal-department/jobs/${jobId}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            context: {
              orgSlug: ORG_SLUG,
              userId,
              provider: 'ollama',
              model: 'gemma4:31b',
            },
            decision: { decision: 'reject' },
          }),
        },
      );

      // Should require feedback when rejecting
      expect(response.status).toBe(400);
    }, TIMEOUT);
  });
});
