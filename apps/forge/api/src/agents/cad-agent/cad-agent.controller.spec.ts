/**
 * Unit tests for CadAgentController
 *
 * Tests all REST API endpoints:
 * - POST /agents/engineering/cad-agent/generate
 * - GET /agents/engineering/cad-agent/status/:taskId
 * - GET /agents/engineering/cad-agent/history/:taskId
 * - GET /agents/engineering/cad-agent/outputs/:drawingId
 *
 * All dependencies are mocked.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  applyInProcessAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { CadAgentController } from './cad-agent.controller';
import { CadAgentService } from './cad-agent.service';
import { CadDbService } from './services/cad-db.service';
import { CadAgentRequestDto } from './dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import {
  CadAgentResult,
  CadAgentStatus,
  CadAgentState,
} from './cad-agent.state';

describe('CadAgentController', () => {
  let controller: CadAgentController;
  let cadAgentService: jest.Mocked<CadAgentService>;
  let cadDbService: jest.Mocked<CadDbService>;

  const mockContext = createMockExecutionContext({
    conversationId: 'conv-123',
    userId: 'user-456',
    orgSlug: 'test-org',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  });

  const mockResult: CadAgentResult = {
    taskId: 'conv-123',
    status: 'completed',
    userMessage: 'Create a simple box',
    generatedCode:
      'function createModel(oc) { return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape(); }',
    outputs: {
      step: 'https://storage.example.com/model.step',
      stl: 'https://storage.example.com/model.stl',
      gltf: 'https://storage.example.com/model.gltf',
    },
    meshStats: { vertices: 8, faces: 12 },
    duration: 3500,
  };

  const mockStatus: CadAgentStatus = {
    taskId: 'conv-123',
    status: 'completed',
    userMessage: 'Create a simple box',
    executionStatus: 'completed',
    isCodeValid: true,
    outputs: {
      step: 'https://storage.example.com/model.step',
    },
  };

  const mockHistory: CadAgentState[] = [
    {
      messages: [],
      executionContext: mockContext,
      userMessage: 'Create a simple box',
      projectId: 'project-123',
      drawingId: 'drawing-123',
      constraints: {},
      generatedCode: 'function createModel(oc) { }',
      codeType: 'opencascade-js',
      isCodeValid: true,
      validationErrors: [],
      codeAttempt: 1,
      executionStatus: 'completed',
      executionError: undefined,
      executionTimeMs: 1500,
      outputs: {},
      meshStats: undefined,
      status: 'completed',
      error: undefined,
      startedAt: Date.now() - 5000,
      completedAt: Date.now(),
    },
  ];

  const mockDrawingOutputs = [
    {
      id: 'output-1',
      drawing_id: 'drawing-123',
      generated_code_id: 'code-123',
      format: 'step' as const,
      storage_path: 'https://storage.example.com/model.step',
      file_size_bytes: 12345,
      mesh_stats: null,
      export_time_ms: null,
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'output-2',
      drawing_id: 'drawing-123',
      generated_code_id: 'code-123',
      format: 'gltf' as const,
      storage_path: 'https://storage.example.com/model.gltf',
      file_size_bytes: 5000,
      mesh_stats: {
        vertices: 24,
        faces: 12,
        boundingBox: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
      },
      export_time_ms: 500,
      created_at: '2025-01-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    resetAuthMocks();
    cadAgentService = {
      generate: jest.fn(),
      getStatus: jest.fn(),
      getHistory: jest.fn(),
      onModuleInit: jest.fn(),
    } as unknown as jest.Mocked<CadAgentService>;

    cadDbService = {
      getDrawingOutputs: jest.fn(),
    } as unknown as jest.Mocked<CadDbService>;

    const module: TestingModule = await applyAuthOverrides(
      Test.createTestingModule({
        controllers: [CadAgentController],
        providers: [
          { provide: CadAgentService, useValue: cadAgentService },
          { provide: CadDbService, useValue: cadDbService },
        ],
      }),
    ).compile();

    controller = module.get<CadAgentController>(CadAgentController);
  });

  // ========================================
  // POST /generate
  // ========================================

  describe('generate', () => {
    it('should generate a CAD model successfully', async () => {
      cadAgentService.generate.mockResolvedValue(mockResult);

      const request: CadAgentRequestDto = {
        context: mockContext,
        userMessage: 'Create a simple box',
        projectId: 'project-123',
      };

      const response = await controller.generate(request);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockResult);
      expect(cadAgentService.generate).toHaveBeenCalledWith({
        context: mockContext,
        userMessage: 'Create a simple box',
        projectId: 'project-123',
        newProjectName: undefined,
        constraints: undefined,
      });
    });

    it('should return success=false if generation status is failed', async () => {
      const failedResult: CadAgentResult = {
        ...mockResult,
        status: 'failed',
        error: 'LLM call failed',
      };
      cadAgentService.generate.mockResolvedValue(failedResult);

      const request: CadAgentRequestDto = {
        context: mockContext,
        userMessage: 'Create a box',
      };

      const response = await controller.generate(request);

      expect(response.success).toBe(false);
      expect(response.data.status).toBe('failed');
    });

    it('should throw BadRequestException if context is missing', async () => {
      const request = {
        userMessage: 'Create a box',
      } as CadAgentRequestDto;

      await expect(controller.generate(request)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.generate(request)).rejects.toThrow(
        'ExecutionContext is required',
      );
    });

    it('should pass newProjectName and constraints to service', async () => {
      cadAgentService.generate.mockResolvedValue(mockResult);

      const request: CadAgentRequestDto = {
        context: mockContext,
        userMessage: 'Create a bracket',
        newProjectName: 'My New Project',
        constraints: { units: 'mm', material: 'steel' },
      };

      await controller.generate(request);

      expect(cadAgentService.generate).toHaveBeenCalledWith({
        context: mockContext,
        userMessage: 'Create a bracket',
        projectId: undefined,
        newProjectName: 'My New Project',
        constraints: { units: 'mm', material: 'steel' },
      });
    });

    it('should throw BadRequestException when service throws an error', async () => {
      cadAgentService.generate.mockRejectedValue(
        new Error('ExecutionContext.taskId is required'),
      );

      const request: CadAgentRequestDto = {
        context: mockContext,
        userMessage: 'Create a box',
      };

      await expect(controller.generate(request)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.generate(request)).rejects.toThrow(
        'ExecutionContext.taskId is required',
      );
    });

    it('should throw BadRequestException with generic message when non-Error is thrown', async () => {
      cadAgentService.generate.mockRejectedValue('Some string error');

      const request: CadAgentRequestDto = {
        context: mockContext,
        userMessage: 'Create a box',
      };

      await expect(controller.generate(request)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ========================================
  // GET /status/:taskId
  // ========================================

  describe('getStatus', () => {
    it('should return CAD generation status', async () => {
      cadAgentService.getStatus.mockResolvedValue(mockStatus);

      const response = await controller.getStatus('task-123');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockStatus);
      expect(cadAgentService.getStatus).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException if status is null', async () => {
      cadAgentService.getStatus.mockResolvedValue(null);

      await expect(controller.getStatus('nonexistent-task')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getStatus('nonexistent-task')).rejects.toThrow(
        'CAD generation not found: nonexistent-task',
      );
    });

    it('should propagate service errors as-is (service handles internally)', async () => {
      cadAgentService.getStatus.mockResolvedValue(null);

      await expect(controller.getStatus('bad-task')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ========================================
  // GET /history/:taskId
  // ========================================

  describe('getHistory', () => {
    it('should return task history', async () => {
      cadAgentService.getHistory.mockResolvedValue(mockHistory);

      const response = await controller.getHistory('task-123');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockHistory);
      expect(response.count).toBe(1);
      expect(cadAgentService.getHistory).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException if history is empty', async () => {
      cadAgentService.getHistory.mockResolvedValue([]);

      await expect(controller.getHistory('nonexistent-task')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getHistory('nonexistent-task')).rejects.toThrow(
        'CAD generation not found: nonexistent-task',
      );
    });

    it('should return correct count in response', async () => {
      const multiHistory = [...mockHistory, ...mockHistory];
      cadAgentService.getHistory.mockResolvedValue(multiHistory);

      const response = await controller.getHistory('task-123');

      expect(response.count).toBe(2);
    });
  });

  // ========================================
  // GET /outputs/:drawingId
  // ========================================

  describe('getOutputs', () => {
    it('should return all outputs for a drawing', async () => {
      cadDbService.getDrawingOutputs.mockResolvedValue(mockDrawingOutputs);

      const response = await controller.getOutputs('drawing-123');

      expect(response.success).toBe(true);
      expect(response.data.outputs.step).toBe(
        'https://storage.example.com/model.step',
      );
      expect(response.data.outputs.gltf).toBe(
        'https://storage.example.com/model.gltf',
      );
    });

    it('should extract mesh stats from gltf output', async () => {
      cadDbService.getDrawingOutputs.mockResolvedValue(mockDrawingOutputs);

      const response = await controller.getOutputs('drawing-123');

      expect(response.data.meshStats).toBeDefined();
      expect(response.data.meshStats!.vertices).toBe(24);
      expect(response.data.meshStats!.faces).toBe(12);
      expect(response.data.meshStats!.boundingBox).toBeDefined();
    });

    it('should throw NotFoundException if no outputs found', async () => {
      cadDbService.getDrawingOutputs.mockResolvedValue([]);

      await expect(
        controller.getOutputs('nonexistent-drawing'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getOutputs('nonexistent-drawing'),
      ).rejects.toThrow('No outputs found for drawing: nonexistent-drawing');
    });

    it('should throw BadRequestException when service throws an error', async () => {
      cadDbService.getDrawingOutputs.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(controller.getOutputs('drawing-123')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getOutputs('drawing-123')).rejects.toThrow(
        'Database error',
      );
    });

    it('should re-throw NotFoundException from inner logic', async () => {
      cadDbService.getDrawingOutputs.mockResolvedValue([]);

      await expect(controller.getOutputs('drawing-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle all output formats', async () => {
      const allFormatOutputs = [
        {
          id: '1',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'step' as const,
          storage_path: 'https://storage.example.com/model.step',
          file_size_bytes: null,
          mesh_stats: null,
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'stl' as const,
          storage_path: 'https://storage.example.com/model.stl',
          file_size_bytes: null,
          mesh_stats: null,
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '3',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'gltf' as const,
          storage_path: 'https://storage.example.com/model.gltf',
          file_size_bytes: null,
          mesh_stats: null, // No mesh stats
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '4',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'dxf' as const,
          storage_path: 'https://storage.example.com/model.dxf',
          file_size_bytes: null,
          mesh_stats: null,
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '5',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'thumbnail' as const,
          storage_path: 'https://storage.example.com/thumbnail.png',
          file_size_bytes: null,
          mesh_stats: null,
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      cadDbService.getDrawingOutputs.mockResolvedValue(allFormatOutputs);

      const response = await controller.getOutputs('drawing-123');

      expect(response.data.outputs.step).toBe(
        'https://storage.example.com/model.step',
      );
      expect(response.data.outputs.stl).toBe(
        'https://storage.example.com/model.stl',
      );
      expect(response.data.outputs.gltf).toBe(
        'https://storage.example.com/model.gltf',
      );
      expect(response.data.outputs.dxf).toBe(
        'https://storage.example.com/model.dxf',
      );
      expect(response.data.outputs.thumbnail).toBe(
        'https://storage.example.com/thumbnail.png',
      );
    });

    it('should skip outputs with null storage_path', async () => {
      const outputsWithNullPath = [
        {
          id: '1',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'step' as const,
          storage_path: null as unknown as string, // null path
          file_size_bytes: null,
          mesh_stats: null,
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'stl' as const,
          storage_path: 'https://storage.example.com/model.stl',
          file_size_bytes: null,
          mesh_stats: null,
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      cadDbService.getDrawingOutputs.mockResolvedValue(outputsWithNullPath);

      const response = await controller.getOutputs('drawing-123');

      expect(response.data.outputs.step).toBeUndefined();
      expect(response.data.outputs.stl).toBe(
        'https://storage.example.com/model.stl',
      );
    });

    it('should throw BadRequestException with generic message for non-Error exceptions', async () => {
      cadDbService.getDrawingOutputs.mockRejectedValue('string error');

      await expect(controller.getOutputs('drawing-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle gltf with mesh_stats missing vertices or faces', async () => {
      const outputWithPartialStats = [
        {
          id: '1',
          drawing_id: 'drawing-123',
          generated_code_id: null,
          format: 'gltf' as const,
          storage_path: 'https://storage.example.com/model.gltf',
          file_size_bytes: null,
          mesh_stats: { someOtherField: 'value' }, // No vertices/faces
          export_time_ms: null,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      cadDbService.getDrawingOutputs.mockResolvedValue(outputWithPartialStats);

      const response = await controller.getOutputs('drawing-123');

      // meshStats should be undefined since vertices/faces not present
      expect(response.data.meshStats).toBeUndefined();
    });
  });
});
