/**
 * Unit tests for CadAgentService
 *
 * Tests the CAD Agent service that manages the graph lifecycle:
 * - onModuleInit - graph initialization
 * - generate - CAD model generation
 * - getStatus - status checking
 * - getHistory - state history retrieval
 * - getDrawingOutputs - helper method
 *
 * All dependencies are fully mocked.
 */
import { MemorySaver } from '@langchain/langgraph';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { CadAgentService } from './cad-agent.service';
import { CadAgentInput, CadAgentState } from './cad-agent.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { CadDbService } from './services/cad-db.service';
import { CadStorageService } from './services/cad-storage.service';
import { OpenCascadeExecutorService } from './services/opencascade-executor.service';

// Mock createCadAgentGraph to avoid WASM initialization
jest.mock('./cad-agent.graph', () => {
  return {
    createCadAgentGraph: jest.fn(),
  };
});

import { createCadAgentGraph } from './cad-agent.graph';

describe('CadAgentService', () => {
  let service: CadAgentService;
  let mockLlmClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  let mockCadDb: jest.Mocked<CadDbService>;
  let mockCadStorage: jest.Mocked<CadStorageService>;
  let mockOcctExecutor: jest.Mocked<OpenCascadeExecutorService>;
  let mockGraph: {
    invoke: jest.Mock;
    getState: jest.Mock;
    getStateHistory: jest.Mock;
  };

  const mockContext = createMockExecutionContext({
    taskId: 'task-123',
    userId: 'user-456',
    orgSlug: 'test-org',
    conversationId: 'conv-123',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  });

  const mockProject = {
    id: 'project-123',
    org_slug: 'test-org',
    name: 'Test Project',
    description: null,
    constraints: {},
    metadata: {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    created_by: 'user-456',
  };

  const mockDrawing = {
    id: 'task-123',
    project_id: 'project-123',
    task_id: 'task-123',
    conversation_id: 'conv-123',
    name: 'Create a simple box',
    description: null,
    prompt: 'Create a simple box',
    version: 1,
    parent_drawing_id: null,
    status: 'pending' as const,
    constraints_override: null,
    error_message: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    completed_at: null,
    created_by: 'user-456',
  };

  const mockFinalState: Partial<CadAgentState> = {
    status: 'completed',
    executionContext: mockContext,
    userMessage: 'Create a simple box',
    projectId: 'project-123',
    drawingId: 'task-123',
    generatedCode:
      'function createModel(oc) { return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape(); }',
    meshStats: { vertices: 8, faces: 12 },
    error: undefined,
    executionStatus: 'completed',
    isCodeValid: true,
    validationErrors: [],
    codeAttempt: 1,
    constraints: {},
    codeType: 'opencascade-js',
    outputs: {},
    messages: [],
    startedAt: Date.now() - 3000,
    completedAt: Date.now(),
  };

  const mockOutputs = [
    {
      id: 'output-1',
      drawing_id: 'task-123',
      generated_code_id: 'code-123',
      format: 'step' as const,
      storage_path: 'test-org/project-123/task-123/model.step',
      file_size_bytes: 12345,
      mesh_stats: null,
      export_time_ms: null,
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'output-2',
      drawing_id: 'task-123',
      generated_code_id: 'code-123',
      format: 'stl' as const,
      storage_path: 'test-org/project-123/task-123/model.stl',
      file_size_bytes: 8000,
      mesh_stats: null,
      export_time_ms: null,
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'output-3',
      drawing_id: 'task-123',
      generated_code_id: 'code-123',
      format: 'gltf' as const,
      storage_path: 'test-org/project-123/task-123/model.gltf',
      file_size_bytes: 5000,
      mesh_stats: null,
      export_time_ms: null,
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'output-4',
      drawing_id: 'task-123',
      generated_code_id: 'code-123',
      format: 'dxf' as const,
      storage_path: 'test-org/project-123/task-123/model.dxf',
      file_size_bytes: 2000,
      mesh_stats: null,
      export_time_ms: null,
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'output-5',
      drawing_id: 'task-123',
      generated_code_id: 'code-123',
      format: 'thumbnail' as const,
      storage_path: 'test-org/project-123/task-123/thumbnail.png',
      file_size_bytes: 1000,
      mesh_stats: null,
      export_time_ms: null,
      created_at: '2025-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockGraph = {
      invoke: jest.fn().mockResolvedValue(mockFinalState),
      getState: jest.fn(),
      getStateHistory: jest.fn(),
    };

    (createCadAgentGraph as jest.Mock).mockResolvedValue(mockGraph);

    mockLlmClient = {
      callLLM: jest.fn(),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    mockObservability = {
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;

    const memorySaver = new MemorySaver();
    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as unknown as jest.Mocked<PostgresCheckpointerService>;

    mockCadDb = {
      createProject: jest.fn().mockResolvedValue(mockProject),
      createDrawingWithId: jest.fn().mockResolvedValue(mockDrawing),
      getDrawingOutputs: jest.fn().mockResolvedValue(mockOutputs),
      getEffectiveConstraints: jest.fn().mockResolvedValue({}),
      updateDrawingStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CadDbService>;

    mockCadStorage = {
      getPublicUrl: jest
        .fn()
        .mockImplementation(
          (path: string) => `https://storage.example.com/${path}`,
        ),
      storeFile: jest.fn(),
    } as unknown as jest.Mocked<CadStorageService>;

    mockOcctExecutor = {
      executeCode: jest.fn(),
      isReady: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<OpenCascadeExecutorService>;

    service = new CadAgentService(
      mockLlmClient,
      mockObservability,
      mockCheckpointer,
      mockCadDb,
      mockCadStorage,
      mockOcctExecutor,
    );
  });

  // ========================================
  // onModuleInit
  // ========================================

  describe('onModuleInit', () => {
    it('should initialize the graph', async () => {
      service.onModuleInit();

      expect(createCadAgentGraph).toHaveBeenCalledWith(
        mockLlmClient,
        mockObservability,
        mockCheckpointer,
        mockCadDb,
        mockCadStorage,
        mockOcctExecutor,
      );
    });
  });

  // ========================================
  // generate
  // ========================================

  describe('generate', () => {
    beforeEach(async () => {
      service.onModuleInit();
    });

    it('should generate a CAD model with existing projectId', async () => {
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a simple box',
        projectId: 'existing-project-123',
      };

      const result = await service.generate(input);

      expect(result.taskId).toBe('task-123');
      expect(result.status).toBe('completed');
      expect(result.userMessage).toBe('Create a simple box');
      expect(mockCadDb.createProject).not.toHaveBeenCalled(); // Should not create project if provided
      expect(mockCadDb.createDrawingWithId).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-123',
          projectId: 'existing-project-123',
          name: 'Create a simple box',
          prompt: 'Create a simple box',
          taskId: 'task-123',
          conversationId: 'conv-123',
        }),
      );
      expect(mockGraph.invoke).toHaveBeenCalled();
    });

    it('should create new project with newProjectName when no projectId', async () => {
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a bracket',
        newProjectName: 'My Bracket Project',
        constraints: { units: 'mm' },
      };

      await service.generate(input);

      expect(mockCadDb.createProject).toHaveBeenCalledWith(
        'test-org',
        'My Bracket Project',
        expect.stringContaining('conv-123'),
        { units: 'mm' },
        'user-456',
      );
    });

    it('should create project from prompt when no projectId or newProjectName', async () => {
      const longMessage =
        'A very long user message that exceeds fifty characters in length for the project name';
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: longMessage,
      };

      await service.generate(input);

      // Should truncate the message to 50 chars + "..."
      const expectedProjectName = longMessage.slice(0, 50) + '...';
      expect(mockCadDb.createProject).toHaveBeenCalledWith(
        'test-org',
        expectedProjectName,
        expect.any(String),
        undefined,
        'user-456',
      );
    });

    it('should create project from short prompt without truncation', async () => {
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a box',
      };

      await service.generate(input);

      expect(mockCadDb.createProject).toHaveBeenCalledWith(
        'test-org',
        'Create a box',
        expect.any(String),
        undefined,
        'user-456',
      );
    });

    it('should throw if orgSlug is missing', async () => {
      const contextWithoutOrg = createMockExecutionContext({ orgSlug: '' });
      const input: CadAgentInput = {
        context: contextWithoutOrg,
        userMessage: 'Create a box',
      };

      // These validation checks are outside the try/catch, so they throw directly
      await expect(service.generate(input)).rejects.toThrow(
        'ExecutionContext.orgSlug is required for CAD generation',
      );
    });

    it('should throw if taskId is missing', async () => {
      const contextWithoutTask = createMockExecutionContext({ taskId: '' });
      const input: CadAgentInput = {
        context: contextWithoutTask,
        userMessage: 'Create a box',
      };

      await expect(service.generate(input)).rejects.toThrow(
        'ExecutionContext.taskId is required for CAD generation',
      );
    });

    it('should throw if userId is missing', async () => {
      const contextWithoutUser = createMockExecutionContext({ userId: '' });
      const input: CadAgentInput = {
        context: contextWithoutUser,
        userMessage: 'Create a box',
      };

      await expect(service.generate(input)).rejects.toThrow(
        'ExecutionContext.userId is required for CAD generation',
      );
    });

    it('should return failed result if graph invocation fails', async () => {
      mockGraph.invoke.mockRejectedValue(new Error('Graph execution failed'));

      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
      };

      const result = await service.generate(input);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Graph execution failed');
      expect(result.taskId).toBe('task-123');
      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });

    it('should include outputs from database in result', async () => {
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
      };

      const result = await service.generate(input);

      expect(result.outputs).toBeDefined();
      expect(result.outputs?.step).toContain(
        'test-org/project-123/task-123/model.step',
      );
      expect(result.outputs?.stl).toContain(
        'test-org/project-123/task-123/model.stl',
      );
      expect(result.outputs?.gltf).toContain(
        'test-org/project-123/task-123/model.gltf',
      );
      expect(result.outputs?.dxf).toContain(
        'test-org/project-123/task-123/model.dxf',
      );
      expect(result.outputs?.thumbnail).toContain(
        'test-org/project-123/task-123/thumbnail.png',
      );
    });

    it('should return failed status when final graph state is not completed', async () => {
      mockGraph.invoke.mockResolvedValue({
        ...mockFinalState,
        status: 'failed',
        error: 'Validation failed after max attempts',
      });

      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
      };

      const result = await service.generate(input);

      expect(result.status).toBe('failed');
    });

    it('should handle outputs with null storage paths', async () => {
      const outputsWithNullPaths = [
        {
          ...mockOutputs[0]!,
          storage_path: null as unknown as string,
        },
        mockOutputs[1]!,
      ];
      mockCadDb.getDrawingOutputs.mockResolvedValue(outputsWithNullPaths);

      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
      };

      const result = await service.generate(input);

      expect(result.outputs?.step).toBeUndefined();
      expect(result.outputs?.stl).toBeDefined();
    });
  });

  // ========================================
  // getStatus
  // ========================================

  describe('getStatus', () => {
    beforeEach(async () => {
      service.onModuleInit();
    });

    it('should return status for a task with drawingId', async () => {
      const stateValues: CadAgentState = {
        ...mockFinalState,
        drawingId: 'task-123',
        messages: [],
        codeType: 'opencascade-js',
        validationErrors: [],
        codeAttempt: 1,
        constraints: {},
        outputs: {},
        startedAt: Date.now(),
      } as CadAgentState;

      mockGraph.getState.mockResolvedValue({
        values: stateValues,
      });

      const status = await service.getStatus('task-123');

      expect(status).toBeDefined();
      expect(status?.taskId).toBe('task-123');
      expect(status?.status).toBe('completed');
      expect(status?.isCodeValid).toBe(true);
      expect(status?.outputs).toBeDefined();
    });

    it('should return status without drawingId (no outputs)', async () => {
      const stateValues: Partial<CadAgentState> = {
        ...mockFinalState,
        drawingId: undefined,
      };

      mockGraph.getState.mockResolvedValue({
        values: stateValues,
      });

      const status = await service.getStatus('task-123');

      expect(status).toBeDefined();
      expect(mockCadDb.getDrawingOutputs).not.toHaveBeenCalled();
    });

    it('should return null if state has no values', async () => {
      mockGraph.getState.mockResolvedValue({
        values: null,
      });

      const status = await service.getStatus('task-123');

      expect(status).toBeNull();
    });

    it('should return null on error', async () => {
      mockGraph.getState.mockRejectedValue(new Error('Graph state error'));

      const status = await service.getStatus('task-123');

      expect(status).toBeNull();
    });
  });

  // ========================================
  // getHistory
  // ========================================

  describe('getHistory', () => {
    beforeEach(async () => {
      service.onModuleInit();
    });

    it('should return history states', async () => {
      const stateEntry = { values: mockFinalState };
      async function* mockAsyncGenerator() {
        yield stateEntry;
        yield stateEntry;
      }
      mockGraph.getStateHistory.mockReturnValue(mockAsyncGenerator());

      const history = await service.getHistory('task-123');

      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(mockFinalState);
    });

    it('should return empty array on error', async () => {
      mockGraph.getStateHistory.mockImplementation(() => {
        throw new Error('History retrieval failed');
      });

      const history = await service.getHistory('task-123');

      expect(history).toEqual([]);
    });

    it('should handle empty history', async () => {
      async function* emptyGenerator() {
        // Yields nothing
      }
      mockGraph.getStateHistory.mockReturnValue(emptyGenerator());

      const history = await service.getHistory('task-123');

      expect(history).toEqual([]);
    });
  });

  // ========================================
  // getDrawingOutputs (private method tested via generate)
  // ========================================

  describe('getDrawingOutputs (via generate)', () => {
    beforeEach(async () => {
      service.onModuleInit();
    });

    it('should convert all output formats to public URLs', async () => {
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
      };

      const result = await service.generate(input);

      // mockCadStorage.getPublicUrl should have been called for each format
      expect(mockCadStorage.getPublicUrl).toHaveBeenCalledTimes(5);
      expect(result.outputs?.step).toContain('model.step');
      expect(result.outputs?.stl).toContain('model.stl');
      expect(result.outputs?.gltf).toContain('model.gltf');
      expect(result.outputs?.dxf).toContain('model.dxf');
      expect(result.outputs?.thumbnail).toContain('thumbnail.png');
    });

    it('should handle empty outputs from database', async () => {
      mockCadDb.getDrawingOutputs.mockResolvedValue([]);

      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
      };

      const result = await service.generate(input);

      expect(result.outputs).toEqual({});
    });
  });
});
