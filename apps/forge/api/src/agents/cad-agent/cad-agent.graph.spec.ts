/**
 * Unit tests for CadAgentGraph (cad-agent.graph.ts)
 *
 * Tests the LangGraph workflow nodes and edges:
 * - startNode
 * - applyConstraintsNode
 * - generateCodeNode
 * - validateCodeNode
 * - executeCadNode
 * - exportFilesNode
 * - handleErrorNode
 * - Helper functions: buildConstraintPrompt, extractCodeFromResponse, validateOpenCascadeCode
 *
 * Uses MemorySaver for checkpointing (no DB required).
 * All external services are mocked.
 */
import { MemorySaver } from '@langchain/langgraph';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { createCadAgentGraph, CadAgentGraph } from './cad-agent.graph';
import { CadAgentState } from './cad-agent.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { CadDbService } from './services/cad-db.service';
import { CadStorageService } from './services/cad-storage.service';
import { OpenCascadeExecutorService } from './services/opencascade-executor.service';

/**
 * Typed invoke helper — CompiledStateGraph<any,any,any>.invoke() returns unknown,
 * so we cast the result to the known state type.
 */
async function invokeGraph(
  graph: CadAgentGraph,
  state: Partial<CadAgentState>,
  config: { configurable: { thread_id: string } },
): Promise<CadAgentState> {
  return graph.invoke(state, config) as Promise<CadAgentState>;
}

