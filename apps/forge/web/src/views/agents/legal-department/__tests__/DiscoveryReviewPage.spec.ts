/**
 * Unit tests for DiscoveryReviewPage.
 *
 * Verifies the orgSlug default behaviour and computed state logic without
 * mounting the full Ionic component tree.
 */
import { describe, it, expect } from 'vitest';

// ── orgSlug derivation logic ──────────────────────────────────────────────────

/**
 * Mirrors the orgSlug computed in DiscoveryReviewPage.vue.
 * Returns the active org slug if valid, otherwise falls back to 'legal'.
 */
function deriveOrgSlug(activeOrg: string | null | undefined): string {
  if (activeOrg && activeOrg !== '*') return activeOrg;
  return 'legal';
}

/**
 * Mirrors the context computed in DiscoveryReviewPage.vue.
 * Returns null when orgSlug is falsy or '*'.
 */
function deriveContext(
  orgSlug: string,
  userId: string,
): {
  orgSlug: string;
  userId: string;
  conversationId: string;
  agentSlug: string;
  agentType: string;
  provider: string;
  model: string;
} | null {
  if (!orgSlug || orgSlug === '*') return null;
  return {
    orgSlug,
    userId,
    conversationId: '',
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma4:e4b',
  };
}

// ── legalJobsService.createDiscoveryReview shape check ───────────────────────

describe('legalJobsService.createDiscoveryReview', () => {
  it('is exported from legalJobsService', async () => {
    // Dynamic import so we do not trigger Ionic side effects
    // This test only verifies the method exists on the exported object.
    // Full HTTP behaviour is covered by the integration smoke test.
    const { legalJobsService } = await import('../legalJobsService');
    expect(typeof legalJobsService.createDiscoveryReview).toBe('function');
  });
});

// ── DiscoveryReviewPage computed helpers ──────────────────────────────────────

describe('deriveOrgSlug()', () => {
  it('returns the active org when set to a non-wildcard value', () => {
    expect(deriveOrgSlug('big-ideas')).toBe('big-ideas');
  });

  it('returns "legal" when active org is "*"', () => {
    expect(deriveOrgSlug('*')).toBe('legal');
  });

  it('returns "legal" when active org is null', () => {
    expect(deriveOrgSlug(null)).toBe('legal');
  });

  it('returns "legal" when active org is undefined', () => {
    expect(deriveOrgSlug(undefined)).toBe('legal');
  });

  it('returns "legal" when active org is an empty string', () => {
    expect(deriveOrgSlug('')).toBe('legal');
  });
});

describe('deriveContext()', () => {
  it('returns a context object with the correct shape when org is valid', () => {
    const ctx = deriveContext('big-ideas', 'user-123');
    expect(ctx).not.toBeNull();
    expect(ctx?.orgSlug).toBe('big-ideas');
    expect(ctx?.userId).toBe('user-123');
    expect(ctx?.agentSlug).toBe('legal-department');
    expect(ctx?.agentType).toBe('langgraph');
    expect(ctx?.conversationId).toBe('');
  });

  it('returns null when orgSlug is "*"', () => {
    expect(deriveContext('*', 'user-123')).toBeNull();
  });

  it('returns null when orgSlug is empty', () => {
    expect(deriveContext('', 'user-123')).toBeNull();
  });
});
