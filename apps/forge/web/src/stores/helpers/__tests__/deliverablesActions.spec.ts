/**
 * Unit Tests for Forge deliverablesActions helpers
 *
 * Tests cover createDeliverableVersion — the function that touches the invoke
 * transport layer. The other helpers (loadDeliverables, deleteDeliverable, etc.) use
 * deliverablesService only and are not in scope for this test file.
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

/** Builds a backend (snake_case) version as returned by the invoke handler */
function makeBackendVersion(overrides: Record<string, unknown> = {}) {
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

/** Builds a successful invoke result containing a backend version */
function makeInvokeSuccess(backendVersion: object) {
  return {
    success: true,
    output: {
      content: { version: backendVersion },
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

describe('forge/deliverablesActions – createDeliverableVersion', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Default: deliverable found with conversationId
    mockGetDeliverableById = vi.fn().mockReturnValue(makeDeliverable());
  });

  it('calls invoke with build edit payload and correct context', async () => {
    const backendVersion = makeBackendVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    await createDeliverableVersion('forge-agent', 'del-1', 'v0', 'New content');

    expect(mockInvoke).toHaveBeenCalledWith(
      mockExecutionContext,
      expect.objectContaining({
        content: expect.objectContaining({
          mode: 'build',
          payload: expect.objectContaining({ action: 'edit', content: 'New content' }),
        }),
      }),
      expect.objectContaining({ baseUrl: 'http://localhost:6200' }),
      expect.objectContaining({ trigger: 'build.edit' }),
    );
  });

  it('includes conversationId in the payload', async () => {
    mockGetDeliverableById = vi.fn().mockReturnValue(
      makeDeliverable({ conversationId: 'conv-forge-99' }),
    );
    const backendVersion = makeBackendVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    const callArg = mockInvoke.mock.calls[0][1];
    expect(callArg.content.payload.conversationId).toBe('conv-forge-99');
  });

  it('includes editedFromVersionId and editedAt in metadata', async () => {
    const backendVersion = makeBackendVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    const callArg = mockInvoke.mock.calls[0][1];
    expect(callArg.content.payload.metadata).toMatchObject({
      editedFromVersionId: 'v0',
      editedAt: expect.any(String),
    });
  });

  it('merges caller-supplied metadata with tracking fields', async () => {
    const backendVersion = makeBackendVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content', {
      origin: 'forge-ui',
    });

    const callArg = mockInvoke.mock.calls[0][1];
    expect(callArg.content.payload.metadata).toMatchObject({
      origin: 'forge-ui',
      editedFromVersionId: 'v0',
      editedAt: expect.any(String),
    });
  });

  it('transforms the snake_case backend version to camelCase DeliverableVersion', async () => {
    const backendVersion = makeBackendVersion({
      id: 'ver-transformed',
      format: 'json',
      created_by_type: 'agent',
    });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.id).toBe('ver-transformed');
    expect(result.deliverableId).toBe('del-1');
    expect(result.format).toBe('json');
    // 'agent' maps to AI_RESPONSE enum
    expect(result.createdByType).toBe('ai_response');
  });

  it('maps markdown format correctly', async () => {
    const backendVersion = makeBackendVersion({ format: 'markdown' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.format).toBe('markdown');
  });

  it('maps html format correctly', async () => {
    const backendVersion = makeBackendVersion({ format: 'html' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.format).toBe('html');
  });

  it('maps unknown format to TEXT enum', async () => {
    const backendVersion = makeBackendVersion({ format: 'exotic-format' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.format).toBe('text');
  });

  it('maps user created_by_type to MANUAL_EDIT enum', async () => {
    const backendVersion = makeBackendVersion({ created_by_type: 'user' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.createdByType).toBe('manual_edit');
  });

  it('maps unknown created_by_type to MANUAL_EDIT enum', async () => {
    const backendVersion = makeBackendVersion({ created_by_type: 'system' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    const result = await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(result.createdByType).toBe('manual_edit');
  });

  it('calls store.addVersion with deliverableId and the transformed version', async () => {
    const backendVersion = makeBackendVersion({ id: 'ver-stored' });
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

    await createDeliverableVersion('agent', 'del-1', 'v0', 'Content');

    expect(mockAddVersion).toHaveBeenCalledWith(
      'del-1',
      expect.objectContaining({ id: 'ver-stored', deliverableId: 'del-1' }),
    );
  });

  it('sets loading true before the call and false after success', async () => {
    const backendVersion = makeBackendVersion();
    mockInvoke.mockResolvedValue(makeInvokeSuccess(backendVersion));

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
    mockInvoke.mockResolvedValue(makeInvokeError('Forge backend rejected'));

    await expect(
      createDeliverableVersion('agent', 'del-1', 'v0', 'Content'),
    ).rejects.toThrow('Forge backend rejected');

    expect(mockSetError).toHaveBeenCalledWith('Forge backend rejected');
  });

  it('throws and sets store error when response contains no version', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      output: { content: {}, outputType: 'json' },
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