describe('CadAgentGraph', () => {
  let graph: CadAgentGraph;
  let mockLlmClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  let mockCadDb: jest.Mocked<CadDbService>;
  let mockCadStorage: jest.Mocked<CadStorageService>;
  let mockOcctExecutor: jest.Mocked<OpenCascadeExecutorService>;
  let memorySaver: MemorySaver;

  const mockContext = createMockExecutionContext({
    taskId: 'task-123',
    userId: 'user-456',
    orgSlug: 'test-org',
    conversationId: 'conv-123',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  });

  const validCode = `function createModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}`;

  const mockStorageResult = {
    storagePath: 'test-org/project-123/task-123/model.step',
    publicUrl: 'https://storage.example.com/model.step',
    sizeBytes: 12345,
    mimeType: 'application/step',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    memorySaver = new MemorySaver();

    mockLlmClient = {
      callLLM: jest.fn().mockResolvedValue({
        text: '```javascript\n' + validCode + '\n```',
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
          cost: 0.01,
        },
      }),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    mockObservability = {
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;

    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as unknown as jest.Mocked<PostgresCheckpointerService>;

    mockCadDb = {
      getEffectiveConstraints: jest.fn().mockResolvedValue({ units: 'mm' }),
      logStep: jest.fn().mockResolvedValue(undefined),
      saveGeneratedCode: jest.fn().mockResolvedValue({ id: 'code-123' }),
      getLatestCode: jest.fn().mockResolvedValue({ id: 'code-123' }),
      updateCodeValidation: jest.fn().mockResolvedValue(undefined),
      getDrawing: jest.fn().mockResolvedValue({
        id: 'task-123',
        project_id: 'project-123',
        status: 'pending',
      }),
      saveCadOutput: jest.fn().mockResolvedValue({ id: 'output-123' }),
      completeDrawing: jest.fn().mockResolvedValue(undefined),
      updateDrawingStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CadDbService>;

    mockCadStorage = {
      storeFile: jest.fn().mockResolvedValue(mockStorageResult),
      getPublicUrl: jest
        .fn()
        .mockReturnValue('https://storage.example.com/path'),
    } as unknown as jest.Mocked<CadStorageService>;

    mockOcctExecutor = {
      executeCode: jest.fn().mockResolvedValue({
        success: true,
        stepContent: 'STEP content',
        stlContent: 'STL content',
        gltfContent: Buffer.from('GLTF content'),
        dxfContent: 'DXF content',
        thumbnailContent: Buffer.from('SVG thumbnail'),
        meshStats: {
          vertices: 8,
          faces: 12,
          boundingBox: {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 10, y: 10, z: 10 },
          },
        },
        executionTimeMs: 500,
      }),
    } as unknown as jest.Mocked<OpenCascadeExecutorService>;

    graph = await createCadAgentGraph(
      mockLlmClient,
      mockObservability,
      mockCheckpointer,
      mockCadDb,
      mockCadStorage,
      mockOcctExecutor,
    );
  });

  // ========================================
  // HAPPY PATH: Complete successful workflow
  // ========================================

  describe('complete happy path', () => {
    it('should complete the full CAD generation workflow', async () => {
      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a simple box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-thread-1' },
      });

      expect(finalState.status).toBe('completed');
      expect(finalState.generatedCode).toBeDefined();
      expect(finalState.isCodeValid).toBe(true);
      expect(finalState.executionStatus).toBe('completed');
      expect(finalState.outputs).toBeDefined();

      // Verify observability calls
      expect(mockObservability.emitStarted).toHaveBeenCalled();
      expect(mockObservability.emitProgress).toHaveBeenCalled();
      expect(mockObservability.emitCompleted).toHaveBeenCalled();

      // Verify DB interactions
      expect(mockCadDb.logStep).toHaveBeenCalled();
      expect(mockCadDb.saveGeneratedCode).toHaveBeenCalled();
      expect(mockCadDb.completeDrawing).toHaveBeenCalledWith('task-123');
    }, 30000);

    it('should generate code and populate all output URLs', async () => {
      mockCadStorage.storeFile.mockImplementation(
        (data, ctx, projectId, drawingId, format) => {
          return Promise.resolve({
            storagePath: `test-org/${projectId}/${drawingId}/model.${format}`,
            publicUrl: `https://storage.example.com/model.${format}`,
            sizeBytes: data.length,
            mimeType: `application/${format}`,
          });
        },
      );

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a sphere',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: { units: 'mm' },
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-thread-2' },
      });

      expect(finalState.status).toBe('completed');
      expect(finalState.outputs.step).toBeDefined();
      expect(finalState.outputs.stl).toBeDefined();
      expect(finalState.outputs.gltf).toBeDefined();
      expect(finalState.outputs.dxf).toBeDefined();
      expect(finalState.outputs.thumbnail).toBeDefined();
    }, 30000);
  });

  // ========================================
  // CONSTRAINT HANDLING
  // ========================================

  describe('constraint handling', () => {
    it('should apply constraints from database when drawingId is provided', async () => {
      mockCadDb.getEffectiveConstraints.mockResolvedValue({
        units: 'inches',
        material: 'aluminum',
        manufacturing_method: 'cnc',
        tolerance_class: 'A',
        wall_thickness_min: 2.0,
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a bracket',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      await graph.invoke(initialState, {
        configurable: { thread_id: 'test-constraint-1' },
      });

      expect(mockCadDb.getEffectiveConstraints).toHaveBeenCalledWith(
        'task-123',
      );
      // The constraint prompt should be embedded in the userMessage
      expect(mockLlmClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('inches'),
        }),
      );
    }, 30000);

    it('should use state constraints when drawingId is not provided', async () => {
      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a cylinder',
        projectId: 'project-123',
        // No drawingId
        constraints: { units: 'mm', material: 'steel' },
        status: 'pending',
        startedAt: Date.now(),
      };

      await graph.invoke(initialState, {
        configurable: { thread_id: 'test-constraint-2' },
      });

      expect(mockCadDb.getEffectiveConstraints).not.toHaveBeenCalled();
    }, 30000);

    it('should handle constraint application failure (route to error)', async () => {
      mockCadDb.getEffectiveConstraints.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-constraint-err-1' },
      });

      expect(finalState.status).toBe('failed');
      expect(finalState.error).toContain('Failed to apply constraints');
    }, 30000);
  });

  // ========================================
  // CODE GENERATION
  // ========================================

  describe('code generation', () => {
    it('should extract code from markdown code blocks', async () => {
      const codeInMarkdown = `Here's the code:
\`\`\`javascript
function createModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
\`\`\`
That should work!`;

      mockLlmClient.callLLM.mockResolvedValue({
        text: codeInMarkdown,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-codegen-1' },
      });

      expect(finalState.generatedCode).not.toContain('```');
    }, 30000);

    it('should handle LLM failure (route to error)', async () => {
      mockLlmClient.callLLM.mockRejectedValue(new Error('LLM API unavailable'));

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-codegen-err-1' },
      });

      expect(finalState.status).toBe('failed');
      expect(finalState.error).toContain('Failed to generate code');
    }, 30000);

    it('should retry code generation when validation fails', async () => {
      let llmCallCount = 0;

      // First call returns invalid code, second returns valid code
      mockLlmClient.callLLM.mockImplementation(() => {
        llmCallCount++;
        if (llmCallCount === 1) {
          // Invalid code missing oc. references
          return Promise.resolve({
            text: 'const x = 42; // No OC references',
            usage: {
              promptTokens: 100,
              completionTokens: 50,
              totalTokens: 150,
            },
          });
        }
        // Valid code on retry
        return Promise.resolve({
          text: '```javascript\n' + validCode + '\n```',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        });
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-retry-1' },
      });

      // With retry, should eventually pass or fail after MAX_GENERATION_ATTEMPTS
      expect(finalState).toBeDefined();
      expect(llmCallCount).toBeGreaterThan(1);
    }, 30000);

    it('should fail after MAX_GENERATION_ATTEMPTS (3) with invalid code', async () => {
      // Always return invalid code
      mockLlmClient.callLLM.mockResolvedValue({
        text: 'const x = 42; // No OC references',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-maxattempts-1' },
      });

      expect(finalState.status).toBe('failed');
      expect(finalState.codeAttempt).toBe(3); // MAX_GENERATION_ATTEMPTS
    }, 30000);
  });

  // ========================================
  // CODE VALIDATION
  // ========================================

  describe('code validation', () => {
    it('should pass validation for correct OpenCASCADE.js code', async () => {
      // LLM returns valid code
      mockLlmClient.callLLM.mockResolvedValue({
        text: '```javascript\n' + validCode + '\n```',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-validation-1' },
      });

      expect(finalState.isCodeValid).toBe(true);
      expect(finalState.validationErrors).toEqual([]);
    }, 30000);

    it('should detect INVALID_CLASS usage during validation', async () => {
      // Code using invalid class that doesn't exist in WASM
      const invalidCode = `function createModel(oc) {
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  return explorer;
}`;

      mockLlmClient.callLLM.mockResolvedValueOnce({
        text: invalidCode,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      // Eventually fail validation and route to error after max attempts
      mockLlmClient.callLLM.mockResolvedValue({
        text: invalidCode,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-validation-invalid-class' },
      });

      // Should fail after max attempts since validation always fails
      expect(finalState.status).toBe('failed');
    }, 30000);

    it('should detect mismatched braces', async () => {
      const badCode = `function createModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
// Missing closing brace`;

      mockLlmClient.callLLM.mockResolvedValue({
        text: badCode,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-validation-braces' },
      });

      // Should eventually fail after max attempts
      expect(finalState.status).toBe('failed');
    }, 30000);
  });

  // ========================================
  // CAD EXECUTION
  // ========================================

  describe('CAD execution', () => {
    it('should execute code using OpenCASCADE executor', async () => {
      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      await graph.invoke(initialState, {
        configurable: { thread_id: 'test-exec-1' },
      });

      expect(mockOcctExecutor.executeCode).toHaveBeenCalledWith(
        expect.stringContaining('createModel'),
      );
    }, 30000);

    it('should handle CAD execution failure', async () => {
      mockOcctExecutor.executeCode.mockResolvedValue({
        success: false,
        error: 'WASM exception: invalid geometry',
        executionTimeMs: 200,
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-exec-fail-1' },
      });

      expect(finalState.status).toBe('failed');
      expect(finalState.error).toContain('CAD execution failed');
    }, 30000);

    it('should use placeholder geometry when execution returns success=false', async () => {
      mockOcctExecutor.executeCode.mockResolvedValue({
        success: false,
        error: 'Execution failed',
        executionTimeMs: 100,
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-exec-fail-2' },
      });

      expect(finalState.status).toBe('failed');
    }, 30000);
  });

  // ========================================
  // FILE EXPORT
  // ========================================

  describe('file export', () => {
    it('should export files to storage with real execution result', async () => {
      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-export-1' },
      });

      expect(mockCadStorage.storeFile).toHaveBeenCalled();
      expect(mockCadDb.saveCadOutput).toHaveBeenCalled();
      expect(finalState.status).toBe('completed');
    }, 30000);

    it('should handle missing projectId by fetching from DB', async () => {
      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        // No projectId - should be fetched from DB
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-export-noprojectid' },
      });

      expect(mockCadDb.getDrawing).toHaveBeenCalledWith('task-123');
      // Drawing returns project_id: "project-123"
      expect(finalState.status).toBe('completed');
    }, 30000);

    it('should fail export when both projectId and drawingId are missing', async () => {
      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        // No projectId and no drawingId
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-export-nomissing' },
      });

      expect(finalState.status).toBe('failed');
    }, 30000);

    it('should use placeholder geometry when OCCT result is missing content', async () => {
      mockOcctExecutor.executeCode.mockResolvedValue({
        success: true,
        // Missing stepContent, stlContent, gltfContent - will use placeholder
        executionTimeMs: 100,
        meshStats: {
          vertices: 8,
          faces: 6,
          boundingBox: {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 10, y: 10, z: 10 },
          },
        },
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-placeholder-1' },
      });

      // Should use placeholder and still complete
      expect(finalState.status).toBe('completed');
      expect(mockCadStorage.storeFile).toHaveBeenCalled();
    }, 30000);

    it('should skip empty thumbnail if thumbnailContent is empty buffer', async () => {
      mockOcctExecutor.executeCode.mockResolvedValue({
        success: true,
        stepContent: 'STEP content',
        stlContent: 'STL content',
        gltfContent: Buffer.from('GLTF content'),
        dxfContent: 'DXF content',
        thumbnailContent: Buffer.alloc(0), // Empty buffer - should be skipped
        meshStats: {
          vertices: 8,
          faces: 12,
          boundingBox: {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 10, y: 10, z: 10 },
          },
        },
        executionTimeMs: 500,
      });

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      await graph.invoke(initialState, {
        configurable: { thread_id: 'test-empty-thumbnail' },
      });

      // storeFile should be called for step, stl, gltf, dxf but NOT thumbnail (empty)
      const storeFileCalls = (mockCadStorage.storeFile as jest.Mock).mock.calls;
      const thumbnailCalls = storeFileCalls.filter(
        (call) => call[4] === 'thumbnail',
      );
      expect(thumbnailCalls).toHaveLength(0);
    }, 30000);
  });

  // ========================================
  // ERROR HANDLING NODE
  // ========================================

  describe('error handling', () => {
    it('should emit failed event and update drawing status on error', async () => {
      mockLlmClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-error-1' },
      });

      expect(finalState.status).toBe('failed');
      expect(mockObservability.emitFailed).toHaveBeenCalled();
      expect(mockObservability.emitProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'Workflow failed',
        expect.objectContaining({ type: 'failed' }),
      );
    }, 30000);

    it('should update drawing status to failed when drawingId is available', async () => {
      mockLlmClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        drawingId: 'task-123',
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-error-2' },
      });

      expect(finalState.status).toBe('failed');
      expect(mockCadDb.updateDrawingStatus).toHaveBeenCalledWith(
        'task-123',
        'failed',
        expect.any(String),
      );
    }, 30000);

    it('should handle error without drawingId', async () => {
      mockLlmClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a box',
        projectId: 'project-123',
        // No drawingId
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      const finalState = await invokeGraph(graph, initialState, {
        configurable: { thread_id: 'test-error-nodrawing' },
      });

      expect(finalState.status).toBe('failed');
      expect(mockCadDb.updateDrawingStatus).not.toHaveBeenCalled();
    }, 30000);
  });

  // ========================================
  // GRAPH COMPILATION
  // ========================================

  describe('graph compilation', () => {
    it('should create a compilable graph', () => {
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
      expect(typeof graph.getState).toBe('function');
      expect(typeof graph.getStateHistory).toBe('function');
    });

    it('should use the checkpointer from PostgresCheckpointerService', () => {
      expect(mockCheckpointer.getSaver).toHaveBeenCalled();
    });
  });

  // ========================================
  // WITHOUT drawingId (affects DB calls)
  // ========================================

  describe('workflow without drawingId', () => {
    it('should skip DB logging when no drawingId', async () => {
      const initialState: Partial<CadAgentState> = {
        executionContext: mockContext,
        userMessage: 'Create a sphere',
        projectId: 'project-123',
        // No drawingId
        constraints: {},
        status: 'pending',
        startedAt: Date.now(),
      };

      await graph.invoke(initialState, {
        configurable: { thread_id: 'test-nodrawing-1' },
      });

      // logStep should NOT have been called for drawing-specific steps
      const logStepCalls = (mockCadDb.logStep as jest.Mock).mock.calls;
      expect(logStepCalls.length).toBe(0);
    }, 30000);
  });
});
