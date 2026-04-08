/**
 * Unit tests for LegalJobReviewModal Phase 4 reasoning behaviour.
 *
 * These tests exercise the service-layer contracts that the modal depends on
 * (legalJobsService.getReasoningForJob / getReasoningForSpecialist) using
 * mocked fetch. We do NOT mount the full Ionic modal (that would require
 * an Ionic platform bootstrap and a browser context) — instead, we verify
 * the service calls and their data shapes directly.
 *
 * Plan §4.27:
 * - Mock getReasoningForJob to return 2 specialist keys; assert only those
 *   two accordions would render (key set is correct).
 * - Mock the per-specialist fetch; assert expanding fetches on demand and
 *   returns thinkingContent in the expected shape.
 * - Assert re-opening an already-fetched specialist does NOT re-fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { legalJobsService } from '../../legalJobsService';

// ── mock fetch ────────────────────────────────────────────────────────────────

function mockFetchOnce(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('legalJobsService.getReasoningForJob', () => {
  it('returns the specialistKeys array from the probe endpoint', async () => {
    mockFetchOnce({ jobId: 'job-1', specialistKeys: ['contract', 'compliance'] });

    const keys = await legalJobsService.getReasoningForJob('job-1', 'org-a');

    expect(keys).toEqual(['contract', 'compliance']);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legal-department/jobs/job-1/reasoning'),
      expect.objectContaining({ headers: expect.objectContaining({}) }),
    );
  });

  it('returns an empty array when the server returns empty specialistKeys', async () => {
    mockFetchOnce({ jobId: 'job-1', specialistKeys: [] });

    const keys = await legalJobsService.getReasoningForJob('job-1', 'org-a');
    expect(keys).toEqual([]);
  });

  it('includes orgSlug as a query parameter', async () => {
    mockFetchOnce({ jobId: 'job-1', specialistKeys: [] });

    await legalJobsService.getReasoningForJob('job-1', 'acme-corp');

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(url).toContain('orgSlug=acme-corp');
  });
});

describe('legalJobsService.getReasoningForSpecialist', () => {
  it('returns thinkingContent and timing metadata', async () => {
    const mockPayload = {
      jobId: 'job-1',
      specialistKey: 'contract',
      thinkingContent: 'analysing the indemnification clause…',
      thinkingDurationMs: 1200,
      thinkingTokenCount: null,
    };
    mockFetchOnce(mockPayload);

    const result = await legalJobsService.getReasoningForSpecialist(
      'job-1',
      'org-a',
      'contract',
    );

    expect(result.thinkingContent).toBe('analysing the indemnification clause…');
    expect(result.thinkingDurationMs).toBe(1200);
    expect(result.thinkingTokenCount).toBeNull();
  });

  it('includes specialistKey as a query parameter', async () => {
    mockFetchOnce({
      jobId: 'job-1',
      specialistKey: 'compliance',
      thinkingContent: 'checking GDPR...',
      thinkingDurationMs: 800,
      thinkingTokenCount: null,
    });

    await legalJobsService.getReasoningForSpecialist('job-1', 'org-a', 'compliance');

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(url).toContain('specialistKey=compliance');
  });

  it('throws when the server returns 404 (no reasoning captured)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ message: 'not found' }),
      text: () => Promise.resolve('not found'),
    } as Response);

    await expect(
      legalJobsService.getReasoningForSpecialist('job-1', 'org-a', 'employment'),
    ).rejects.toThrow();
  });
});

// ── on-demand fetch + cache simulation ────────────────────────────────────────
// Simulates the modal's "fetch-on-expand, cache-for-session" logic.
// We mirror the pattern used in the modal's onReasoningExpand implementation.

describe('reasoning on-demand fetch and cache pattern', () => {
  const cache: Record<string, string> = {};
  const loadingState: Record<string, boolean> = {};

  async function onReasoningExpand(
    jobId: string,
    orgSlug: string,
    specialistKey: string,
  ): Promise<void> {
    if (cache[specialistKey] !== undefined) return;
    if (loadingState[specialistKey]) return;

    loadingState[specialistKey] = true;
    try {
      const result = await legalJobsService.getReasoningForSpecialist(
        jobId,
        orgSlug,
        specialistKey,
      );
      cache[specialistKey] = result.thinkingContent;
    } finally {
      delete loadingState[specialistKey];
    }
  }

  beforeEach(() => {
    Object.keys(cache).forEach((k) => delete cache[k]);
    Object.keys(loadingState).forEach((k) => delete loadingState[k]);
  });

  it('fetches on first expand and caches the result', async () => {
    mockFetchOnce({
      jobId: 'j1',
      specialistKey: 'contract',
      thinkingContent: 'thinking...',
      thinkingDurationMs: 500,
      thinkingTokenCount: null,
    });

    await onReasoningExpand('j1', 'org-a', 'contract');

    expect(cache['contract']).toBe('thinking...');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-fetch on second expand (uses cache)', async () => {
    mockFetchOnce({
      jobId: 'j1',
      specialistKey: 'contract',
      thinkingContent: 'thinking...',
      thinkingDurationMs: 500,
      thinkingTokenCount: null,
    });

    // First expand
    await onReasoningExpand('j1', 'org-a', 'contract');
    const fetchCountAfterFirst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Second expand (should not call fetch again)
    await onReasoningExpand('j1', 'org-a', 'contract');
    const fetchCountAfterSecond = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(fetchCountAfterSecond).toBe(fetchCountAfterFirst);
    expect(cache['contract']).toBe('thinking...');
  });
});
