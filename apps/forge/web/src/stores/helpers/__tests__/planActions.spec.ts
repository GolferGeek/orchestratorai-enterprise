/**
 * Unit Tests for Forge planActions helpers
 *
 * Tests cover:
 * - createPlanVersion: calls invoke with plan edit payload, updates store,
 *   throws on error / missing plan / bad response
 * - loadPlanVersions: calls invoke with plan list payload, updates store for
 *   each version, returns empty array on error
 *
 * invoke-client is mocked — we are testing the CALLER's behaviour, not the transport.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// ---------------------------------------------------------------------------
// Mock invoke-client
// ---------------------------------------------------------------------------
const mockInvoke = vi.fn();

vi.mock('@/services/invoke-client', () => ({
  invoke: mockInvoke,
}));

// ---------------------------------------------------------------------------
// Mock executionContextStore
// ---------------------------------------------------------------------------
const mockExecutionContext = {
  orgSlug: 'test-org',
  userId: 'user-1',
  conversationId: 'conv-1',
  agentSlug: 'test-agent',
  agentType: 'llm',
  provider: 'openai',
  model: 'gpt-4',
};

vi.mock('@/stores/executionContextStore', () => ({
  useExecutionContextStore: vi.fn(() => ({
    current: mockExecutionContext,
  })),
}));

// ---------------------------------------------------------------------------
// Mock securityConfig
// ---------------------------------------------------------------------------
vi.mock('@/utils/securityConfig', () => ({
  getSecureApiBaseUrl: vi.fn(() => 'http://localhost:6200'),
}));

// ---------------------------------------------------------------------------
// Mock the planStore dependency so we control state
// ---------------------------------------------------------------------------
const mockSetLoading = vi.fn();
const mockClearError = vi.fn();
const mockSetError = vi.fn();
const mockAddVersion = vi.fn();
let mockPlans: Map<string, { conversationId: string }>;

vi.mock('@/stores/planStore', () => ({
  usePlanStore: vi.fn(() => ({
    get plans() { return mockPlans; },
    setLoading: mockSetLoading,
    clearError: mockClearError,
    setError: mockSetError,
    addVersion: mockAddVersion,
  })),
}));

// Import helpers AFTER mocks are registered
const { createPlanVersion, loadPlanVersions } = await import('../planActions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlanVersionData(overrides = {}) {
  return {
    id: 'version-1',
    planId: 'plan-1',
    versionNumber: 1,
    content: '# Plan content',
    format: 'markdown' as const,
    isCurrent: true,
    createdByType: 'agent' as const,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInvokeSuccess(version: object) {
  return {
    success: true,
    output: {
      content: { version },
      outputType: 'json',
    },
    context: mockExecutionContext,
  };
}

function makeInvokeError(message: string) {
  return {
    success: false,
    error: { code: 400, message },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('forge/planActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockPlans = new Map();
  });

  // -------------------------------------------------------------------------
  describe('createPlanVersion', () => {
    it('calls invoke with plan edit payload and correct context', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess(version));

      await createPlanVersion('my-agent', 'plan-1', 'v0', 'New content');

      expect(mockInvoke).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.objectContaining({
          content: expect.objectContaining({
            mode: 'plan',
            payload: expect.objectContaining({ action: 'edit', content: 'New content' }),
          }),
        }),
        expect.objectContaining({ baseUrl: 'http://localhost:6200' }),
        expect.objectContaining({ trigger: 'plan.edit' }),
      );
    });

    it('includes editedFromVersionId and editedAt in metadata', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess(version));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      const callArg = mockInvoke.mock.calls[0][1];
      expect(callArg.content.payload.metadata).toMatchObject({
        editedFromVersionId: 'v0',
        editedAt: expect.any(String),
      });
    });

    it('merges caller-supplied metadata with tracking fields', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess(version));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content', { tag: 'forge' });

      const callArg = mockInvoke.mock.calls[0][1];
      expect(callArg.content.payload.metadata).toMatchObject({
        tag: 'forge',
        editedFromVersionId: 'v0',
        editedAt: expect.any(String),
      });
    });

    it('sets loading true before the call and false after success', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess(version));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      expect(mockSetLoading).toHaveBeenNthCalledWith(1, true);
      expect(mockSetLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('clears the error before calling the API', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess(version));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      expect(mockClearError).toHaveBeenCalled();
    });

    it('calls store.addVersion with the planId and returned version', async () => {
      const version = makePlanVersionData({ id: 'v-new' });
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess(version));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      expect(mockAddVersion).toHaveBeenCalledWith('plan-1', version);
    });

    it('returns the version data returned by the API', async () => {
      const version = makePlanVersionData({ id: 'v-new', content: 'Updated' });
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess(version));

      const result = await createPlanVersion('agent', 'plan-1', 'v0', 'Updated');

      expect(result).toEqual(version);
    });

    it('throws and sets store error when plan is not in store', async () => {
      await expect(
        createPlanVersion('agent', 'plan-missing', 'v0', 'Content'),
      ).rejects.toThrow('Plan plan-missing not found in store');

      expect(mockSetError).toHaveBeenCalledWith('Plan plan-missing not found in store');
    });

    it('throws and sets store error when invoke returns an error', async () => {
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeError('Server rejected the request'));

      await expect(
        createPlanVersion('agent', 'plan-1', 'v0', 'Content'),
      ).rejects.toThrow('Server rejected the request');

      expect(mockSetError).toHaveBeenCalledWith('Server rejected the request');
    });

    it('throws and sets store error when API response contains no version', async () => {
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue({
        success: true,
        output: { content: {}, outputType: 'json' },
      });

      await expect(
        createPlanVersion('agent', 'plan-1', 'v0', 'Content'),
      ).rejects.toThrow('No version returned from API');
    });

    it('sets loading false even when an error is thrown (finally block)', async () => {
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockRejectedValue(new Error('Network failure'));

      await expect(
        createPlanVersion('agent', 'plan-1', 'v0', 'Content'),
      ).rejects.toThrow('Network failure');

      expect(mockSetLoading).toHaveBeenLastCalledWith(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('loadPlanVersions', () => {
    function makeListInvokeSuccess(versions: object[]) {
      return {
        success: true,
        output: {
          content: { versions },
          outputType: 'json',
        },
        context: mockExecutionContext,
      };
    }

    it('calls invoke with plan list payload', async () => {
      mockInvoke.mockResolvedValue(makeListInvokeSuccess([]));

      await loadPlanVersions('my-agent', 'plan-1');

      expect(mockInvoke).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.objectContaining({
          content: expect.objectContaining({
            mode: 'plan',
            payload: expect.objectContaining({ action: 'list' }),
          }),
        }),
        expect.objectContaining({ baseUrl: 'http://localhost:6200' }),
        expect.objectContaining({ trigger: 'plan.list' }),
      );
    });

    it('passes the planId in the payload', async () => {
      mockInvoke.mockResolvedValue(makeListInvokeSuccess([]));

      await loadPlanVersions('agent', 'plan-forge-42');

      const callArg = mockInvoke.mock.calls[0][1];
      expect(callArg.content.payload.planId).toBe('plan-forge-42');
    });

    it('calls store.addVersion for each version returned', async () => {
      const v1 = makePlanVersionData({ id: 'v1', versionNumber: 1 });
      const v2 = makePlanVersionData({ id: 'v2', versionNumber: 2 });
      mockInvoke.mockResolvedValue(makeListInvokeSuccess([v1, v2]));

      await loadPlanVersions('agent', 'plan-1');

      expect(mockAddVersion).toHaveBeenCalledTimes(2);
      expect(mockAddVersion).toHaveBeenCalledWith('plan-1', v1);
      expect(mockAddVersion).toHaveBeenCalledWith('plan-1', v2);
    });

    it('returns the array of versions', async () => {
      const v1 = makePlanVersionData({ id: 'v1' });
      const v2 = makePlanVersionData({ id: 'v2' });
      mockInvoke.mockResolvedValue(makeListInvokeSuccess([v1, v2]));

      const result = await loadPlanVersions('agent', 'plan-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('v1');
      expect(result[1].id).toBe('v2');
    });

    it('returns empty array when output has no versions field', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        output: { content: {}, outputType: 'json' },
      });

      const result = await loadPlanVersions('agent', 'plan-1');

      expect(result).toEqual([]);
      expect(mockAddVersion).not.toHaveBeenCalled();
    });

    it('sets loading true before the call and false after success', async () => {
      mockInvoke.mockResolvedValue(makeListInvokeSuccess([]));

      await loadPlanVersions('agent', 'plan-1');

      expect(mockSetLoading).toHaveBeenNthCalledWith(1, true);
      expect(mockSetLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('sets store error and returns empty array on invoke error response', async () => {
      mockInvoke.mockResolvedValue(makeInvokeError('Forge list failed'));

      const result = await loadPlanVersions('agent', 'plan-1');

      expect(result).toEqual([]);
      expect(mockSetError).toHaveBeenCalledWith('Forge list failed');
    });

    it('sets store error and returns empty array when API rejects', async () => {
      mockInvoke.mockRejectedValue(new Error('Network error'));

      const result = await loadPlanVersions('agent', 'plan-1');

      expect(result).toEqual([]);
      expect(mockSetError).toHaveBeenCalledWith('Network error');
    });

    it('sets loading false even when API rejects (finally block)', async () => {
      mockInvoke.mockRejectedValue(new Error('Network error'));

      await loadPlanVersions('agent', 'plan-1');

      expect(mockSetLoading).toHaveBeenLastCalledWith(false);
    });
  });
});
