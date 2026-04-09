/**
 * Unit Tests for Compose planActions helpers
 *
 * Tests cover:
 * - createPlanVersion: calls invoke with correct arguments, updates store,
 *   throws on error / missing plan / bad response
 * - loadPlanVersions: calls invoke with list action, updates store for each version,
 *   returns empty array on error
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

// Mock executionContextStore
vi.mock('@/stores/executionContextStore', () => ({
  useExecutionContextStore: vi.fn(() => ({
    current: {
      orgSlug: 'test-org',
      userId: 'user-1',
      conversationId: 'conv-1',
      agentSlug: 'agent-1',
      agentType: 'simple',
      provider: 'anthropic',
      model: 'claude-3',
    },
  })),
}));

// Mock securityConfig
vi.mock('@/utils/securityConfig', () => ({
  getSecureApiBaseUrl: vi.fn(() => 'http://localhost:6300'),
}));

// Mock the planStore dependency so we control state
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
    isCurrentVersion: true,
    createdByType: 'agent' as const,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInvokeSuccess(content: unknown) {
  return {
    success: true,
    output: {
      content,
      outputType: 'json',
    },
  };
}

function makeInvokeError(message: string, code = 400) {
  return {
    success: false,
    error: { code, message },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compose/planActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockPlans = new Map();
  });

  // -------------------------------------------------------------------------
  describe('createPlanVersion', () => {
    it('calls invoke with the correct baseUrl and ExecutionContext', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ version }));

      await createPlanVersion('my-agent', 'plan-1', 'v0', 'New content');

      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({ orgSlug: 'test-org' }),
        expect.objectContaining({ contentType: 'application/json' }),
        expect.objectContaining({ baseUrl: 'http://localhost:6300' }),
      );
    });

    it('sends plan edit action with conversationId from the plan in store', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-abc' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ version }));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      const invokeCall = mockInvoke.mock.calls[0];
      const invokeData = invokeCall[1];
      const parsedContent = JSON.parse(invokeData.content);

      expect(parsedContent.mode).toBe('plan');
      expect(parsedContent.action).toBe('edit');
      expect(parsedContent.conversationId).toBe('conv-abc');
      expect(parsedContent.content).toBe('Content');
    });

    it('includes caller-supplied metadata merged with tracking fields', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ version }));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content', { customKey: 'customValue' });

      const invokeCall = mockInvoke.mock.calls[0];
      const parsedContent = JSON.parse(invokeCall[1].content);

      expect(parsedContent.metadata).toMatchObject({
        customKey: 'customValue',
        editedFromVersionId: 'v0',
        editedAt: expect.any(String),
      });
    });

    it('sets loading true before the call and false after success', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ version }));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      expect(mockSetLoading).toHaveBeenNthCalledWith(1, true);
      expect(mockSetLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('clears the error before calling the API', async () => {
      const version = makePlanVersionData();
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ version }));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      expect(mockClearError).toHaveBeenCalled();
    });

    it('calls store.addVersion with the planId and returned version', async () => {
      const version = makePlanVersionData({ id: 'v-new' });
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ version }));

      await createPlanVersion('agent', 'plan-1', 'v0', 'Content');

      expect(mockAddVersion).toHaveBeenCalledWith('plan-1', version);
    });

    it('returns the version data returned by the API', async () => {
      const version = makePlanVersionData({ id: 'v-new', content: 'Updated' });
      mockPlans.set('plan-1', { conversationId: 'conv-1' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ version }));

      const result = await createPlanVersion('agent', 'plan-1', 'v0', 'Updated');

      expect(result).toEqual(version);
    });

    it('throws and sets store error when plan is not in store', async () => {
      // mockPlans is empty — plan-1 does not exist
      await expect(
        createPlanVersion('agent', 'plan-1', 'v0', 'Content'),
      ).rejects.toThrow('Plan plan-1 not found in store');

      expect(mockSetError).toHaveBeenCalledWith('Plan plan-1 not found in store');
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
      mockInvoke.mockResolvedValue(makeInvokeSuccess({}));

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
    it('calls invoke with the plan list action', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ versions: [] }));

      await loadPlanVersions('my-agent', 'plan-1');

      const invokeCall = mockInvoke.mock.calls[0];
      const parsedContent = JSON.parse(invokeCall[1].content);

      expect(parsedContent.mode).toBe('plan');
      expect(parsedContent.action).toBe('list');
      expect(parsedContent.planId).toBe('plan-1');
    });

    it('calls store.addVersion for each version returned', async () => {
      const v1 = makePlanVersionData({ id: 'v1', versionNumber: 1 });
      const v2 = makePlanVersionData({ id: 'v2', versionNumber: 2 });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ versions: [v1, v2] }));

      await loadPlanVersions('agent', 'plan-1');

      expect(mockAddVersion).toHaveBeenCalledTimes(2);
      expect(mockAddVersion).toHaveBeenCalledWith('plan-1', v1);
      expect(mockAddVersion).toHaveBeenCalledWith('plan-1', v2);
    });

    it('returns the array of versions', async () => {
      const v1 = makePlanVersionData({ id: 'v1' });
      const v2 = makePlanVersionData({ id: 'v2' });
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ versions: [v1, v2] }));

      const result = await loadPlanVersions('agent', 'plan-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('v1');
      expect(result[1].id).toBe('v2');
    });

    it('returns empty array when API response has no versions field', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({}));

      const result = await loadPlanVersions('agent', 'plan-1');

      expect(result).toEqual([]);
      expect(mockAddVersion).not.toHaveBeenCalled();
    });

    it('sets loading true before the call and false after success', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ versions: [] }));

      await loadPlanVersions('agent', 'plan-1');

      expect(mockSetLoading).toHaveBeenNthCalledWith(1, true);
      expect(mockSetLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('sets store error and returns empty array on invoke error response', async () => {
      mockInvoke.mockResolvedValue(makeInvokeError('List failed'));

      const result = await loadPlanVersions('agent', 'plan-1');

      expect(result).toEqual([]);
      expect(mockSetError).toHaveBeenCalledWith('List failed');
    });

    it('sets store error and returns empty array when invoke rejects', async () => {
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
