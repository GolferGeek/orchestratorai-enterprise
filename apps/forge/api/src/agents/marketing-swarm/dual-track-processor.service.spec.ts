import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { DualTrackProcessorService } from './dual-track-processor.service';
import {
  MarketingDbService,
  ExecutionConfig,
  TaskConfig,
  OutputRow,
  EvaluationRow,
  AgentPersonality,
  AgentSelection,
} from './marketing-db.service';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';

/**
 * Unit tests for DualTrackProcessorService
 *
 * Tests the dual-track processing model:
 * - Database-driven state machine
 * - Local (Ollama) sequential execution
 * - Cloud parallel execution
 * - Write/Edit/Rewrite cycle
 * - Initial/Final evaluation rounds
 * - Rankings and finalist selection
 *
 * CRITICAL: Tests must validate ExecutionContext flow (execution-context-skill)
 * and A2A protocol compliance (transport-types-skill).
 */
describe('DualTrackProcessorService', () => {
  let service: DualTrackProcessorService;
  let mockDb: jest.Mocked<MarketingDbService>;
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;

  // Mock ExecutionContext
  const mockContext = createMockExecutionContext({
    taskId: 'task-123',
    userId: 'user-456',
    conversationId: 'conv-789',
    orgSlug: 'org-abc',
    agentSlug: 'marketing-swarm',
    agentType: 'langgraph',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  });

  // Mock TaskConfig
  const mockExecutionConfig: ExecutionConfig = {
    maxLocalConcurrent: 1,
    maxCloudConcurrent: 3,
    maxEditCycles: 3,
    topNForFinalRanking: 2,
    topNForDeliverable: 1,
  };

  const mockWriterConfig: AgentSelection = {
    agentSlug: 'writer-creative',
    llmProvider: 'anthropic',
    llmModel: 'claude-sonnet-4-20250514',
  };

  const mockEditorConfig: AgentSelection = {
    agentSlug: 'editor-clarity',
    llmProvider: 'anthropic',
    llmModel: 'claude-sonnet-4-20250514',
  };

  const mockEvaluatorConfig: AgentSelection = {
    agentSlug: 'evaluator-quality',
    llmProvider: 'anthropic',
    llmModel: 'claude-sonnet-4-20250514',
  };

  const mockTaskConfig: TaskConfig = {
    execution: mockExecutionConfig,
    writers: [mockWriterConfig],
    editors: [mockEditorConfig],
    evaluators: [mockEvaluatorConfig],
  };

  // Mock OutputRow
  const createMockOutput = (partial: Partial<OutputRow> = {}): OutputRow => ({
    id: 'output-1',
    task_id: 'task-123',
    writer_agent_slug: 'writer-creative',
    writer_llm_provider: 'anthropic',
    writer_llm_model: 'claude-sonnet-4-20250514',
    editor_agent_slug: 'editor-clarity',
    editor_llm_provider: 'anthropic',
    editor_llm_model: 'claude-sonnet-4-20250514',
    status: 'pending_write',
    content: null,
    editor_feedback: null,
    edit_cycle: 0,
    initial_avg_score: null,
    initial_rank: null,
    is_finalist: false,
    final_total_score: null,
    final_rank: null,
    llm_metadata: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  });

  // Mock EvaluationRow
  const createMockEvaluation = (
    partial: Partial<EvaluationRow> = {},
  ): EvaluationRow => ({
    id: 'eval-1',
    task_id: 'task-123',
    output_id: 'output-1',
    evaluator_agent_slug: 'evaluator-quality',
    evaluator_llm_provider: 'anthropic',
    evaluator_llm_model: 'claude-sonnet-4-20250514',
    stage: 'initial',
    status: 'pending',
    score: null,
    rank: null,
    weighted_score: null,
    reasoning: null,
    llm_metadata: null,
    created_at: new Date().toISOString(),
    ...partial,
  });

  // Mock AgentPersonality
  const createMockPersonality = (slug: string): AgentPersonality => ({
    slug: slug,
    name: `${slug} Agent`,
    role: 'writer' as const,
    personality: {
      system_context: `You are a ${slug} agent`,
      review_focus: ['clarity', 'accuracy'],
      approval_criteria: 'Content meets quality standards',
      evaluation_criteria: {
        quality: 'High quality content',
        relevance: 'Relevant to topic',
      },
      score_anchors: {
        '1-3': 'Poor quality',
        '4-6': 'Average quality',
        '7-10': 'Excellent quality',
      },
    },
  });

  beforeEach(async () => {
    // Mock MarketingDbService
    mockDb = {
      getTaskConfig: jest.fn(),
      updateTaskStatus: jest.fn(),
      buildOutputMatrix: jest.fn(),
      getRunningCounts: jest.fn(),
      getNextOutputs: jest.fn(),
      areAllOutputsComplete: jest.fn(),
      updateOutputStatus: jest.fn(),
      getAgentPersonality: jest.fn(),
      getPromptData: jest.fn(),
      getContentTypeContext: jest.fn(),
      updateOutputContent: jest.fn(),
      saveOutputVersion: jest.fn(),
      getOutputById: jest.fn(),
      updateOutputAfterEdit: jest.fn(),
      buildInitialEvaluations: jest.fn(),
      getPendingEvaluations: jest.fn(),
      areAllInitialEvaluationsComplete: jest.fn(),
      areAllFinalEvaluationsComplete: jest.fn(),
      updateEvaluation: jest.fn(),
      addEvaluationCostToOutput: jest.fn(),
      calculateInitialRankingsAndSelectFinalists: jest.fn(),
      buildFinalEvaluations: jest.fn(),
      calculateFinalRankings: jest.fn(),
      getAllOutputs: jest.fn(),
      getAllEvaluations: jest.fn(),
    } as unknown as jest.Mocked<MarketingDbService>;

    // Mock LLMHttpClientService
    mockLLMClient = {
      callLLM: jest.fn(),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    // Mock ObservabilityService
    mockObservability = {
      emitStarted: jest.fn(),
      emitProgress: jest.fn(),
      emitCompleted: jest.fn(),
      emitFailed: jest.fn(),
    } as unknown as jest.Mocked<ObservabilityService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DualTrackProcessorService,
        { provide: MarketingDbService, useValue: mockDb },
        { provide: LLMHttpClientService, useValue: mockLLMClient },
        { provide: ObservabilityService, useValue: mockObservability },
      ],
    }).compile();

    service = module.get<DualTrackProcessorService>(DualTrackProcessorService);

    // Suppress logger output in tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processTask - Main processing loop', () => {
    it('should throw error if task config not found', async () => {
      mockDb.getTaskConfig.mockResolvedValue(null);

      await expect(
        service.processTask('task-123', mockContext),
      ).rejects.toThrow('Task config not found');
    });

    it('should execute all phases successfully', async () => {
      const taskId = 'task-123';
      const outputs = [createMockOutput()];

      // Setup mocks for successful execution
      mockDb.getTaskConfig.mockResolvedValue(mockTaskConfig);
      mockDb.buildOutputMatrix.mockResolvedValue(outputs);
      mockDb.getRunningCounts.mockResolvedValue({ local: 0, cloud: 0 });
      mockDb.getNextOutputs.mockResolvedValue([]);
      mockDb.areAllOutputsComplete.mockResolvedValue(true);
      mockDb.getPendingEvaluations.mockResolvedValue([]);
      mockDb.areAllInitialEvaluationsComplete.mockResolvedValue(true);
      mockDb.areAllFinalEvaluationsComplete.mockResolvedValue(true);
      mockDb.calculateInitialRankingsAndSelectFinalists.mockResolvedValue(2);
      mockDb.getAllOutputs.mockResolvedValue(outputs);
      mockDb.getAllEvaluations.mockResolvedValue([]);

      await service.processTask(taskId, mockContext);

      // Verify all phases executed
      expect(mockDb.updateTaskStatus).toHaveBeenCalledWith(taskId, 'running');
      expect(mockObservability.emitStarted).toHaveBeenCalled();
      expect(mockDb.buildOutputMatrix).toHaveBeenCalled();
      expect(mockDb.buildInitialEvaluations).toHaveBeenCalled();
      expect(
        mockDb.calculateInitialRankingsAndSelectFinalists,
      ).toHaveBeenCalled();
      expect(mockDb.buildFinalEvaluations).toHaveBeenCalled();
      expect(mockDb.calculateFinalRankings).toHaveBeenCalled();
      expect(mockDb.updateTaskStatus).toHaveBeenCalledWith(taskId, 'completed');
      expect(mockObservability.emitCompleted).toHaveBeenCalled();
    });

    it('should skip final evaluation if no finalists', async () => {
      const taskId = 'task-123';
      const outputs = [createMockOutput()];

      mockDb.getTaskConfig.mockResolvedValue(mockTaskConfig);
      mockDb.buildOutputMatrix.mockResolvedValue(outputs);
      mockDb.getRunningCounts.mockResolvedValue({ local: 0, cloud: 0 });
      mockDb.getNextOutputs.mockResolvedValue([]);
      mockDb.areAllOutputsComplete.mockResolvedValue(true);
      mockDb.getPendingEvaluations.mockResolvedValue([]);
      mockDb.areAllInitialEvaluationsComplete.mockResolvedValue(true);
      mockDb.calculateInitialRankingsAndSelectFinalists.mockResolvedValue(0); // No finalists
      mockDb.getAllOutputs.mockResolvedValue(outputs);
      mockDb.getAllEvaluations.mockResolvedValue([]);

      await service.processTask(taskId, mockContext);

      // Verify final evaluation was skipped
      expect(mockDb.buildFinalEvaluations).not.toHaveBeenCalled();
      expect(mockDb.calculateFinalRankings).not.toHaveBeenCalled();
      expect(mockDb.updateTaskStatus).toHaveBeenCalledWith(taskId, 'completed');
    });

    it('should handle errors and mark task as failed', async () => {
      const taskId = 'task-123';
      const errorMessage = 'Database error';

      mockDb.getTaskConfig.mockRejectedValue(new Error(errorMessage));

      await expect(service.processTask(taskId, mockContext)).rejects.toThrow(
        errorMessage,
      );

      expect(mockDb.updateTaskStatus).toHaveBeenCalledWith(
        taskId,
        'failed',
        undefined,
        errorMessage,
      );
      expect(mockObservability.emitFailed).toHaveBeenCalledWith(
        mockContext,
        taskId,
        errorMessage,
        0,
      );
    });

    it('should pass ExecutionContext to observability methods', async () => {
      const taskId = 'task-123';
      const outputs = [createMockOutput()];

      mockDb.getTaskConfig.mockResolvedValue(mockTaskConfig);
      mockDb.buildOutputMatrix.mockResolvedValue(outputs);
      mockDb.getRunningCounts.mockResolvedValue({ local: 0, cloud: 0 });
      mockDb.getNextOutputs.mockResolvedValue([]);
      mockDb.areAllOutputsComplete.mockResolvedValue(true);
      mockDb.getPendingEvaluations.mockResolvedValue([]);
      mockDb.areAllInitialEvaluationsComplete.mockResolvedValue(true);
      mockDb.areAllFinalEvaluationsComplete.mockResolvedValue(true);
      mockDb.calculateInitialRankingsAndSelectFinalists.mockResolvedValue(0);
      mockDb.getAllOutputs.mockResolvedValue(outputs);
      mockDb.getAllEvaluations.mockResolvedValue([]);

      await service.processTask(taskId, mockContext);

      // Verify ExecutionContext passed to all observability calls
      expect(mockObservability.emitStarted).toHaveBeenCalledWith(
        mockContext,
        taskId,
        expect.any(String),
      );
      expect(mockObservability.emitProgress).toHaveBeenCalledWith(
        mockContext,
        taskId,
        expect.any(String),
        expect.any(Object),
      );
      expect(mockObservability.emitCompleted).toHaveBeenCalledWith(
        mockContext,
        taskId,
        expect.any(Object),
      );
    });
  });

  describe('processWrite', () => {
    it('should successfully write content', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({ status: 'pending_write' });
      const writerPersonality = createMockPersonality('writer-creative');
      const generatedContent = 'This is the generated content';

      mockDb.getAgentPersonality.mockResolvedValue(writerPersonality);
      mockDb.getPromptData.mockResolvedValue({
        contentTypeSlug: 'blog-post',
        promptData: {
          topic: 'AI in Healthcare',
          audience: 'Healthcare professionals',
          goal: 'Educate',
          tone: 'Professional',
          keyPoints: ['Point 1', 'Point 2'],
        },
      });
      mockDb.getContentTypeContext.mockResolvedValue('Blog post guidelines');
      mockLLMClient.callLLM.mockResolvedValue({
        text: generatedContent,
        usage: {
          promptTokens: 100,
          completionTokens: 400,
          totalTokens: 500,
          cost: 0.01,
        },
      });
      mockDb.getOutputById.mockResolvedValue({
        ...output,
        content: generatedContent,
      });

      await (service as any).processWrite(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      // Verify status updates
      expect(mockDb.updateOutputStatus).toHaveBeenCalledWith(
        output.id,
        'writing',
      );

      // Verify LLM call with proper ExecutionContext
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith({
        context: expect.objectContaining({
          ...mockContext,
          provider: output.writer_llm_provider,
          model: output.writer_llm_model,
        }),
        userMessage: expect.any(String),
        callerName: `marketing-swarm:${output.writer_agent_slug}`,
      });

      // Verify content saved
      expect(mockDb.updateOutputContent).toHaveBeenCalledWith(
        output.id,
        generatedContent,
        'pending_edit',
        expect.objectContaining({ tokensUsed: 500, cost: 0.01 }),
      );

      // Verify version saved
      expect(mockDb.saveOutputVersion).toHaveBeenCalledWith(
        output.id,
        taskId,
        generatedContent,
        'write',
        null,
        expect.any(Object),
      );

      // Verify progress emitted
      expect(mockObservability.emitProgress).toHaveBeenCalled();
    });

    it('should throw error if writer personality not found', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({ status: 'pending_write' });

      mockDb.getAgentPersonality.mockResolvedValue(null);

      await expect(
        (service as any).processWrite(
          taskId,
          mockContext,
          output,
          mockTaskConfig,
        ),
      ).rejects.toThrow('Writer personality not found');
    });

    it('should throw error if prompt data not found', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({ status: 'pending_write' });
      const writerPersonality = createMockPersonality('writer-creative');

      mockDb.getAgentPersonality.mockResolvedValue(writerPersonality);
      mockDb.getPromptData.mockResolvedValue(null);

      await expect(
        (service as any).processWrite(
          taskId,
          mockContext,
          output,
          mockTaskConfig,
        ),
      ).rejects.toThrow('Task prompt data not found');
    });
  });

  describe('processEdit', () => {
    it('should approve content on first edit', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_edit',
        content: 'Draft content',
        edit_cycle: 0,
      });
      const editorPersonality = createMockPersonality('editor-clarity');
      const editorResponse = '**Decision**: APPROVE\n**Feedback**: Looks good!';

      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getAgentPersonality.mockResolvedValue(editorPersonality);
      mockDb.getPromptData.mockResolvedValue({
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI', audience: 'Professionals' },
      });
      mockLLMClient.callLLM.mockResolvedValue({
        text: editorResponse,
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
          cost: 0.005,
        },
      });
      mockDb.getOutputById.mockResolvedValue({ ...output, status: 'approved' });

      await (service as any).processEdit(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      // Verify status updates
      expect(mockDb.updateOutputStatus).toHaveBeenCalledWith(
        output.id,
        'editing',
      );

      // Verify editor called with proper context
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith({
        context: expect.objectContaining({
          provider: output.editor_llm_provider,
          model: output.editor_llm_model,
        }),
        userMessage: expect.any(String),
        callerName: expect.stringContaining('editor-clarity'),
      });

      // Verify content approved
      expect(mockDb.updateOutputAfterEdit).toHaveBeenCalledWith(
        output.id,
        output.content, // Content unchanged when approved
        'approved',
        expect.any(String),
        1, // Edit cycle incremented
        expect.any(Object),
      );
    });

    it('should request rewrite when content needs changes', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_edit',
        content: 'Draft content',
        edit_cycle: 0,
      });
      const editorPersonality = createMockPersonality('editor-clarity');
      const editorResponse =
        '**Decision**: REQUEST_CHANGES\n' +
        '**Feedback**: Needs more detail\n' +
        '**Revised Content**: Improved content with more detail';

      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getAgentPersonality.mockResolvedValue(editorPersonality);
      mockDb.getPromptData.mockResolvedValue({
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI' },
      });
      mockLLMClient.callLLM.mockResolvedValue({
        text: editorResponse,
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
          cost: 0.005,
        },
      });
      mockDb.getOutputById.mockResolvedValue({
        ...output,
        status: 'pending_rewrite',
      });

      await (service as any).processEdit(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      // Verify content marked for rewrite
      expect(mockDb.updateOutputAfterEdit).toHaveBeenCalledWith(
        output.id,
        expect.stringContaining('Improved content'),
        'pending_rewrite',
        expect.stringContaining('Needs more detail'),
        1,
        expect.any(Object),
      );
    });

    it('should mark as max_cycles_reached when edit limit exceeded', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_edit',
        content: 'Draft content',
        edit_cycle: 2, // One cycle before max (maxEditCycles = 3)
      });
      const editorPersonality = createMockPersonality('editor-clarity');
      const editorResponse =
        '**Decision**: REQUEST_CHANGES\n**Feedback**: Still needs work';

      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getAgentPersonality.mockResolvedValue(editorPersonality);
      mockDb.getPromptData.mockResolvedValue({
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI' },
      });
      mockLLMClient.callLLM.mockResolvedValue({
        text: editorResponse,
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
          cost: 0.005,
        },
      });
      mockDb.getOutputById.mockResolvedValue({
        ...output,
        status: 'max_cycles_reached',
      });

      await (service as any).processEdit(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      // Verify max cycles reached
      expect(mockDb.updateOutputAfterEdit).toHaveBeenCalledWith(
        output.id,
        expect.any(String),
        'max_cycles_reached',
        expect.any(String),
        3, // Edit cycle = maxEditCycles
        expect.any(Object),
      );
    });

    it('should throw error if editor personality not found', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_edit',
        content: 'Draft',
      });

      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getAgentPersonality.mockResolvedValue(null);

      await expect(
        (service as any).processEdit(
          taskId,
          mockContext,
          output,
          mockTaskConfig,
        ),
      ).rejects.toThrow('Editor personality not found');
    });
  });

  describe('processRewrite', () => {
    it('should successfully rewrite content based on feedback', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_rewrite',
        content: 'Original content',
        editor_feedback: 'Add more examples',
      });
      const writerPersonality = createMockPersonality('writer-creative');
      const revisedContent = 'Original content with added examples';

      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getAgentPersonality.mockResolvedValue(writerPersonality);
      mockLLMClient.callLLM.mockResolvedValue({
        text: revisedContent,
        usage: {
          promptTokens: 200,
          completionTokens: 400,
          totalTokens: 600,
          cost: 0.012,
        },
      });
      mockDb.getOutputById.mockResolvedValue({
        ...output,
        content: revisedContent,
      });

      await (service as any).processRewrite(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      // Verify status updates
      expect(mockDb.updateOutputStatus).toHaveBeenCalledWith(
        output.id,
        'rewriting',
      );

      // Verify LLM call includes feedback
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith({
        context: expect.objectContaining({
          provider: output.writer_llm_provider,
          model: output.writer_llm_model,
        }),
        userMessage: expect.stringContaining('Add more examples'),
        callerName: expect.stringContaining('rewrite'),
      });

      // Verify content updated and status reset to pending_edit
      expect(mockDb.updateOutputContent).toHaveBeenCalledWith(
        output.id,
        revisedContent,
        'pending_edit',
        expect.any(Object),
      );

      // Verify version saved with feedback
      expect(mockDb.saveOutputVersion).toHaveBeenCalledWith(
        output.id,
        taskId,
        revisedContent,
        'rewrite',
        'Add more examples',
        expect.any(Object),
      );
    });

    it('should throw error if writer personality not found', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_rewrite',
        content: 'Draft',
        editor_feedback: 'Feedback',
      });

      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getAgentPersonality.mockResolvedValue(null);

      await expect(
        (service as any).processRewrite(
          taskId,
          mockContext,
          output,
          mockTaskConfig,
        ),
      ).rejects.toThrow('Writer personality not found');
    });
  });

  describe('processEvaluation - Initial stage', () => {
    it('should successfully evaluate output in initial stage', async () => {
      const taskId = 'task-123';
      const evaluation = createMockEvaluation({ stage: 'initial' });
      const output = createMockOutput({ content: 'Content to evaluate' });
      const evaluatorPersonality = createMockPersonality('evaluator-quality');
      const evaluationResponse =
        '**Score**: 8\n**Reasoning**: Well-written and clear';

      mockDb.getAgentPersonality.mockResolvedValue(evaluatorPersonality);
      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getPromptData.mockResolvedValue({
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI', audience: 'Professionals', goal: 'Educate' },
      });
      mockLLMClient.callLLM.mockResolvedValue({
        text: evaluationResponse,
        usage: {
          promptTokens: 50,
          completionTokens: 150,
          totalTokens: 200,
          cost: 0.004,
        },
      });

      await (service as any).processEvaluation(
        taskId,
        mockContext,
        evaluation,
        mockTaskConfig,
        'initial',
      );

      // Verify evaluator called
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith({
        context: expect.objectContaining({
          provider: evaluation.evaluator_llm_provider,
          model: evaluation.evaluator_llm_model,
        }),
        userMessage: expect.any(String),
        callerName: expect.stringContaining('evaluator-quality:initial'),
      });

      // Verify evaluation saved
      expect(mockDb.updateEvaluation).toHaveBeenCalledWith(
        evaluation.id,
        8, // Score
        expect.stringContaining('Well-written'),
        'completed',
        undefined,
        undefined,
        expect.objectContaining({ tokensUsed: 200, cost: 0.004 }),
      );

      // Verify cost added to output
      expect(mockDb.addEvaluationCostToOutput).toHaveBeenCalledWith(
        evaluation.output_id,
        0.004,
        200,
      );

      // Verify progress emitted
      expect(mockObservability.emitProgress).toHaveBeenCalled();
    });
  });

  describe('processEvaluation - Final stage', () => {
    it('should successfully rank output in final stage', async () => {
      const taskId = 'task-123';
      const evaluation = createMockEvaluation({ stage: 'final' });
      const output = createMockOutput({
        content: 'Content to rank',
        is_finalist: true,
      });
      const evaluatorPersonality = createMockPersonality('evaluator-quality');
      const rankingResponse =
        '**Rank**: 1\n**Reasoning**: Best content overall';

      mockDb.getAgentPersonality.mockResolvedValue(evaluatorPersonality);
      mockDb.getOutputById.mockResolvedValue(output);
      mockDb.getPromptData.mockResolvedValue({
        contentTypeSlug: 'blog-post',
        promptData: { topic: 'AI', audience: 'Professionals', goal: 'Educate' },
      });
      mockLLMClient.callLLM.mockResolvedValue({
        text: rankingResponse,
        usage: {
          promptTokens: 75,
          completionTokens: 175,
          totalTokens: 250,
          cost: 0.005,
        },
      });

      await (service as any).processEvaluation(
        taskId,
        mockContext,
        evaluation,
        mockTaskConfig,
        'final',
      );

      // Verify ranking saved with weighted score
      expect(mockDb.updateEvaluation).toHaveBeenCalledWith(
        evaluation.id,
        1, // Rank
        expect.stringContaining('Best content'),
        'completed',
        1, // Rank
        100, // Weighted score for rank 1
        expect.objectContaining({ tokensUsed: 250, cost: 0.005 }),
      );
    });

    it('should handle evaluation failure gracefully', async () => {
      const taskId = 'task-123';
      const evaluation = createMockEvaluation({ stage: 'initial' });

      mockDb.getAgentPersonality.mockRejectedValue(new Error('Database error'));

      await (service as any).processEvaluation(
        taskId,
        mockContext,
        evaluation,
        mockTaskConfig,
        'initial',
      );

      // Verify evaluation marked as failed
      expect(mockDb.updateEvaluation).toHaveBeenCalledWith(
        evaluation.id,
        null,
        expect.stringContaining('Database error'),
        'failed',
      );
    });
  });

  describe('getNextWriteEditActions - Dual-track model', () => {
    it('should fill local slots only', async () => {
      const taskId = 'task-123';
      const runningCounts = { local: 0, cloud: 0 };
      const localOutput = createMockOutput({
        writer_llm_provider: 'ollama',
        status: 'pending_write',
      });

      mockDb.getNextOutputs
        .mockResolvedValueOnce([localOutput])
        .mockResolvedValueOnce([]);

      const actions = await (service as any).getNextWriteEditActions(
        taskId,
        mockExecutionConfig,
        runningCounts,
      );

      expect(actions).toHaveLength(1);
      expect(mockDb.getNextOutputs).toHaveBeenCalledWith(taskId, true, 1); // Local
      expect(mockDb.getNextOutputs).toHaveBeenCalledWith(taskId, false, 3); // Cloud
    });

    it('should respect maxLocalConcurrent limit', async () => {
      const taskId = 'task-123';
      const runningCounts = { local: 1, cloud: 0 }; // Already running 1 local

      mockDb.getNextOutputs.mockResolvedValue([]);

      await (service as any).getNextWriteEditActions(
        taskId,
        mockExecutionConfig,
        runningCounts,
      );

      // Should not request more local slots (maxLocalConcurrent = 1)
      expect(mockDb.getNextOutputs).not.toHaveBeenCalledWith(
        taskId,
        true,
        expect.any(Number),
      );
    });

    it('should respect maxCloudConcurrent limit', async () => {
      const taskId = 'task-123';
      const runningCounts = { local: 0, cloud: 3 }; // Already running 3 cloud

      mockDb.getNextOutputs.mockResolvedValue([]);

      await (service as any).getNextWriteEditActions(
        taskId,
        mockExecutionConfig,
        runningCounts,
      );

      // Should not request more cloud slots (maxCloudConcurrent = 3)
      expect(mockDb.getNextOutputs).not.toHaveBeenCalledWith(
        taskId,
        false,
        expect.any(Number),
      );
    });

    it('should fill both local and cloud slots concurrently', async () => {
      const taskId = 'task-123';
      const runningCounts = { local: 0, cloud: 1 };
      const localOutput = createMockOutput({ writer_llm_provider: 'ollama' });
      const cloudOutputs = [
        createMockOutput({ id: 'cloud-1', writer_llm_provider: 'anthropic' }),
        createMockOutput({ id: 'cloud-2', writer_llm_provider: 'anthropic' }),
      ];

      mockDb.getNextOutputs
        .mockResolvedValueOnce([localOutput])
        .mockResolvedValueOnce(cloudOutputs);

      const actions = await (service as any).getNextWriteEditActions(
        taskId,
        mockExecutionConfig,
        runningCounts,
      );

      expect(actions).toHaveLength(3); // 1 local + 2 cloud
      expect(mockDb.getNextOutputs).toHaveBeenCalledWith(taskId, true, 1);
      expect(mockDb.getNextOutputs).toHaveBeenCalledWith(taskId, false, 2); // 3 - 1 running
    });
  });

  describe('Prompt builders', () => {
    it('should build writer prompt with all context', () => {
      const personality = createMockPersonality('writer-creative');
      const promptData = {
        topic: 'AI in Healthcare',
        audience: 'Doctors',
        goal: 'Educate',
        tone: 'Professional',
        keyPoints: ['Diagnostics', 'Treatment'],
        constraints: 'Max 500 words',
        examples: 'Medical journal style',
        additionalContext: 'Focus on recent advances',
      };
      const contentTypeContext = 'Blog post guidelines';

      const prompt = (service as any).buildWriterPrompt(
        personality,
        promptData,
        contentTypeContext,
      );

      expect(prompt).toContain('You are a writer-creative agent');
      expect(prompt).toContain('Blog post guidelines');
      expect(prompt).toContain('AI in Healthcare');
      expect(prompt).toContain('Doctors');
      expect(prompt).toContain('Educate');
      expect(prompt).toContain('Professional');
      expect(prompt).toContain('Diagnostics');
      expect(prompt).toContain('Treatment');
      expect(prompt).toContain('Max 500 words');
      expect(prompt).toContain('Medical journal style');
      expect(prompt).toContain('Focus on recent advances');
    });

    it('should build editor prompt with review criteria', () => {
      const personality = createMockPersonality('editor-clarity');
      const content = 'Draft content here';
      const promptData = {
        topic: 'AI',
        audience: 'Professionals',
        goal: 'Inform',
        tone: 'Formal',
      };

      const prompt = (service as any).buildEditorPrompt(
        personality,
        content,
        promptData,
      );

      expect(prompt).toContain('You are a editor-clarity agent');
      expect(prompt).toContain('clarity');
      expect(prompt).toContain('accuracy');
      expect(prompt).toContain('Content meets quality standards');
      expect(prompt).toContain('Draft content here');
      expect(prompt).toContain('APPROVE or REQUEST_CHANGES');
    });

    it('should build rewrite prompt with feedback', () => {
      const personality = createMockPersonality('writer-creative');
      const currentContent = 'Original draft';
      const editorFeedback = 'Add more examples and improve clarity';

      const prompt = (service as any).buildRewritePrompt(
        personality,
        currentContent,
        editorFeedback,
      );

      expect(prompt).toContain('You are a writer-creative agent');
      expect(prompt).toContain('Original draft');
      expect(prompt).toContain('Add more examples and improve clarity');
      expect(prompt).toContain('revise the content');
    });

    it('should build initial evaluation prompt with criteria', () => {
      const personality = createMockPersonality('evaluator-quality');
      const content = 'Content to evaluate';
      const promptData = {
        topic: 'AI',
        audience: 'Developers',
        goal: 'Educate',
      };

      const prompt = (service as any).buildInitialEvaluationPrompt(
        personality,
        content,
        promptData,
      );

      expect(prompt).toContain('You are a evaluator-quality agent');
      expect(prompt).toContain('High quality content');
      expect(prompt).toContain('Content to evaluate');
      expect(prompt).toContain('Score this content from 1-10');
    });

    it('should build final ranking prompt', () => {
      const personality = createMockPersonality('evaluator-quality');
      const content = 'Finalist content';
      const promptData = {
        topic: 'AI',
        audience: 'Professionals',
        goal: 'Inform',
      };

      const prompt = (service as any).buildFinalRankingPrompt(
        personality,
        content,
        promptData,
      );

      expect(prompt).toContain('FINAL RANKING ROUND');
      expect(prompt).toContain('rank from 1-5');
      expect(prompt).toContain('Rank 1 = 100 points');
      expect(prompt).toContain('Finalist content');
    });
  });

  describe('Response parsers', () => {
    it('should parse editor approval', () => {
      const response = '**Decision**: APPROVE\n**Feedback**: Excellent work!';
      const originalContent = 'Original content';

      const result = (service as any).parseEditorResponse(
        response,
        originalContent,
      );

      expect(result.approved).toBe(true);
      expect(result.feedback).toContain('Excellent work');
      expect(result.revisedContent).toBe(originalContent);
    });

    it('should parse editor rejection with revised content', () => {
      const response =
        '**Decision**: REQUEST_CHANGES\n' +
        '**Feedback**: Needs improvement\n' +
        '**Revised Content**: Improved version';
      const originalContent = 'Original content';

      const result = (service as any).parseEditorResponse(
        response,
        originalContent,
      );

      expect(result.approved).toBe(false);
      expect(result.feedback).toContain('Needs improvement');
      expect(result.revisedContent).toContain('Improved version');
    });

    it('should parse initial evaluation score', () => {
      const response = '**Score**: 8\n**Reasoning**: Well-written and clear';

      const result = (service as any).parseInitialEvaluationResponse(response);

      expect(result.score).toBe(8);
      expect(result.reasoning).toContain('Well-written');
    });

    it('should clamp initial evaluation score to 1-10 range', () => {
      const responseHigh = '**Score**: 15\n**Reasoning**: Amazing';
      const responseLow = '**Score**: 0\n**Reasoning**: Poor';

      const resultHigh = (service as any).parseInitialEvaluationResponse(
        responseHigh,
      );
      const resultLow = (service as any).parseInitialEvaluationResponse(
        responseLow,
      );

      expect(resultHigh.score).toBe(10); // Clamped to max
      expect(resultLow.score).toBe(1); // Clamped to min (0 rounds to 1)
    });

    it('should parse final ranking', () => {
      const response =
        '**Rank**: 2\n**Reasoning**: Strong content, but not the best';

      const result = (service as any).parseFinalRankingResponse(response);

      expect(result.rank).toBe(2);
      expect(result.reasoning).toContain('Strong content');
    });

    it('should clamp final ranking to 1-5 range', () => {
      const responseHigh = '**Rank**: 10\n**Reasoning**: Best';
      const responseLow = '**Rank**: 0\n**Reasoning**: Worst';

      const resultHigh = (service as any).parseFinalRankingResponse(
        responseHigh,
      );
      const resultLow = (service as any).parseFinalRankingResponse(responseLow);

      expect(resultHigh.rank).toBe(5); // Clamped to max
      expect(resultLow.rank).toBe(1); // Clamped to min
    });

    it('should convert rank to weighted score correctly', () => {
      expect((service as any).rankToWeightedScore(1)).toBe(100);
      expect((service as any).rankToWeightedScore(2)).toBe(60);
      expect((service as any).rankToWeightedScore(3)).toBe(30);
      expect((service as any).rankToWeightedScore(4)).toBe(10);
      expect((service as any).rankToWeightedScore(5)).toBe(5);
      expect((service as any).rankToWeightedScore(999)).toBe(0); // Invalid rank
    });
  });

  describe('Error handling in processWriteEditAction', () => {
    it('should mark output as failed on write error', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({ status: 'pending_write' });
      const writerPersonality = createMockPersonality('writer-creative');

      // Mock successful initial status update and emitOutputUpdated (which needs personality)
      mockDb.updateOutputStatus.mockResolvedValue(undefined);

      // First call to getAgentPersonality (in emitOutputUpdated) succeeds
      // Second call (in processWrite) fails
      mockDb.getAgentPersonality
        .mockResolvedValueOnce(writerPersonality) // For first emitOutputUpdated
        .mockResolvedValueOnce(null) // For second emitOutputUpdated (editor)
        .mockRejectedValueOnce(new Error('Personality not found')); // For processWrite

      mockObservability.emitProgress.mockResolvedValue(undefined);

      // Should not throw - errors are caught
      await (service as any).processWriteEditAction(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      // Verify status was first set to "writing", then to "failed"
      expect(mockDb.updateOutputStatus).toHaveBeenCalledWith(
        output.id,
        'writing',
      );
      expect(mockDb.updateOutputStatus).toHaveBeenCalledWith(
        output.id,
        'failed',
        expect.objectContaining({
          llm_metadata: expect.objectContaining({
            error: expect.stringContaining('Personality not found'),
          }),
        }),
      );

      // Verify progress emitted for both status updates
      expect(mockObservability.emitProgress).toHaveBeenCalled();
    });

    it('should mark output as failed on edit error', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_edit',
        content: 'Draft',
      });

      mockDb.getOutputById.mockRejectedValue(new Error('Database error'));

      await (service as any).processWriteEditAction(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      expect(mockDb.updateOutputStatus).toHaveBeenCalledWith(
        output.id,
        'failed',
        expect.objectContaining({
          llm_metadata: expect.objectContaining({
            error: expect.stringContaining('Database error'),
          }),
        }),
      );
    });

    it('should mark output as failed on rewrite error', async () => {
      const taskId = 'task-123';
      const output = createMockOutput({
        status: 'pending_rewrite',
        content: 'Draft',
        editor_feedback: 'Feedback',
      });

      mockDb.getOutputById.mockRejectedValue(new Error('Output not found'));

      await (service as any).processWriteEditAction(
        taskId,
        mockContext,
        output,
        mockTaskConfig,
      );

      expect(mockDb.updateOutputStatus).toHaveBeenCalledWith(
        output.id,
        'failed',
        expect.objectContaining({
          llm_metadata: expect.objectContaining({
            error: expect.stringContaining('Output not found'),
          }),
        }),
      );
    });
  });
});
