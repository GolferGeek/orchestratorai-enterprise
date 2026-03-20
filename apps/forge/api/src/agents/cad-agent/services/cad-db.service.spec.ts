/**
 * Unit tests for CadDbService
 *
 * Tests all database operations for the CAD Agent:
 * - Project CRUD operations
 * - Drawing CRUD operations
 * - Generated code operations
 * - CAD output operations
 * - Execution log operations
 * - Helper methods
 *
 * DATABASE_SERVICE is fully mocked.
 */

import { CadDbService } from './cad-db.service';

/** Create a chainable mock query builder */
function createMockQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  const methods = [
    'insert',
    'select',
    'update',
    'delete',
    'eq',
    'neq',
    'order',
    'limit',
    'single',
    'in',
    'not',
    'is',
  ];
  for (const m of methods) {
    builder[m] = jest.fn().mockReturnThis();
  }
  builder.single = jest.fn().mockResolvedValue({ data: null, error: null });
  return builder;
}

describe('CadDbService', () => {
  let service: CadDbService;
  let mockDb: { from: jest.Mock; rpc: jest.Mock };
  let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>;

  const mockProject = {
    id: 'project-123',
    org_slug: 'test-org',
    name: 'Test Project',
    description: 'A test project',
    constraints: { units: 'mm' },
    metadata: {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    created_by: 'user-456',
  };

  const mockDrawing = {
    id: 'drawing-123',
    project_id: 'project-123',
    task_id: 'task-123',
    conversation_id: 'conv-123',
    name: 'Test Drawing',
    description: null,
    prompt: 'Create a box',
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

  const mockGeneratedCode = {
    id: 'code-123',
    drawing_id: 'drawing-123',
    code: 'function createModel(oc) { return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape(); }',
    code_type: 'opencascade-js' as const,
    llm_provider: 'anthropic',
    llm_model: 'claude-sonnet-4-5',
    prompt_tokens: 1000,
    completion_tokens: 500,
    generation_time_ms: null,
    is_valid: true,
    validation_errors: [],
    attempt_number: 1,
    created_at: '2025-01-01T00:00:00Z',
  };

  const mockCadOutput = {
    id: 'output-123',
    drawing_id: 'drawing-123',
    generated_code_id: 'code-123',
    format: 'step' as const,
    storage_path: 'test-org/project-123/drawing-123/model.step',
    file_size_bytes: 12345,
    mesh_stats: null,
    export_time_ms: null,
    created_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = createMockQueryBuilder();
    mockDb = {
      from: jest.fn(() => mockQueryBuilder),
      rpc: jest.fn(),
    };

    service = new CadDbService(mockDb as any);
  });

  // ========================================
  // CONSTRUCTOR
  // ========================================

  describe('constructor', () => {
    it('should create the service with injected DatabaseService', () => {
      expect(service).toBeDefined();
    });
  });

  // ========================================
  // PROJECT OPERATIONS
  // ========================================

  describe('createProject', () => {
    it('should create a project successfully', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockProject,
        error: null,
      });

      const result = await service.createProject(
        'test-org',
        'Test Project',
        'A test project',
        { units: 'mm' },
        'user-456',
      );

      expect(result).toEqual(mockProject);
      expect(mockDb.from).toHaveBeenCalledWith('engineering', 'projects');
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.select).toHaveBeenCalled();
      expect(mockQueryBuilder.single).toHaveBeenCalled();
    });

    it('should create a project without optional fields', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: {
          ...mockProject,
          description: null,
          constraints: {},
          created_by: null,
        },
        error: null,
      });

      const result = await service.createProject('test-org', 'Test Project');
      expect(result).toBeDefined();
    });

    it('should throw on database error', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(
        service.createProject('test-org', 'Test Project'),
      ).rejects.toThrow('Failed to create project: Database error');
    });
  });

  describe('getProject', () => {
    it('should get a project by ID', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockProject,
        error: null,
      });

      const result = await service.getProject('project-123');

      expect(result).toEqual(mockProject);
      expect(mockDb.from).toHaveBeenCalledWith('engineering', 'projects');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'project-123');
    });

    it('should return null if project not found (PGRST116)', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await service.getProject('nonexistent-id');
      expect(result).toBeNull();
    });

    it('should return null on other database errors', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'Connection error' },
      });

      const result = await service.getProject('project-123');
      expect(result).toBeNull();
    });
  });

  describe('findProjectByName', () => {
    it('should find a project by name', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockProject,
        error: null,
      });

      const result = await service.findProjectByName(
        'test-org',
        'Test Project',
      );

      expect(result).toEqual(mockProject);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('org_slug', 'test-org');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('name', 'Test Project');
    });

    it('should return null if project not found', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await service.findProjectByName('test-org', 'Nonexistent');
      expect(result).toBeNull();
    });

    it('should return null on other errors', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'Error' },
      });

      const result = await service.findProjectByName('test-org', 'Project');
      expect(result).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('should update a project', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: { ...mockProject, name: 'Updated Project' },
        error: null,
      });

      const result = await service.updateProject('project-123', {
        name: 'Updated Project',
      });

      expect(result.name).toBe('Updated Project');
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'project-123');
    });

    it('should throw on database error', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      await expect(
        service.updateProject('project-123', { name: 'New Name' }),
      ).rejects.toThrow('Failed to update project: Update failed');
    });
  });

  // ========================================
  // DRAWING OPERATIONS
  // ========================================

  describe('createDrawing', () => {
    it('should create a drawing', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockDrawing,
        error: null,
      });

      const result = await service.createDrawing({
        projectId: 'project-123',
        name: 'Test Drawing',
        prompt: 'Create a box',
        conversationId: 'conv-123',
        constraintsOverride: { units: 'mm' },
        createdBy: 'user-456',
      });

      expect(result).toEqual(mockDrawing);
      expect(mockDb.from).toHaveBeenCalledWith('engineering', 'drawings');
    });

    it('should create a drawing without optional fields', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockDrawing,
        error: null,
      });

      const result = await service.createDrawing({
        projectId: 'project-123',
        name: 'Test Drawing',
        prompt: 'Create a box',
      });

      expect(result).toBeDefined();
    });

    it('should throw on database error', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { message: 'Insert error' },
      });

      await expect(
        service.createDrawing({
          projectId: 'project-123',
          name: 'Test Drawing',
          prompt: 'Create a box',
        }),
      ).rejects.toThrow('Failed to create drawing: Insert error');
    });
  });

  describe('createDrawingWithId', () => {
    it('should create a drawing with a specific ID', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockDrawing,
        error: null,
      });

      const result = await service.createDrawingWithId({
        id: 'drawing-123',
        projectId: 'project-123',
        name: 'Test Drawing',
        prompt: 'Create a box',
        conversationId: 'conv-123',
        constraintsOverride: { units: 'mm' },
        createdBy: 'user-456',
      });

      expect(result).toEqual(mockDrawing);
    });

    it('should create with minimal params', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockDrawing,
        error: null,
      });

      const result = await service.createDrawingWithId({
        id: 'drawing-123',
        projectId: 'project-123',
        name: 'Test Drawing',
        prompt: 'Create a box',
      });

      expect(result).toBeDefined();
    });

    it('should throw on database error', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { message: 'Unique violation' },
      });

      await expect(
        service.createDrawingWithId({
          id: 'drawing-123',
          projectId: 'project-123',
          name: 'Test Drawing',
          prompt: 'Create a box',
        }),
      ).rejects.toThrow('Failed to create drawing: Unique violation');
    });
  });

  describe('getDrawing', () => {
    it('should get a drawing by ID', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockDrawing,
        error: null,
      });

      const result = await service.getDrawing('drawing-123');

      expect(result).toEqual(mockDrawing);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'drawing-123');
    });

    it('should return null if drawing not found (PGRST116)', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await service.getDrawing('nonexistent-id');
      expect(result).toBeNull();
    });

    it('should return null on other database errors', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'Connection error' },
      });

      const result = await service.getDrawing('drawing-123');
      expect(result).toBeNull();
    });
  });

  describe('updateDrawingStatus', () => {
    it('should update drawing status', async () => {
      // First call: logStep insert, second: drawings update
      mockQueryBuilder.single!.mockResolvedValue({ data: null, error: null });
      const mockBuilderForLog = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'execution_log') {
          return mockBuilderForLog;
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      await service.updateDrawingStatus('drawing-123', 'completed');
      expect(mockDb.from).toHaveBeenCalledWith('engineering', 'drawings');
    });

    it('should log error when status is failed', async () => {
      const mockLogBuilder = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };

      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'execution_log') {
          return mockLogBuilder;
        }
        return mockUpdateBuilder;
      });

      await service.updateDrawingStatus(
        'drawing-123',
        'failed',
        'Execution error',
      );

      expect(mockDb.from).toHaveBeenCalledWith('engineering', 'execution_log');
    });

    it('should throw on database error', async () => {
      mockDb.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockResolvedValue({ error: { message: 'Update failed' } }),
      });

      await expect(
        service.updateDrawingStatus('drawing-123', 'completed'),
      ).rejects.toThrow('Failed to update drawing status: Update failed');
    });
  });

  describe('completeDrawing', () => {
    it('should complete a drawing', async () => {
      mockDb.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.completeDrawing('drawing-123'),
      ).resolves.toBeUndefined();
    });
  });

  // ========================================
  // GENERATED CODE OPERATIONS
  // ========================================

  describe('saveGeneratedCode', () => {
    it('should save generated code', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockGeneratedCode,
        error: null,
      });

      const result = await service.saveGeneratedCode({
        drawingId: 'drawing-123',
        code: 'function createModel(oc) { }',
        codeType: 'opencascade-js',
        llmProvider: 'anthropic',
        llmModel: 'claude-sonnet-4-5',
        promptTokens: 1000,
        completionTokens: 500,
        generationTimeMs: 3000,
        attemptNumber: 1,
      });

      expect(result).toEqual(mockGeneratedCode);
      expect(mockDb.from).toHaveBeenCalledWith('engineering', 'generated_code');
    });

    it('should save generated code without optional fields', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockGeneratedCode,
        error: null,
      });

      const result = await service.saveGeneratedCode({
        drawingId: 'drawing-123',
        code: 'function createModel(oc) { }',
        codeType: 'opencascade-js',
        llmProvider: 'anthropic',
        llmModel: 'claude-sonnet-4-5',
      });

      expect(result).toBeDefined();
    });

    it('should throw on database error', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      });

      await expect(
        service.saveGeneratedCode({
          drawingId: 'drawing-123',
          code: 'function createModel(oc) { }',
          codeType: 'opencascade-js',
          llmProvider: 'anthropic',
          llmModel: 'claude-sonnet-4-5',
        }),
      ).rejects.toThrow('Failed to save generated code: Insert failed');
    });
  });

  describe('updateCodeValidation', () => {
    it('should update code validation status', async () => {
      mockDb.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.updateCodeValidation('code-123', true, []),
      ).resolves.toBeUndefined();
    });

    it('should update with errors', async () => {
      mockDb.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.updateCodeValidation('code-123', false, [
          'Missing oc. references',
        ]),
      ).resolves.toBeUndefined();
    });

    it('should update without errors array (uses default)', async () => {
      mockDb.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.updateCodeValidation('code-123', true),
      ).resolves.toBeUndefined();
    });

    it('should throw on database error', async () => {
      mockDb.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockResolvedValue({ error: { message: 'Update failed' } }),
      });

      await expect(
        service.updateCodeValidation('code-123', true, []),
      ).rejects.toThrow('Failed to update code validation: Update failed');
    });
  });

  describe('getLatestCode', () => {
    it('should get the latest generated code', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockGeneratedCode,
        error: null,
      });

      const result = await service.getLatestCode('drawing-123');

      expect(result).toEqual(mockGeneratedCode);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith(
        'drawing_id',
        'drawing-123',
      );
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should return null if no code found (PGRST116)', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await service.getLatestCode('drawing-123');
      expect(result).toBeNull();
    });

    it('should return null on other errors', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'DB error' },
      });

      const result = await service.getLatestCode('drawing-123');
      expect(result).toBeNull();
    });
  });

  // ========================================
  // CAD OUTPUT OPERATIONS
  // ========================================

  describe('saveCadOutput', () => {
    it('should save CAD output with provided code ID', async () => {
      mockQueryBuilder.single!.mockResolvedValue({
        data: mockCadOutput,
        error: null,
      });

      const result = await service.saveCadOutput({
        drawingId: 'drawing-123',
        generatedCodeId: 'code-123',
        format: 'step',
        storagePath: 'test-org/project-123/drawing-123/model.step',
        fileSizeBytes: 12345,
        meshStats: { vertices: 8, faces: 12 },
        exportTimeMs: 500,
      });

      expect(result).toEqual(mockCadOutput);
      expect(mockDb.from).toHaveBeenCalledWith('engineering', 'cad_outputs');
    });

    it('should fetch latest code if generatedCodeId is not provided', async () => {
      // First call returns the code, second call returns the output
      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'generated_code') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockGeneratedCode, error: null }),
          };
        }
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: mockCadOutput, error: null }),
        };
      });

      const result = await service.saveCadOutput({
        drawingId: 'drawing-123',
        format: 'step',
        storagePath: 'test-org/project-123/drawing-123/model.step',
      });

      expect(result).toEqual(mockCadOutput);
    });

    it('should save without optional fields', async () => {
      // No latest code found
      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'generated_code') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          };
        }
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: mockCadOutput, error: null }),
        };
      });

      const result = await service.saveCadOutput({
        drawingId: 'drawing-123',
        format: 'step',
        storagePath: 'path/to/file.step',
      });

      expect(result).toBeDefined();
    });

    it('should throw on database error', async () => {
      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'generated_code') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          };
        }
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Insert failed' },
          }),
        };
      });

      await expect(
        service.saveCadOutput({
          drawingId: 'drawing-123',
          format: 'step',
          storagePath: 'path/to/file.step',
        }),
      ).rejects.toThrow('Failed to save CAD output: Insert failed');
    });
  });

  describe('getDrawingOutputs', () => {
    it('should get all drawing outputs', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValue({ data: [mockCadOutput], error: null }),
      });

      const result = await service.getDrawingOutputs('drawing-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockCadOutput);
    });

    it('should return empty array on error', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      });

      const result = await service.getDrawingOutputs('drawing-123');
      expect(result).toEqual([]);
    });
  });

  // ========================================
  // EXECUTION LOG OPERATIONS
  // ========================================

  describe('logStep', () => {
    it('should log an execution step', async () => {
      mockDb.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.logStep({
          drawingId: 'drawing-123',
          stepType: 'llm_started',
          message: 'Starting LLM',
          details: { key: 'value' },
          durationMs: 100,
        }),
      ).resolves.toBeUndefined();
    });

    it('should log without optional fields', async () => {
      mockDb.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.logStep({
          drawingId: 'drawing-123',
          stepType: 'llm_started',
        }),
      ).resolves.toBeUndefined();
    });

    it('should not throw on log error (logging failures should not break workflow)', async () => {
      mockDb.from.mockReturnValue({
        insert: jest
          .fn()
          .mockResolvedValue({ error: { message: 'Insert failed' } }),
      });

      // Should not throw
      await expect(
        service.logStep({
          drawingId: 'drawing-123',
          stepType: 'error',
          message: 'Test error',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('getExecutionLog', () => {
    const mockLogEntry = {
      id: 'log-123',
      drawing_id: 'drawing-123',
      step_type: 'llm_started' as const,
      message: 'Starting LLM',
      details: {},
      duration_ms: null,
      created_at: '2025-01-01T00:00:00Z',
    };

    it('should get execution log for a drawing', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValue({ data: [mockLogEntry], error: null }),
      });

      const result = await service.getExecutionLog('drawing-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockLogEntry);
    });

    it('should return empty array on error', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      });

      const result = await service.getExecutionLog('drawing-123');
      expect(result).toEqual([]);
    });
  });

  // ========================================
  // HELPER METHODS
  // ========================================

  describe('getEffectiveConstraints', () => {
    it('should merge project and drawing constraints', async () => {
      const drawing = {
        ...mockDrawing,
        project_id: 'project-123',
        constraints_override: { material: 'aluminum' },
      };
      const project = {
        ...mockProject,
        constraints: { units: 'mm', material: 'steel' },
      };

      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'drawings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: drawing, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: project, error: null }),
        };
      });

      const result = await service.getEffectiveConstraints('drawing-123');

      // Drawing constraints should override project constraints
      expect(result.units).toBe('mm'); // from project
      expect(result.material).toBe('aluminum'); // overridden by drawing
    });

    it('should throw if drawing not found', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      await expect(
        service.getEffectiveConstraints('nonexistent-drawing'),
      ).rejects.toThrow('Drawing not found: nonexistent-drawing');
    });

    it('should handle drawing with no constraints override', async () => {
      const drawing = {
        ...mockDrawing,
        project_id: 'project-123',
        constraints_override: null,
      };
      const project = {
        ...mockProject,
        constraints: { units: 'mm' },
      };

      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'drawings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: drawing, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: project, error: null }),
        };
      });

      const result = await service.getEffectiveConstraints('drawing-123');
      expect(result.units).toBe('mm');
    });

    it('should handle project not found (null project)', async () => {
      const drawing = {
        ...mockDrawing,
        project_id: 'project-123',
        constraints_override: { material: 'plastic' },
      };

      mockDb.from.mockImplementation((_schema: string, table: string) => {
        if (table === 'drawings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: drawing, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        };
      });

      const result = await service.getEffectiveConstraints('drawing-123');
      expect(result.material).toBe('plastic');
    });
  });

  describe('getDrawingByTaskId', () => {
    it('should get a drawing by task ID', async () => {
      const mockEq = jest.fn().mockReturnThis();
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: mockEq,
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDrawing, error: null }),
      });

      const result = await service.getDrawingByTaskId('task-123');

      expect(result).toEqual(mockDrawing);
      expect(mockEq).toHaveBeenCalledWith('task_id', 'task-123');
    });

    it('should return null if not found (PGRST116)', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      const result = await service.getDrawingByTaskId('nonexistent-task');
      expect(result).toBeNull();
    });

    it('should return null on other errors', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'OTHER', message: 'DB error' },
        }),
      });

      const result = await service.getDrawingByTaskId('task-123');
      expect(result).toBeNull();
    });
  });

  describe('getDrawingByConversationId', () => {
    it('should get a drawing by conversation ID', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDrawing, error: null }),
      });

      const result = await service.getDrawingByConversationId('conv-123');

      expect(result).toEqual(mockDrawing);
    });

    it('should return null if not found (PGRST116)', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      const result =
        await service.getDrawingByConversationId('nonexistent-conv');
      expect(result).toBeNull();
    });

    it('should return null on other errors', async () => {
      mockDb.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'OTHER', message: 'Error' },
        }),
      });

      const result = await service.getDrawingByConversationId('conv-123');
      expect(result).toBeNull();
    });
  });
});
