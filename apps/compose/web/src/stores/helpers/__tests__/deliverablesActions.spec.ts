/**
 * Unit Tests for Compose deliverablesActions helpers
 *
 * Tests cover createDeliverableVersion — the function that calls the invoke transport layer.
 * The other helpers (loadDeliverables, deleteDeliverable, etc.) use deliverablesService
 * only and are not in scope for A2A migration Phase 1.
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

// ---------------------------------------------------------------------------
// Mock the deliverables store
// ---------------------------------------------------------------------------
const mockSetLoading = vi.fn();
const mockClearError = vi.fn();
const mockSetError = vi.fn();
const mockAddVersion = vi.fn();
let mockGetDeliverableById: ReturnType<typeof vi.fn>;

vi.mock('@/stores/deliverablesStore', () => ({
  useDeliverablesStore: vi.fn(() => ({
    get getDeliverableById() { return mockGetDeliverableById; },
    setLoading: mockSetLoading,
    clearError: mockClearError,
    setError: mockSetError,
    addVersion: mockAddVersion,
  })),
}));

// Import helper AFTER mocks are registered
const { createDeliverableVersion } = await import('../deliverablesActions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeliverable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'del-1',
    conversationId: 'conv-1',
    title: 'Test Deliverable',
    type: 'document',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Builds an A2A-style (snake_case) version as returned by the backend */
function makeA2AVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver-1',
    deliverable_id: 'del-1',
    version_number: 2,
    content: '# Updated content',
    format: 'markdown',
    is_current_version: true,
    created_by_type: 'user',
    task_id: null,
    metadata: null,
    created_at: '2024-01-02T00:00:00.000Z',
    ...overrides,
  };
}

/** Wraps an A2A version in the invoke output content shape */
function makeInvokeSuccess(a2aVersion: object) {
  return {
    success: true,
    output: {
      content: {
        success: true,
        data: {
          deliverable: makeDeliverable(),
          version: a2aVersion,
        },
      },
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

describe('compose/deliverablesActions – createDeliverableVersion', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Default: deliverable found with conversationId
    mockGetDeliverableById = vi.fn().mockReturnValue(makeDeliverable());
  });

  it('calls invoke with the correct baseUrl and ExecutionContext', async () => {
    const a2aVersion = makeA2AVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    await createDeliverableVersion('my-agent', 'del-1', 'v0', 'New content');

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ orgSlug: 'test-org' }),
      expect.objectContaining({ contentType: 'application/json' }),
      expect.objectContaining({ baseUrl: 'http://localhost:6300' }),
    );
  });

  it('sends build edit action with the conversationId from the deliverable', async () => {
    const a2aVersion = makeA2AVersion();
    mockGetDeliverableById = vi.fn().mockReturnValue(
      makeDeliverable({ conversationId: 'conv-xyz' }),
    );
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    const invokeCall = mockInvoke.mock.calls[0];
    const parsedContent = JSON.parse(invokeCall[1].content);

    expect(parsedContent.mode).toBe('build');
    expect(parsedContent.action).toBe('edit');
    expect(parsedContent.conversationId).toBe('conv-xyz');
    expect(parsedContent.content).toBe('Content');
  });

  it('includes caller-supplied metadata merged with tracking fields', async () => {
    const a2aVersion = makeA2AVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content', {
      source: 'manual',
    });

    const invokeCall = mockInvoke.mock.calls[0];
    const parsedContent = JSON.parse(invokeCall[1].content);

    expect(parsedContent.metadata).toMatchObject({
      source: 'manual',
      editedFromVersionId: 'v0',
      editedAt: expect.any(String),
    });
  });

  it('transforms the snake_case A2A version to camelCase DeliverableVersion', async () => {
    const a2aVersion = makeA2AVersion({
      id: 'ver-new',
      format: 'json',
      created_by_type: 'agent',
    });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.id).toBe('ver-new');
    expect(result.deliverableId).toBe('del-1');
    expect(result.format).toBe('json');
    // 'agent' maps to AI_RESPONSE enum
    expect(result.createdByType).toBe('ai_response');
  });

  it('maps unknown format to TEXT enum', async () => {
    const a2aVersion = makeA2AVersion({ format: 'unknown-format' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.format).toBe('text');
  });

  it('maps unknown created_by_type to MANUAL_EDIT enum', async () => {
    const a2aVersion = makeA2AVersion({ created_by_type: 'robot' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.createdByType).toBe('manual_edit');
  });

  it('calls store.addVersion with deliverableId and the transformed version', async () => {
    const a2aVersion = makeA2AVersion({ id: 'ver-new' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(mockAddVersion).toHaveBeenCalledWith(
      'del-1',
      expect.objectContaining({ id: 'ver-new', deliverableId: 'del-1' }),
    );
  });

  it('sets loading true before the call and false after success', async () => {
    const a2aVersion = makeA2AVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(a2aVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(mockSetLoading).toHaveBeenNthCalledWith(1, true);
    expect(mockSetLoading).toHaveBeenNthCalledWith(2, false);
  });

  it('throws and sets store error when deliverable not in store', async () => {
    mockGetDeliverableById = vi.fn().mockReturnValue(null);

    await expect(
      createDeliverableVersion('agent', 'del-missing', 'v0', 'Content'),
    ).rejects.toThrow('Deliverable del-missing not found in store');

    expect(mockSetError).toHaveBeenCalledWith('Deliverable del-missing not found in store');
  });

  it('throws and sets store error when deliverable has no conversationId', async () => {
    mockGetDeliverableById = vi.fn().mockReturnValue(
      makeDeliverable({ conversationId: undefined }),
    );

    await expect(
      createDeliverableVersion('agent', 'del-1', 'v0', 'Content'),
    ).rejects.toThrow('Deliverable del-1 has no associated conversation');

    expect(mockSetError).toHaveBeenCalledWith(
      'Deliverable del-1 has no associated conversation',
    );
  });

  it('throws and sets store error when invoke returns an error', async () => {
    mockInvoke.mockResolvedValue(makeInvokeError('Backend rejected'));

    await expect(
      createDeliverableVersion('agent', 'del-1', 'v0', 'Content'),
    ).rejects.toThrow('Backend rejected');

    expect(mockSetError).toHaveBeenCalledWith('Backend rejected');
  });

  it('throws and sets store error when response contains no version', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      output: {
        content: { success: true, data: { deliverable: makeDeliverable() } },
        outputType: 'json',
      },
    });

    await expect(
      createDeliverableVersion('agent', 'del-1', 'v0', 'Content'),
    ).rejects.toThrow('No version returned from API');
  });

  it('sets loading false even when an error is thrown (finally block)', async () => {
    mockInvoke.mockRejectedValue(new Error('Network failure'));

    await expect(
      createDeliverableVersion('agent', 'del-1', 'v0', 'Content'),
    ).rejects.toThrow('Network failure');

    expect(mockSetLoading).toHaveBeenLastCalledWith(false);
  });
});
