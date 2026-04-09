import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  applyInProcessAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { MarketingSwarmController } from './marketing-swarm.controller';
import { MarketingSwarmService } from './marketing-swarm.service';
import { MarketingSwarmRequestDto } from './dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { MarketingSwarmResult, TaskStatus } from './marketing-swarm.service';
import {
  OutputRow,
  EvaluationRow,
  Deliverable,
  VersionedDeliverable,
  OutputVersionRow,
} from './marketing-db.service';

/**
 * Unit tests for MarketingSwarmController
 *
 * Tests all REST API endpoints for the Marketing Swarm agent:
 * - POST /marketing-swarm/execute - Execute swarm for an existing task
 * - GET /marketing-swarm/status/:taskId - Get execution status
 * - GET /marketing-swarm/state/:taskId - Get full execution state
 * - GET /marketing-swarm/deliverable/:taskId - Get deliverable structure
 * - GET /marketing-swarm/versioned-deliverable/:taskId - Get versioned deliverable
 * - DELETE /marketing-swarm/:taskId - Delete task and all data
 * - GET /marketing-swarm/output/:outputId/versions - Get version history
 * - GET /marketing-swarm/output/:outputId - Get specific output
 * - GET /marketing-swarm/by-conversation/:conversationId - Get task by conversation
 */
