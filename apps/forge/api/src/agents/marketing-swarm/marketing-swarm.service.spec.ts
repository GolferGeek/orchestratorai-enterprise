import { Test, TestingModule } from '@nestjs/testing';
import { MarketingSwarmService } from './marketing-swarm.service';
import { DualTrackProcessorService } from './dual-track-processor.service';
import {
  MarketingDbService,
  OutputRow,
  EvaluationRow,
  Deliverable,
  VersionedDeliverable,
  OutputVersionRow,
} from './marketing-db.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Unit tests for MarketingSwarmService
 *
 * Tests the Marketing Swarm service that manages database-driven
 * marketing content generation workflows with dual-track processing.
 *
 * Coverage areas:
 * - execute() - Main workflow execution
 * - getStatus() - Task status retrieval
 * - getFullState() - Full task state retrieval
 * - getTaskByConversationId() - Task lookup by conversation
 * - getDeliverable() - Deliverable retrieval
 * - getVersionedDeliverable() - Versioned deliverable retrieval
 * - deleteTask() - Task deletion
 * - getOutputVersions() - Output version history
 * - getOutputById() - Individual output retrieval
 */
describe('MarketingSwarmService', () => {
  let service: MarketingSwarmService;
  let processor: jest.Mocked<DualTrackProcessorService>;
  let db: jest.Mocked<MarketingDbService>;
  let _observability: jest.Mocked<ObservabilityService>;

  const mockContext = createMockExecutionContext({
    conversationId: 'conv-123',
    userId: 'user-456',
    conversationId: 'conv-789',
    orgSlug: 'test-org',
    agentSlug: 'marketing-swarm',
    agentType: 'langgraph',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  });

  const mockOutputRow: OutputRow = {
    id: 'output-1',
    task_id: 'task-123',
    writer_agent_slug: 'writer-1',
    writer_llm_provider: 'anthropic',
    writer_llm_model: 'claude-sonnet-4-20250514',
    editor_agent_slug: 'editor-1',
    editor_llm_provider: 'anthropic',
    editor_llm_model: 'claude-sonnet-4-20250514',
    content: 'Test marketing content',
    status: 'approved',
    edit_cycle: 1,
    editor_feedback: null,
    initial_avg_score: 8.5,
    initial_rank: 1,
    is_finalist: true,
    final_total_score: 95,
    final_rank: 1,
    llm_metadata: { tokensUsed: 500, latencyMs: 1200, cost: 0.05 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockEvaluationRow: EvaluationRow = {
    id: 'eval-1',
    task_id: 'task-123',
    output_id: 'output-1',
    evaluator_agent_slug: 'evaluator-1',
    evaluator_llm_provider: 'anthropic',
    evaluator_llm_model: 'claude-sonnet-4-20250514',
    stage: 'initial',
    status: 'completed',
    score: 9,
    rank: null,
    weighted_score: null,
    reasoning: 'Excellent content quality',
    llm_metadata: { tokensUsed: 200, latencyMs: 800, cost: 0.02 },
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingSwarmService,
        {
          provide: DualTrackProcessorService,
          useValue: {
            processTask: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MarketingDbService,
          useValue: {
            getAllOutputs: jest.fn().mockResolvedValue([mockOutputRow]),
            getAllEvaluations: jest.fn().mockResolvedValue([mockEvaluationRow]),
            getDeliverable: jest.fn().mockResolvedValue(null),
            getVersionedDeliverable: jest.fn().mockResolvedValue(null),
            getTaskByConversationId: jest.fn().mockResolvedValue(null),
            getTaskConfig: jest
              .fn()
              .mockResolvedValue({ conversationId: 'conv-123' }),
            createTask: jest.fn().mockResolvedValue(undefined),
            taskExists: jest.fn().mockResolvedValue(true),
            deleteTaskData: jest.fn().mockResolvedValue(true),
            getOutputVersions: jest.fn().mockResolvedValue([]),
            getOutputById: jest.fn().mockResolvedValue(mockOutputRow),
          },
        },
        {
          provide: ObservabilityService,
          useValue: {
            emitStarted: jest.fn().mockResolvedValue(undefined),
            emitCompleted: jest.fn().mockResolvedValue(undefined),
            emitFailed: jest.fn().mockResolvedValue(undefined),
            emitProgress: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<MarketingSwarmService>(MarketingSwarmService);
    processor = module.get(DualTrackProcessorService);
    db = module.get(MarketingDbService);
    _observability = module.get(ObservabilityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    const validInput = {
      context: mockContext,
      conversationId: 'conv-123',
    };

    it('should execute marketing swarm workflow successfully', async () => {
      const result = await service.execute(validInput);

      expect(result.conversationId).toBe('task-123');
      expect(result.status).toBe('completed');
      expect(result.outputs).toHaveLength(1);
      expect(result.evaluations).toHaveLength(1);
      expect(result.winner).toBeDefined();
      expect(result.winner?.final_rank).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should call processor.processTask with correct parameters', async () => {
      await service.execute(validInput);

      expect(processor.processTask).toHaveBeenCalledWith(
        'task-123',
        mockContext,
      );
      expect(processor.processTask).toHaveBeenCalledTimes(1);
    });

    it('should retrieve outputs and evaluations from database', async () => {
      await service.execute(validInput);

      expect(db.getAllOutputs).toHaveBeenCalledWith('task-123');
      expect(db.getAllEvaluations).toHaveBeenCalledWith('task-123');
    });

    it('should identify winner as output with final_rank = 1', async () => {
      const result = await service.execute(validInput);

      expect(result.winner).toBeDefined();
      expect(result.winner?.id).toBe('output-1');
      expect(result.winner?.final_rank).toBe(1);
    });

    it('should retrieve deliverables from database', async () => {
      const mockDeliverable: Deliverable = {
        conversationId: 'conv-123',
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI Testing' },
        totalOutputs: 5,
        deliveredCount: 3,
        rankedOutputs: [],
        generatedAt: new Date().toISOString(),
      };

      db.getDeliverable.mockResolvedValue(mockDeliverable);

      const result = await service.execute(validInput);

      expect(db.getDeliverable).toHaveBeenCalledWith('task-123');
      expect(result.deliverable).toEqual(mockDeliverable);
    });

    it('should retrieve versioned deliverables from database', async () => {
      const mockVersionedDeliverable: VersionedDeliverable = {
        type: 'versioned',
        conversationId: 'conv-123',
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI Testing' },
        totalCandidates: 5,
        versions: [],
        winner: null,
        generatedAt: new Date().toISOString(),
      };

      db.getVersionedDeliverable.mockResolvedValue(mockVersionedDeliverable);

      const result = await service.execute(validInput);

      expect(db.getVersionedDeliverable).toHaveBeenCalledWith('task-123');
      expect(result.versionedDeliverable).toEqual(mockVersionedDeliverable);
    });

    it('should handle processor errors and return failed status', async () => {
      const error = new Error('Processor failed');
      processor.processTask.mockRejectedValue(error);

      const result = await service.execute(validInput);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Processor failed');
      expect(result.outputs).toEqual([]);
      expect(result.evaluations).toEqual([]);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-Error exceptions', async () => {
      processor.processTask.mockRejectedValue('String error');

      const result = await service.execute(validInput);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('String error');
    });

    it('should calculate duration correctly', async () => {
      const result = await service.execute(validInput);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should pass ExecutionContext through all service calls', async () => {
      await service.execute(validInput);

      expect(processor.processTask).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orgSlug: mockContext.orgSlug,
          userId: mockContext.userId,
          conversationId: mockContext.conversationId,
          conversationId: mockContext.conversationId,
        }),
      );
    });
  });

  describe('getStatus', () => {
    it('should return null for non-existent task', async () => {
      db.getAllOutputs.mockResolvedValue([]);

      const result = await service.getStatus('non-existent-task');

      expect(result).toBeNull();
    });

    it('should return status for existing task', async () => {
      const result = await service.getStatus('task-123');

      expect(result).toBeDefined();
      expect(result?.conversationId).toBe('task-123');
      expect(result?.status).toBeDefined();
      expect(result?.progress).toBeDefined();
    });

    it('should calculate progress correctly in writing phase', async () => {
      const pendingOutput = { ...mockOutputRow, status: 'pending_write' };
      db.getAllOutputs.mockResolvedValue([pendingOutput]);
      db.getAllEvaluations.mockResolvedValue([]);

      const result = await service.getStatus('task-123');

      expect(result?.phase).toBe('writing');
      expect(result?.progress.total).toBeGreaterThan(0);
      expect(result?.progress.percentage).toBeGreaterThanOrEqual(0);
      expect(result?.progress.percentage).toBeLessThanOrEqual(100);
    });

    it('should calculate progress correctly in evaluating_initial phase', async () => {
      const approvedOutput = { ...mockOutputRow, status: 'approved' };
      const pendingEval = {
        ...mockEvaluationRow,
        stage: 'initial' as const,
        status: 'pending' as const,
      };
      db.getAllOutputs.mockResolvedValue([approvedOutput]);
      db.getAllEvaluations.mockResolvedValue([pendingEval]);

      const result = await service.getStatus('task-123');

      expect(result?.phase).toBe('evaluating_initial');
      expect(result?.progress.percentage).toBeGreaterThanOrEqual(0);
    });

    it('should calculate progress correctly in evaluating_final phase', async () => {
      const finalistOutput = {
        ...mockOutputRow,
        status: 'approved',
        is_finalist: true,
      };
      const completedInitialEval = {
        ...mockEvaluationRow,
        stage: 'initial' as const,
        status: 'completed' as const,
      };
      const pendingFinalEval = {
        ...mockEvaluationRow,
        stage: 'final' as const,
        status: 'pending' as const,
      };
      db.getAllOutputs.mockResolvedValue([finalistOutput]);
      db.getAllEvaluations.mockResolvedValue([
        completedInitialEval,
        pendingFinalEval,
      ]);

      const result = await service.getStatus('task-123');

      expect(result?.phase).toBe('evaluating_final');
    });

    it('should identify completed phase when final_rank is set', async () => {
      const rankedOutput = { ...mockOutputRow, final_rank: 1 };
      db.getAllOutputs.mockResolvedValue([rankedOutput]);

      const result = await service.getStatus('task-123');

      expect(result?.phase).toBe('completed');
      expect(result?.status).toBe('completed');
    });

    it('should handle database errors gracefully', async () => {
      db.getAllOutputs.mockRejectedValue(new Error('Database error'));

      const result = await service.getStatus('task-123');

      expect(result).toBeNull();
    });

    it('should calculate percentage correctly', async () => {
      const outputs = [
        { ...mockOutputRow, status: 'approved' },
        { ...mockOutputRow, id: 'output-2', status: 'pending_write' },
      ];
      db.getAllOutputs.mockResolvedValue(outputs);

      const result = await service.getStatus('task-123');

      expect(result?.progress.percentage).toBeGreaterThan(0);
      expect(result?.progress.percentage).toBeLessThan(100);
    });
  });

  describe('getFullState', () => {
    it('should return full state for existing task', async () => {
      const result = await service.getFullState('task-123');

      expect(result).toBeDefined();
      expect(result?.outputs).toHaveLength(1);
      expect(result?.evaluations).toHaveLength(1);
    });

    it('should return null on database error', async () => {
      db.getAllOutputs.mockRejectedValue(new Error('Database error'));

      const result = await service.getFullState('task-123');

      expect(result).toBeNull();
    });

    it('should call database methods with correct taskId', async () => {
      await service.getFullState('task-456');

      expect(db.getAllOutputs).toHaveBeenCalledWith('task-456');
      expect(db.getAllEvaluations).toHaveBeenCalledWith('task-456');
    });
  });

  describe('getTaskByConversationId', () => {
    it('should return null when no task exists for conversation', async () => {
      const result = await service.getTaskByConversationId('conv-999');

      expect(result).toBeNull();
      expect(db.getTaskByConversationId).toHaveBeenCalledWith('conv-999');
    });

    it('should return task info when task exists', async () => {
      const mockTask = { conversationId: 'conv-123', status: 'running' };
      db.getTaskByConversationId.mockResolvedValue(mockTask);

      const result = await service.getTaskByConversationId('conv-789');

      expect(result).toEqual(mockTask);
      expect(db.getTaskByConversationId).toHaveBeenCalledWith('conv-789');
    });
  });

  describe('getDeliverable', () => {
    it('should return deliverable for completed task', async () => {
      const mockDeliverable: Deliverable = {
        conversationId: 'conv-123',
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI Testing' },
        totalOutputs: 5,
        deliveredCount: 3,
        rankedOutputs: [],
        generatedAt: new Date().toISOString(),
      };

      db.getDeliverable.mockResolvedValue(mockDeliverable);

      const result = await service.getDeliverable('task-123');

      expect(result).toEqual(mockDeliverable);
      expect(db.getDeliverable).toHaveBeenCalledWith('task-123', undefined);
    });

    it('should return null when no deliverable exists', async () => {
      db.getDeliverable.mockResolvedValue(null);

      const result = await service.getDeliverable('task-123');

      expect(result).toBeNull();
    });

    it('should pass topN parameter to database', async () => {
      await service.getDeliverable('task-123', 5);

      expect(db.getDeliverable).toHaveBeenCalledWith('task-123', 5);
    });

    it('should use default topN when not provided', async () => {
      await service.getDeliverable('task-123');

      expect(db.getDeliverable).toHaveBeenCalledWith('task-123', undefined);
    });
  });

  describe('getVersionedDeliverable', () => {
    it('should return versioned deliverable for completed task', async () => {
      const mockVersionedDeliverable: VersionedDeliverable = {
        type: 'versioned',
        conversationId: 'conv-123',
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI Testing' },
        totalCandidates: 5,
        versions: [],
        winner: null,
        generatedAt: new Date().toISOString(),
      };

      db.getVersionedDeliverable.mockResolvedValue(mockVersionedDeliverable);

      const result = await service.getVersionedDeliverable('task-123');

      expect(result).toEqual(mockVersionedDeliverable);
      expect(db.getVersionedDeliverable).toHaveBeenCalledWith(
        'task-123',
        undefined,
      );
    });

    it('should return null when no versioned deliverable exists', async () => {
      db.getVersionedDeliverable.mockResolvedValue(null);

      const result = await service.getVersionedDeliverable('task-123');

      expect(result).toBeNull();
    });

    it('should pass topN parameter to database', async () => {
      await service.getVersionedDeliverable('task-123', 3);

      expect(db.getVersionedDeliverable).toHaveBeenCalledWith('task-123', 3);
    });

    it('should use default topN when not provided', async () => {
      await service.getVersionedDeliverable('task-123');

      expect(db.getVersionedDeliverable).toHaveBeenCalledWith(
        'task-123',
        undefined,
      );
    });
  });

  describe('deleteTask', () => {
    it('should delete existing task successfully', async () => {
      const result = await service.deleteTask('task-123');

      expect(result).toBe(true);
      expect(db.taskExists).toHaveBeenCalledWith('task-123');
      expect(db.deleteTaskData).toHaveBeenCalledWith('task-123');
    });

    it('should return false for non-existent task', async () => {
      db.taskExists.mockResolvedValue(false);

      const result = await service.deleteTask('non-existent');

      expect(result).toBe(false);
      expect(db.taskExists).toHaveBeenCalledWith('non-existent');
      expect(db.deleteTaskData).not.toHaveBeenCalled();
    });

    it('should return false when deletion fails', async () => {
      db.deleteTaskData.mockResolvedValue(false);

      const result = await service.deleteTask('task-123');

      expect(result).toBe(false);
      expect(db.deleteTaskData).toHaveBeenCalledWith('task-123');
    });

    it('should check task existence before deletion', async () => {
      await service.deleteTask('task-123');

      expect(db.taskExists).toHaveBeenCalled();
      expect(db.deleteTaskData).toHaveBeenCalled();
    });
  });

  describe('getOutputVersions', () => {
    it('should return version history for output', async () => {
      const mockVersions: OutputVersionRow[] = [
        {
          id: 'version-1',
          output_id: 'output-1',
          task_id: 'task-123',
          version_number: 1,
          content: 'Initial content',
          action_type: 'write',
          editor_feedback: null,
          llm_metadata: null,
          created_at: new Date().toISOString(),
        },
        {
          id: 'version-2',
          output_id: 'output-1',
          task_id: 'task-123',
          version_number: 2,
          content: 'Revised content',
          action_type: 'rewrite',
          editor_feedback: 'Needs improvement',
          llm_metadata: null,
          created_at: new Date().toISOString(),
        },
      ];

      db.getOutputVersions.mockResolvedValue(mockVersions);

      const result = await service.getOutputVersions('output-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.version_number).toBe(1);
      expect(result[1]!.version_number).toBe(2);
      expect(db.getOutputVersions).toHaveBeenCalledWith('output-1');
    });

    it('should return empty array when no versions exist', async () => {
      db.getOutputVersions.mockResolvedValue([]);

      const result = await service.getOutputVersions('output-1');

      expect(result).toEqual([]);
    });
  });

  describe('getOutputById', () => {
    it('should return output by ID', async () => {
      const result = await service.getOutputById('output-1');

      expect(result).toEqual(mockOutputRow);
      expect(db.getOutputById).toHaveBeenCalledWith('output-1');
    });

    it('should return null for non-existent output', async () => {
      db.getOutputById.mockResolvedValue(null);

      const result = await service.getOutputById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('ExecutionContext validation', () => {
    it('should use ExecutionContext from input in execute', async () => {
      const customContext = createMockExecutionContext({
        conversationId: 'custom-conv',
        userId: 'custom-user',
        orgSlug: 'custom-org',
      });

      await service.execute({
        context: customContext,
        conversationId: 'custom-conv',
      });

      expect(processor.processTask).toHaveBeenCalledWith(
        'custom-task',
        expect.objectContaining({
          conversationId: 'custom-conv',
          userId: 'custom-user',
          orgSlug: 'custom-org',
        }),
      );
    });

    it('should pass complete ExecutionContext with all required fields', async () => {
      await service.execute({
        context: mockContext,
        conversationId: 'conv-123',
      });

      expect(processor.processTask).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orgSlug: expect.any(String),
          userId: expect.any(String),
          conversationId: expect.any(String),
          conversationId: expect.any(String),
          planId: expect.any(String),
          deliverableId: expect.any(String),
          agentSlug: expect.any(String),
          agentType: expect.any(String),
          provider: expect.any(String),
          model: expect.any(String),
        }),
      );
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors in getStatus', async () => {
      db.getAllOutputs.mockRejectedValue(new Error('Connection timeout'));

      const result = await service.getStatus('task-123');

      expect(result).toBeNull();
    });

    it('should handle database connection errors in getFullState', async () => {
      db.getAllEvaluations.mockRejectedValue(new Error('Connection timeout'));

      const result = await service.getFullState('task-123');

      expect(result).toBeNull();
    });

    it('should propagate processor errors in execute', async () => {
      processor.processTask.mockRejectedValue(new Error('Processing failed'));

      const result = await service.execute({
        context: mockContext,
        conversationId: 'conv-123',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Processing failed');
    });
  });

  describe('Integration with dependencies', () => {
    it('should integrate with DualTrackProcessorService', async () => {
      await service.execute({
        context: mockContext,
        conversationId: 'conv-123',
      });

      expect(processor.processTask).toHaveBeenCalled();
    });

    it('should integrate with MarketingDbService for state retrieval', async () => {
      await service.getFullState('task-123');

      expect(db.getAllOutputs).toHaveBeenCalled();
      expect(db.getAllEvaluations).toHaveBeenCalled();
    });

    it('should integrate with MarketingDbService for deliverable retrieval', async () => {
      await service.getDeliverable('task-123');
      await service.getVersionedDeliverable('task-123');

      expect(db.getDeliverable).toHaveBeenCalled();
      expect(db.getVersionedDeliverable).toHaveBeenCalled();
    });
  });
});

/**
 * Integration tests for MarketingSwarmService
 *
 * These tests require a running database and should be run
 * against the test environment.
 */
describe.skip('MarketingSwarmService (Integration)', () => {
  // Integration tests would be marked with a different tag
  // and run separately against the test database

  it.todo('should complete full marketing swarm workflow');
  it.todo('should handle dual-track processing with local and cloud LLMs');
  it.todo('should persist task state through all phases');
  it.todo('should calculate rankings correctly');
  it.todo('should generate deliverables with top N outputs');
  it.todo('should generate versioned deliverables with correct ordering');
  it.todo('should emit correct observability events throughout workflow');
  it.todo('should handle task deletion with cascading deletes');
});
