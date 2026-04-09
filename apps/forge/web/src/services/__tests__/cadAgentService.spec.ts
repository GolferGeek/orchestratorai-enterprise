/**
 * Unit Tests for CadAgentService
 *
 * Tests cover:
 * - generateCad: verifies invoke is called with the correct build.create payload,
 *   store updates for each result type (deliverable/message/error),
 *   error propagation and cleanup
 * - connectToSSEStream: verifies SSEClient is instantiated, connects, and that
 *   event handlers are registered
 * - disconnectSSEStream: verifies cleanup callbacks are run and SSEClient.disconnect
 *   is called
 *
 * invoke-client and SSEClient are mocked — we are testing the service's
 * behaviour, not the transport layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// ---------------------------------------------------------------------------
// Mock invoke-client (replaces a2aOrchestrator)
// ---------------------------------------------------------------------------
const mockInvoke = vi.fn();

vi.mock('../invoke-client', () => ({
  invoke: mockInvoke,
}));

// ---------------------------------------------------------------------------
// Mock SSEClient (moved from agent2agent/sse to services/sseClient)
// ---------------------------------------------------------------------------
const mockSseConnect = vi.fn();
const mockSseDisconnect = vi.fn();
const mockSseOnStateChange = vi.fn().mockReturnValue(() => {});
const mockSseOnError = vi.fn().mockReturnValue(() => {});
const mockSseAddEventListener = vi.fn().mockReturnValue(() => {});

const MockSSEClient = vi.fn().mockImplementation(() => ({
  connect: mockSseConnect,
  disconnect: mockSseDisconnect,
  onStateChange: mockSseOnStateChange,
  onError: mockSseOnError,
  addEventListener: mockSseAddEventListener,
}));

vi.mock('../sseClient', () => ({
  SSEClient: MockSSEClient,
}));

// ---------------------------------------------------------------------------
// Mock tasksService (used by loadConversationState)
// ---------------------------------------------------------------------------
const mockListTasks = vi.fn();

vi.mock('../tasksService', () => ({
  tasksService: {
    listTasks: mockListTasks,
  },
}));

// ---------------------------------------------------------------------------
// Mock apiService (used by fetchProjects / createProject)
// ---------------------------------------------------------------------------
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock('../apiService', () => ({
  apiService: {
    get: mockApiGet,
    post: mockApiPost,
  },
}));

// ---------------------------------------------------------------------------
// Mock securityConfig
// ---------------------------------------------------------------------------
vi.mock('@/utils/securityConfig', () => ({
  getSecureApiBaseUrl: vi.fn(() => 'http://localhost:6200'),
}));

// ---------------------------------------------------------------------------
// Mock the CadAgent store
// ---------------------------------------------------------------------------
const mockSetGenerating = vi.fn();
const mockClearError = vi.fn();
const mockSetUIView = vi.fn();
const mockResetTaskState = vi.fn();
const mockSetCurrentTaskId = vi.fn();
const mockSetCurrentDrawingId = vi.fn();
const mockSetOutputs = vi.fn();
const mockSetMeshStats = vi.fn();
const mockSetError = vi.fn();
const mockSetLoading = vi.fn();
const mockSetProjects = vi.fn();
const mockAddProject = vi.fn();
const mockSetCurrentStage = vi.fn();
const mockSetProgressPercent = vi.fn();
const mockSetGeneratedCode = vi.fn();
const mockAddExecutionLogEntry = vi.fn();
const mockSetCodeValidation = vi.fn();
const mockResetCodeAttempt = vi.fn();
const mockIncrementCodeAttempt = vi.fn();

vi.mock('@/stores/cadAgentStore', () => ({
  useCadAgentStore: vi.fn(() => ({
    setGenerating: mockSetGenerating,
    clearError: mockClearError,
    setUIView: mockSetUIView,
    resetTaskState: mockResetTaskState,
    setCurrentTaskId: mockSetCurrentTaskId,
    setCurrentDrawingId: mockSetCurrentDrawingId,
    setOutputs: mockSetOutputs,
    setMeshStats: mockSetMeshStats,
    setError: mockSetError,
    setLoading: mockSetLoading,
    setProjects: mockSetProjects,
    addProject: mockAddProject,
    setCurrentStage: mockSetCurrentStage,
    setProgressPercent: mockSetProgressPercent,
    setGeneratedCode: mockSetGeneratedCode,
    addExecutionLogEntry: mockAddExecutionLogEntry,
    setCodeValidation: mockSetCodeValidation,
    resetCodeAttempt: mockResetCodeAttempt,
    incrementCodeAttempt: mockIncrementCodeAttempt,
  })),
}));

// ---------------------------------------------------------------------------
// Mock ExecutionContext store
// ---------------------------------------------------------------------------
const mockIsInitialized = { value: true };
const mockNewTaskId = vi.fn().mockReturnValue('task-uuid-123');
const mockCurrentCtx = {
  orgSlug: 'test-org',
  userId: 'user-1',
  conversationId: 'conv-1',
  agentSlug: 'cad-agent',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

vi.mock('@/stores/executionContextStore', () => ({
  useExecutionContextStore: vi.fn(() => ({
    get isInitialized() { return mockIsInitialized.value; },
    newTaskId: mockNewTaskId,
    get current() { return mockCurrentCtx; },
  })),
}));

// Stub sessionStorage / localStorage for getAuthToken()
vi.stubGlobal('sessionStorage', {
  getItem: vi.fn().mockReturnValue('test-token'),
});
vi.stubGlobal('localStorage', {
  getItem: vi.fn().mockReturnValue(null),
});

// Import the service AFTER mocks are set up
const { cadAgentService } = await import('../cadAgentService');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const defaultParams = {
  prompt: 'Create a bracket',
  constraints: { maxWeight: 500 },
  outputFormats: ['step', 'stl'],
};

function makeInvokeSuccess(content: Record<string, unknown>) {
  return {
    success: true,
    output: { content, outputType: 'json' },
    context: mockCurrentCtx,
  };
}

function makeInvokeError(message: string) {
  return {
    success: false,
    error: { code: 500, message },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CadAgentService', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    MockSSEClient.mockClear();
    // Re-register default mock return values after clearAllMocks
    mockSseOnStateChange.mockReturnValue(() => {});
    mockSseOnError.mockReturnValue(() => {});
    mockSseAddEventListener.mockReturnValue(() => {});
    mockNewTaskId.mockReturnValue('task-uuid-123');
    mockIsInitialized.value = true;
  });

  // -------------------------------------------------------------------------
  describe('generateCad', () => {
    it('calls invoke with build.create payload', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ message: '{}' }));

      await cadAgentService.generateCad(defaultParams);

      expect(mockInvoke).toHaveBeenCalledWith(
        mockCurrentCtx,
        expect.objectContaining({
          content: expect.objectContaining({
            mode: 'build',
            payload: expect.objectContaining({ action: 'create' }),
          }),
        }),
        expect.objectContaining({ baseUrl: 'http://localhost:6200' }),
        expect.objectContaining({ trigger: 'build.create' }),
      );
    });

    it('embeds the CAD parameters as JSON in userMessage', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ message: '{}' }));

      await cadAgentService.generateCad({ ...defaultParams, prompt: 'Gear' });

      const callArgs = mockInvoke.mock.calls[0][1];
      const parsed = JSON.parse(callArgs.content.userMessage);
      expect(parsed.type).toBe('cad-generation-request');
      expect(parsed.prompt).toBe('Gear');
      expect(parsed.constraints).toEqual(defaultParams.constraints);
      expect(parsed.outputFormats).toEqual(defaultParams.outputFormats);
    });

    it('throws when ExecutionContext is not initialized', async () => {
      mockIsInitialized.value = false;

      await expect(cadAgentService.generateCad(defaultParams)).rejects.toThrow(
        'ExecutionContext not initialized',
      );
    });

    it('sets store generating=true before the call', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ message: '{}' }));

      await cadAgentService.generateCad(defaultParams);

      expect(mockSetGenerating).toHaveBeenCalledWith(true);
    });

    it('resets task state and clears errors before the call', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ message: '{}' }));

      await cadAgentService.generateCad(defaultParams);

      expect(mockResetTaskState).toHaveBeenCalled();
      expect(mockClearError).toHaveBeenCalled();
    });

    it('sets UI view to progress before calling invoke', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ message: '{}' }));

      await cadAgentService.generateCad(defaultParams);

      const progressCallIndex = mockSetUIView.mock.calls.findIndex(
        (call) => call[0] === 'progress',
      );
      expect(progressCallIndex).toBeGreaterThanOrEqual(0);
    });

    it('sets current taskId from executionContextStore.newTaskId()', async () => {
      mockInvoke.mockResolvedValue(makeInvokeSuccess({ message: '{}' }));
      mockNewTaskId.mockReturnValue('my-task-id');

      await cadAgentService.generateCad(defaultParams);

      expect(mockSetCurrentTaskId).toHaveBeenCalledWith('my-task-id');
    });

    it('throws when invoke returns success:false', async () => {
      mockInvoke.mockResolvedValue(makeInvokeError('Agent rejected request'));

      await expect(cadAgentService.generateCad(defaultParams)).rejects.toThrow(
        'Agent rejected request',
      );
    });

    it('sets store error and re-throws when invoke throws', async () => {
      mockInvoke.mockRejectedValue(new Error('Network failure'));

      await expect(cadAgentService.generateCad(defaultParams)).rejects.toThrow(
        'Network failure',
      );

      expect(mockSetError).toHaveBeenCalledWith('Network failure');
      expect(mockSetGenerating).toHaveBeenCalledWith(false);
    });

    describe('version content in output', () => {
      it('extracts drawingId, outputs, and meshStats from parsed version content', async () => {
        const cadData = {
          status: 'completed',
          drawingId: 'drawing-abc',
          outputs: { step: 'http://example.com/file.step' },
          meshStats: { vertices: 1000, faces: 500 },
        };
        const versionContent = JSON.stringify({ data: { data: cadData } });
        mockInvoke.mockResolvedValue(
          makeInvokeSuccess({ version: { content: versionContent } }),
        );

        await cadAgentService.generateCad(defaultParams);

        expect(mockSetCurrentDrawingId).toHaveBeenCalledWith('drawing-abc');
        expect(mockSetOutputs).toHaveBeenCalledWith(cadData.outputs);
        expect(mockSetMeshStats).toHaveBeenCalledWith(cadData.meshStats);
      });

      it('sets UI view to deliverables when LangGraph status is completed', async () => {
        const versionContent = JSON.stringify({
          data: {
            data: { status: 'completed', drawingId: 'ddd', outputs: {}, meshStats: {} },
          },
        });
        mockInvoke.mockResolvedValue(
          makeInvokeSuccess({ version: { content: versionContent } }),
        );

        await cadAgentService.generateCad(defaultParams);

        expect(mockSetUIView).toHaveBeenCalledWith('deliverables');
        expect(mockSetGenerating).toHaveBeenCalledWith(false);
      });

      it('throws when LangGraph status is failed', async () => {
        const versionContent = JSON.stringify({
          data: {
            data: { status: 'failed', error: 'Mesh generation error' },
          },
        });
        mockInvoke.mockResolvedValue(
          makeInvokeSuccess({ version: { content: versionContent } }),
        );

        await expect(cadAgentService.generateCad(defaultParams)).rejects.toThrow(
          'Mesh generation error',
        );
      });
    });

    describe('message content in output', () => {
      it('extracts drawingId and outputs from JSON message content', async () => {
        const message = JSON.stringify({
          status: 'completed',
          drawingId: 'msg-drawing',
          outputs: { stl: 'http://example.com/file.stl' },
        });
        mockInvoke.mockResolvedValue(makeInvokeSuccess({ message }));

        await cadAgentService.generateCad(defaultParams);

        expect(mockSetCurrentDrawingId).toHaveBeenCalledWith('msg-drawing');
        expect(mockSetOutputs).toHaveBeenCalledWith({ stl: 'http://example.com/file.stl' });
      });

      it('handles non-JSON message without throwing', async () => {
        mockInvoke.mockResolvedValue(makeInvokeSuccess({ message: 'Task is running' }));

        await expect(cadAgentService.generateCad(defaultParams)).resolves.toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('connectToSSEStream', () => {
    it('instantiates SSEClient', () => {
      cadAgentService.connectToSSEStream('conv-1');

      expect(MockSSEClient).toHaveBeenCalled();
    });

    it('registers state-change, error, and message event listeners', () => {
      cadAgentService.connectToSSEStream('conv-1');

      expect(mockSseOnStateChange).toHaveBeenCalled();
      expect(mockSseOnError).toHaveBeenCalled();
      expect(mockSseAddEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('calls SSEClient.connect with a URL containing the conversationId', () => {
      cadAgentService.connectToSSEStream('conv-abc');

      expect(mockSseConnect).toHaveBeenCalledWith(
        expect.stringContaining('conv-abc'),
      );
    });

    it('includes the auth token in the SSE URL', () => {
      cadAgentService.connectToSSEStream('conv-1');

      expect(mockSseConnect).toHaveBeenCalledWith(
        expect.stringContaining('token='),
      );
    });

    it('disconnects any existing SSE connection before creating a new one', () => {
      // First connection
      cadAgentService.connectToSSEStream('conv-1');
      // Second connection should disconnect the first
      cadAgentService.connectToSSEStream('conv-2');

      // disconnect should have been called at least once (from the second connect)
      expect(mockSseDisconnect).toHaveBeenCalled();
    });

    it('sets store error and returns early when no auth token is available', () => {
      vi.mocked(sessionStorage.getItem).mockReturnValueOnce(null);
      vi.mocked(localStorage.getItem).mockReturnValueOnce(null);

      cadAgentService.connectToSSEStream('conv-1');

      expect(mockSetError).toHaveBeenCalledWith(
        expect.stringContaining('Authentication required'),
      );
      // SSEClient should NOT have been instantiated when auth is missing
      expect(mockSseConnect).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('disconnectSSEStream', () => {
    it('calls SSEClient.disconnect when a connection exists', () => {
      cadAgentService.connectToSSEStream('conv-1');
      cadAgentService.disconnectSSEStream();

      expect(mockSseDisconnect).toHaveBeenCalled();
    });

    it('does not throw when called with no active connection', () => {
      expect(() => cadAgentService.disconnectSSEStream()).not.toThrow();
    });

    it('clears the SSE cleanup callbacks', () => {
      const cleanupSpy = vi.fn();
      mockSseOnStateChange.mockReturnValueOnce(cleanupSpy);
      cadAgentService.connectToSSEStream('conv-1');
      cadAgentService.disconnectSSEStream();

      // The cleanup callback returned by onStateChange should have been called
      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('fetchProjects', () => {
    it('calls apiService.get with correct path', async () => {
      mockApiGet.mockResolvedValue([]);

      await cadAgentService.fetchProjects('my-org');

      expect(mockApiGet).toHaveBeenCalledWith('/api/engineering/projects?org=my-org');
    });

    it('calls store.setProjects with returned projects', async () => {
      const projects = [{ id: 'p1', name: 'Project Alpha' }];
      mockApiGet.mockResolvedValue(projects);

      await cadAgentService.fetchProjects('my-org');

      expect(mockSetProjects).toHaveBeenCalledWith(projects);
    });

    it('sets store error and rethrows when API fails', async () => {
      mockApiGet.mockRejectedValue(new Error('API down'));

      await expect(cadAgentService.fetchProjects('my-org')).rejects.toThrow('API down');
      expect(mockSetError).toHaveBeenCalledWith('API down');
    });
  });
});