describe('MarketingSwarmController', () => {
  let controller: MarketingSwarmController;
  let service: jest.Mocked<MarketingSwarmService>;

  const mockContext = createMockExecutionContext({
    conversationId: 'conv-123',
    userId: 'user-456',
    orgSlug: 'test-org',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  });

  // Mock data fixtures
  const mockOutputRow: OutputRow = {
    id: 'output-1',
    task_id: 'task-123',
    writer_agent_slug: 'writer-1',
    writer_llm_provider: 'anthropic',
    writer_llm_model: 'claude-sonnet-4-20250514',
    editor_agent_slug: 'editor-1',
    editor_llm_provider: 'anthropic',
    editor_llm_model: 'claude-sonnet-4-20250514',
    content: 'Sample marketing content',
    status: 'completed',
    edit_cycle: 1,
    editor_feedback: null,
    initial_avg_score: 8.0,
    initial_rank: 2,
    is_finalist: true,
    final_total_score: 9.5,
    final_rank: 1,
    llm_metadata: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T01:00:00Z',
  };

  const mockEvaluationRow: EvaluationRow = {
    id: 'eval-1',
    task_id: 'task-123',
    output_id: 'output-1',
    evaluator_agent_slug: 'evaluator-1',
    evaluator_llm_provider: 'anthropic',
    evaluator_llm_model: 'claude-sonnet-4-20250514',
    stage: 'final',
    status: 'completed',
    score: 8.5,
    rank: 1,
    weighted_score: 8.5,
    reasoning: 'Excellent content',
    llm_metadata: null,
    created_at: '2025-01-01T00:30:00Z',
  };

  const _mockOutputVersionRow: OutputVersionRow = {
    id: 'version-1',
    output_id: 'output-1',
    task_id: 'task-123',
    version_number: 1,
    content: 'Initial version',
    action_type: 'write',
    editor_feedback: null,
    llm_metadata: { model: 'claude-sonnet-4-20250514' },
    created_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    resetAuthMocks();
    const module: TestingModule = await applyAuthOverrides(
      Test.createTestingModule({
        controllers: [MarketingSwarmController],
        providers: [
          {
            provide: MarketingSwarmService,
            useValue: {
              execute: jest.fn(),
              getStatus: jest.fn(),
              getFullState: jest.fn(),
              getDeliverable: jest.fn(),
              getVersionedDeliverable: jest.fn(),
              deleteTask: jest.fn(),
              getOutputVersions: jest.fn(),
              getOutputById: jest.fn(),
              getTaskByConversationId: jest.fn(),
            },
          },
        ],
      }),
    ).compile();

    controller = module.get<MarketingSwarmController>(MarketingSwarmController);
    service = module.get(MarketingSwarmService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /marketing-swarm/execute', () => {
    const validRequest: MarketingSwarmRequestDto = {
      context: mockContext,
    };

    it('should execute swarm and return versioned deliverable on success', async () => {
      const mockVersionedDeliverable: VersionedDeliverable = {
        type: 'versioned',
        taskId: 'conv-123',
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI trends' },
        totalCandidates: 5,
        versions: [
          {
            version: 1,
            rank: 1,
            content: 'Best content',
            writerAgent: 'writer-1',
            editorAgent: 'editor-1',
            score: 9.5,
            metadata: {
              outputId: 'output-1',
              editCycles: 1,
              initialScore: 8.0,
              finalScore: 9.5,
              writerLlmProvider: 'anthropic',
              writerLlmModel: 'claude-sonnet-4-20250514',
              editorLlmProvider: 'anthropic',
              editorLlmModel: 'claude-sonnet-4-20250514',
            },
          },
        ],
        winner: {
          version: 1,
          rank: 1,
          content: 'Best content',
          writerAgent: 'writer-1',
          editorAgent: 'editor-1',
          score: 9.5,
          metadata: {
            outputId: 'output-1',
            editCycles: 1,
            initialScore: 8.0,
            finalScore: 9.5,
            writerLlmProvider: 'anthropic',
            writerLlmModel: 'claude-sonnet-4-20250514',
            editorLlmProvider: 'anthropic',
            editorLlmModel: 'claude-sonnet-4-20250514',
          },
        },
        generatedAt: '2025-01-01T00:00:00Z',
      };

      const mockResult: MarketingSwarmResult = {
        taskId: 'conv-123',
        status: 'completed',
        outputs: [mockOutputRow],
        evaluations: [mockEvaluationRow],
        winner: mockOutputRow,
        versionedDeliverable: mockVersionedDeliverable,
        duration: 5000,
      };

      service.execute.mockResolvedValue(mockResult);

      const result = await controller.execute(validRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockVersionedDeliverable);
      expect(service.execute).toHaveBeenCalledWith({
        context: mockContext,
        taskId: 'conv-123',
      });
    });

    it('should return raw result if no versioned deliverable available', async () => {
      const mockResult: MarketingSwarmResult = {
        taskId: 'conv-123',
        status: 'completed',
        outputs: [mockOutputRow],
        evaluations: [mockEvaluationRow],
        winner: mockOutputRow,
        duration: 5000,
      };

      service.execute.mockResolvedValue(mockResult);

      const result = await controller.execute(validRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
    });

    it('should return success=false for failed status', async () => {
      const mockResult: MarketingSwarmResult = {
        taskId: 'conv-123',
        status: 'failed',
        outputs: [],
        evaluations: [],
        error: 'Execution failed: LLM API error',
        duration: 2000,
      };

      service.execute.mockResolvedValue(mockResult);

      const result = await controller.execute(validRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Execution failed: LLM API error');
    });

    it('should throw BadRequestException when context is missing', async () => {
      const invalidRequest = {} as MarketingSwarmRequestDto;

      await expect(controller.execute(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.execute(invalidRequest)).rejects.toThrow(
        'ExecutionContext is required',
      );
    });

    it('should throw BadRequestException when conversationId is missing in context', async () => {
      const contextWithoutTaskId = createMockExecutionContext({
        userId: 'user-456',
        orgSlug: 'test-org',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });
      // Explicitly remove conversationId
      delete (contextWithoutTaskId as any).conversationId;

      const invalidRequest: MarketingSwarmRequestDto = {
        context: contextWithoutTaskId,
      };

      await expect(controller.execute(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.execute(invalidRequest)).rejects.toThrow(
        'conversationId is required in context',
      );
    });

    it('should throw BadRequestException on service error', async () => {
      service.execute.mockRejectedValue(new Error('Task not found'));

      await expect(controller.execute(validRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.execute(validRequest)).rejects.toThrow(
        'Task not found',
      );
    });

    it('should handle service errors with generic message', async () => {
      service.execute.mockRejectedValue('Unknown error');

      await expect(controller.execute(validRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.execute(validRequest)).rejects.toThrow(
        'Swarm execution failed',
      );
    });
  });

  describe('GET /marketing-swarm/status/:taskId', () => {
    it('should return status for existing task', async () => {
      const mockStatus: TaskStatus = {
        taskId: 'conv-123',
        status: 'processing',
        phase: 'writing',
        progress: {
          total: 10,
          completed: 5,
          percentage: 50,
        },
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStatus);
      expect(service.getStatus).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException for non-existent task', async () => {
      service.getStatus.mockResolvedValue(null);

      await expect(controller.getStatus('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getStatus('non-existent')).rejects.toThrow(
        'Swarm task not found: non-existent',
      );
    });

    it('should return completed status with progress', async () => {
      const mockStatus: TaskStatus = {
        taskId: 'conv-123',
        status: 'completed',
        phase: 'evaluation',
        progress: {
          total: 10,
          completed: 10,
          percentage: 100,
        },
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.data.status).toBe('completed');
      expect(result.data.progress.percentage).toBe(100);
    });

    it('should return failed status with error', async () => {
      const mockStatus: TaskStatus = {
        taskId: 'conv-123',
        status: 'failed',
        phase: 'writing',
        progress: {
          total: 10,
          completed: 3,
          percentage: 30,
        },
        error: 'Writer agent failed',
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBe('Writer agent failed');
    });
  });

  describe('GET /marketing-swarm/state/:taskId', () => {
    it('should return full state for existing task', async () => {
      const mockState = {
        outputs: [mockOutputRow],
        evaluations: [mockEvaluationRow],
      };

      service.getFullState.mockResolvedValue(mockState);

      const result = await controller.getState('task-123');

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBe('task-123');
      expect(result.data.outputs).toEqual([mockOutputRow]);
      expect(result.data.evaluations).toEqual([mockEvaluationRow]);
      expect(service.getFullState).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException for non-existent task', async () => {
      service.getFullState.mockResolvedValue(null);

      await expect(controller.getState('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getState('non-existent')).rejects.toThrow(
        'Swarm task not found: non-existent',
      );
    });

    it('should return empty arrays for task with no outputs/evaluations', async () => {
      const mockState = {
        outputs: [],
        evaluations: [],
      };

      service.getFullState.mockResolvedValue(mockState);

      const result = await controller.getState('task-123');

      expect(result.data.outputs).toEqual([]);
      expect(result.data.evaluations).toEqual([]);
    });
  });

  describe('GET /marketing-swarm/deliverable/:taskId', () => {
    it('should return deliverable for completed task', async () => {
      const mockDeliverable: Deliverable = {
        taskId: 'conv-123',
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI trends' },
        totalOutputs: 5,
        deliveredCount: 3,
        rankedOutputs: [
          {
            rank: 1,
            outputId: 'output-1',
            writerAgentSlug: 'writer-1',
            editorAgentSlug: 'editor-1',
            finalContent: 'Best content',
            initialScore: 8.0,
            finalScore: 9.5,
            editHistory: [
              {
                version: 1,
                content: 'Initial content',
                actionType: 'write',
                editorFeedback: null,
                createdAt: '2025-01-01T00:00:00Z',
              },
            ],
            evaluations: [
              {
                stage: 'final',
                evaluatorSlug: 'evaluator-1',
                score: 9.5,
                rank: 1,
                reasoning: 'Excellent',
              },
            ],
          },
        ],
        generatedAt: '2025-01-01T00:00:00Z',
      };

      service.getDeliverable.mockResolvedValue(mockDeliverable);

      const result = await controller.getDeliverable('task-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockDeliverable);
      expect(service.getDeliverable).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException for non-existent deliverable', async () => {
      service.getDeliverable.mockResolvedValue(null);

      await expect(controller.getDeliverable('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getDeliverable('non-existent')).rejects.toThrow(
        'Deliverable not found for task: non-existent',
      );
    });
  });

  describe('GET /marketing-swarm/versioned-deliverable/:taskId', () => {
    it('should return versioned deliverable for completed task', async () => {
      const mockVersionedDeliverable: VersionedDeliverable = {
        type: 'versioned',
        taskId: 'conv-123',
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI trends' },
        totalCandidates: 5,
        versions: [
          {
            version: 1,
            rank: 3,
            content: 'Third place content',
            writerAgent: 'writer-3',
            editorAgent: 'editor-3',
            score: 7.5,
            metadata: {
              outputId: 'output-3',
              editCycles: 0,
              initialScore: 7.5,
              finalScore: 7.5,
              writerLlmProvider: 'anthropic',
              writerLlmModel: 'claude-sonnet-4-20250514',
              editorLlmProvider: 'anthropic',
              editorLlmModel: 'claude-sonnet-4-20250514',
            },
          },
          {
            version: 2,
            rank: 2,
            content: 'Second place content',
            writerAgent: 'writer-2',
            editorAgent: 'editor-2',
            score: 8.5,
            metadata: {
              outputId: 'output-2',
              editCycles: 1,
              initialScore: 8.0,
              finalScore: 8.5,
              writerLlmProvider: 'anthropic',
              writerLlmModel: 'claude-sonnet-4-20250514',
              editorLlmProvider: 'anthropic',
              editorLlmModel: 'claude-sonnet-4-20250514',
            },
          },
          {
            version: 3,
            rank: 1,
            content: 'Winner content',
            writerAgent: 'writer-1',
            editorAgent: 'editor-1',
            score: 9.5,
            metadata: {
              outputId: 'output-1',
              editCycles: 2,
              initialScore: 8.0,
              finalScore: 9.5,
              writerLlmProvider: 'anthropic',
              writerLlmModel: 'claude-sonnet-4-20250514',
              editorLlmProvider: 'anthropic',
              editorLlmModel: 'claude-sonnet-4-20250514',
            },
          },
        ],
        winner: {
          version: 3,
          rank: 1,
          content: 'Winner content',
          writerAgent: 'writer-1',
          editorAgent: 'editor-1',
          score: 9.5,
          metadata: {
            outputId: 'output-1',
            editCycles: 2,
            initialScore: 8.0,
            finalScore: 9.5,
            writerLlmProvider: 'anthropic',
            writerLlmModel: 'claude-sonnet-4-20250514',
            editorLlmProvider: 'anthropic',
            editorLlmModel: 'claude-sonnet-4-20250514',
          },
        },
        generatedAt: '2025-01-01T00:00:00Z',
      };

      service.getVersionedDeliverable.mockResolvedValue(
        mockVersionedDeliverable,
      );

      const result = await controller.getVersionedDeliverable('task-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockVersionedDeliverable);
      expect(result.data.type).toBe('versioned');
      expect(result.data.versions).toHaveLength(3);
      expect(result.data.winner?.version).toBe(3);
      expect(service.getVersionedDeliverable).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException for non-existent versioned deliverable', async () => {
      service.getVersionedDeliverable.mockResolvedValue(null);

      await expect(
        controller.getVersionedDeliverable('non-existent'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getVersionedDeliverable('non-existent'),
      ).rejects.toThrow(
        'Versioned deliverable not found for task: non-existent',
      );
    });
  });

  describe('DELETE /marketing-swarm/:taskId', () => {
    it('should delete task and return success', async () => {
      service.deleteTask.mockResolvedValue(true);

      const result = await controller.deleteTask('task-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe(
        'Task task-123 and all associated data deleted',
      );
      expect(service.deleteTask).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException for non-existent task', async () => {
      service.deleteTask.mockResolvedValue(false);

      await expect(controller.deleteTask('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.deleteTask('non-existent')).rejects.toThrow(
        'Swarm task not found: non-existent',
      );
    });
  });

  describe('GET /marketing-swarm/output/:outputId/versions', () => {
    it('should return version history for output', async () => {
      const mockVersions: OutputVersionRow[] = [
        {
          id: 'version-1',
          output_id: 'output-1',
          task_id: 'task-123',
          version_number: 1,
          content: 'Initial write',
          action_type: 'write',
          editor_feedback: null,
          llm_metadata: { model: 'claude-sonnet-4-20250514' },
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'version-2',
          output_id: 'output-1',
          task_id: 'task-123',
          version_number: 2,
          content: 'First rewrite',
          action_type: 'rewrite',
          editor_feedback: 'Make it more engaging',
          llm_metadata: { model: 'claude-sonnet-4-20250514' },
          created_at: '2025-01-01T00:30:00Z',
        },
      ];

      service.getOutputVersions.mockResolvedValue(mockVersions);

      const result = await controller.getOutputVersions('output-1');

      expect(result.success).toBe(true);
      expect(result.data.outputId).toBe('output-1');
      expect(result.data.versions).toEqual(mockVersions);
      expect(result.data.versions).toHaveLength(2);
      expect(service.getOutputVersions).toHaveBeenCalledWith('output-1');
    });

    it('should return empty array for output with no versions', async () => {
      service.getOutputVersions.mockResolvedValue([]);

      const result = await controller.getOutputVersions('output-1');

      expect(result.success).toBe(true);
      expect(result.data.versions).toEqual([]);
    });
  });

  describe('GET /marketing-swarm/output/:outputId', () => {
    it('should return output by ID', async () => {
      service.getOutputById.mockResolvedValue(mockOutputRow);

      const result = await controller.getOutput('output-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockOutputRow);
      expect(service.getOutputById).toHaveBeenCalledWith('output-1');
    });

    it('should throw NotFoundException for non-existent output', async () => {
      service.getOutputById.mockResolvedValue(null);

      await expect(controller.getOutput('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getOutput('non-existent')).rejects.toThrow(
        'Output not found: non-existent',
      );
    });
  });

  describe('GET /marketing-swarm/by-conversation/:conversationId', () => {
    it('should return task for existing conversation', async () => {
      const mockTask = {
        taskId: 'conv-123',
        status: 'completed',
      };

      service.getTaskByConversationId.mockResolvedValue(mockTask);

      const result = await controller.getTaskByConversation('conv-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
      expect(service.getTaskByConversationId).toHaveBeenCalledWith('conv-123');
    });

    it('should throw NotFoundException for non-existent conversation', async () => {
      service.getTaskByConversationId.mockResolvedValue(null);

      await expect(
        controller.getTaskByConversation('non-existent'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getTaskByConversation('non-existent'),
      ).rejects.toThrow('No task found for conversation: non-existent');
    });
  });
});
