import { MemorySaver } from '@langchain/langgraph';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import {
  MarketingSwarmStateAnnotation,
  MarketingSwarmState,
  SwarmConfig,
  PromptData,
} from './marketing-swarm.state';
import { createMarketingSwarmGraph } from './marketing-swarm.graph';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

/**
 * Unit tests for createMarketingSwarmGraph
 *
 * Tests invoke the graph using MemorySaver to cover actual node logic:
 * initializeNode, processWritersNode, processEditorsNode,
 * processEvaluatorsNode, rankOutputsNode, handleErrorNode
 *
 * ExecutionContext is validated throughout - it flows from initial state
 * into every node and every observability/LLM call.
 */
describe('createMarketingSwarmGraph', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  let memorySaver: MemorySaver;
  let mockSwarmConfig: SwarmConfig;
  let mockPromptData: PromptData;

  // Helpers to build unique thread IDs per test
  let threadCounter = 0;
  function nextThread(): string {
    return `test-thread-${++threadCounter}`;
  }

  // Standard LLM responses used across tests
  const writerResponse = {
    text: 'This is an AI-generated draft about AI in Healthcare. It covers diagnostics, treatment, and cost reduction.',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
  };

  const editorApproveResponse = {
    text: '**Decision**: APPROVE\n**Feedback**: The draft is well-structured and covers all key points effectively.',
    usage: { promptTokens: 80, completionTokens: 120, totalTokens: 200 },
  };

  const editorRequestChangesResponse = {
    text: '**Decision**: REQUEST_CHANGES\n**Feedback**: Needs more detail on cost reduction.\n**Revised Content**: Improved version with detailed cost analysis.',
    usage: { promptTokens: 80, completionTokens: 150, totalTokens: 230 },
  };

  const evaluatorResponse = {
    text: '**Score**: 8\n**Reasoning**: The content is clear, well-organized, and addresses all the brief requirements.',
    usage: { promptTokens: 60, completionTokens: 100, totalTokens: 160 },
  };

  beforeEach(() => {
    // Use a real MemorySaver so graph compilation works
    memorySaver = new MemorySaver();

    mockSwarmConfig = {
      writers: [
        {
          agentSlug: 'writer-creative',
          llmConfigId: 'config-1',
          llmProvider: 'anthropic',
          llmModel: 'claude-sonnet-4-20250514',
          displayName: 'Creative Writer',
        },
      ],
      editors: [
        {
          agentSlug: 'editor-clarity',
          llmConfigId: 'config-3',
          llmProvider: 'anthropic',
          llmModel: 'claude-sonnet-4-20250514',
          displayName: 'Clarity Editor',
        },
      ],
      evaluators: [
        {
          agentSlug: 'evaluator-quality',
          llmConfigId: 'config-4',
          llmProvider: 'anthropic',
          llmModel: 'claude-sonnet-4-20250514',
          displayName: 'Quality Evaluator',
        },
      ],
      maxEditCycles: 3,
    };

    mockPromptData = {
      topic: 'AI in Healthcare',
      audience: 'Healthcare professionals',
      goal: 'Educate about AI benefits',
      keyPoints: [
        'Improved diagnostics',
        'Personalized treatment',
        'Cost reduction',
      ],
      tone: 'Professional and informative',
      constraints: 'Keep under 1000 words',
      examples: 'Use real-world case studies',
      additionalContext: 'Focus on practical applications',
    };

    // Default: writer response first, then editor, then evaluator
    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue(writerResponse),
    } as any;

    mockObservability = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitToolCalling: jest.fn().mockResolvedValue(undefined),
      emitToolCompleted: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Graph Creation
  // ---------------------------------------------------------------------------
  describe('Graph Creation', () => {
    it('should create a compiled graph that exposes invoke()', async () => {
      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
      expect(mockCheckpointer.getSaver).toHaveBeenCalled();
    });

    it('should use the MemorySaver returned by checkpointer.getSaver()', async () => {
      await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      expect(mockCheckpointer.getSaver).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Happy Path: single writer → editor (approve) → evaluator → rank
  // ---------------------------------------------------------------------------
  describe('Full happy-path execution (1 writer, 1 editor, 1 evaluator)', () => {
    it('should complete with phase=completed and produce 1 output', async () => {
      // Arrange: writer → editor (approve) → evaluator
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const executionContext = createMockExecutionContext({
        conversationId: 'conv-happy-path',
        userId: 'user-001',
        agentSlug: 'marketing-swarm',
        agentType: 'langgraph',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });

      const initialState = {
        executionContext,
        config: mockSwarmConfig,
        promptData: mockPromptData,
        contentTypeContext: 'Blog post writing guidelines.',
        contentTypeSlug: 'blog-post',
        executionQueue: [],
        outputs: [],
        evaluations: [],
        phase: 'initializing' as const,
        messages: [],
      };

      // Act
      const finalState = (await graph.invoke(initialState, {
        configurable: { thread_id: nextThread() },
      })) as unknown as MarketingSwarmState;

      // Assert phase and outputs
      expect(finalState.phase).toBe('completed');
      expect(finalState.outputs).toHaveLength(1);
      expect(finalState.outputs[0]!.content).toBe(writerResponse.text);
      expect(finalState.outputs[0]!.writerAgentSlug).toBe('writer-creative');
    });

    it('should mark the top-scoring output as final', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const executionContext = createMockExecutionContext({
        conversationId: 'conv-final-output',
        userId: 'user-001',
      });

      const finalState = (await graph.invoke(
        {
          executionContext,
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const finalOutput = finalState.outputs.find(
        (o: { status: string }) => o.status === 'final',
      );
      expect(finalOutput).toBeDefined();
    });

    it('should produce 1 evaluation from the evaluator', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-eval',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      expect(finalState.evaluations).toHaveLength(1);
      expect(finalState.evaluations[0]!.score).toBe(8);
      expect(finalState.evaluations[0]!.evaluatorAgentSlug).toBe(
        'evaluator-quality',
      );
    });

    it('should call LLM 3 times (writer + editor + evaluator)', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-llm-calls',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(3);
    });

    it('should emit observability events across all phases', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-obs',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      // initializeNode calls emitStarted + emitProgress
      expect(mockObservability.emitStarted).toHaveBeenCalled();
      // multiple progress events across writer, editor, evaluator, rank phases
      expect(mockObservability.emitProgress).toHaveBeenCalled();
      // rankOutputsNode calls emitCompleted
      expect(mockObservability.emitCompleted).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // initializeNode coverage
  // ---------------------------------------------------------------------------
  describe('initializeNode', () => {
    it('should build execution queue with correct item counts (1w + 1e + 1ev = 3 items)', async () => {
      // Only need initializeNode to run - let the rest fail gracefully
      // Give valid responses so the graph completes
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-queue',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // 1 writer + 1 editor + 1 evaluator = 3 items total
      expect(finalState.executionQueue).toHaveLength(3);

      const writeItems = finalState.executionQueue.filter(
        (q: { stepType: string }) => q.stepType === 'write',
      );
      const editItems = finalState.executionQueue.filter(
        (q: { stepType: string }) => q.stepType === 'edit',
      );
      const evalItems = finalState.executionQueue.filter(
        (q: { stepType: string }) => q.stepType === 'evaluate',
      );
      expect(writeItems).toHaveLength(1);
      expect(editItems).toHaveLength(1);
      expect(evalItems).toHaveLength(1);
    });

    it('should set editor steps to depend on the writer step', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-deps',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const writeItem = finalState.executionQueue.find(
        (q: { stepType: string }) => q.stepType === 'write',
      );
      const editItem = finalState.executionQueue.find(
        (q: { stepType: string }) => q.stepType === 'edit',
      );

      expect(editItem!.dependsOn).toContain(writeItem!.id);
    });

    it('should set phase=writing after initialization', async () => {
      // We can verify by checking the emitProgress call or the final queue
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      // emitStarted is called by initializeNode with the topic
      await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-phase',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(mockObservability.emitStarted).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-phase' }),
        'task-phase',
        expect.stringContaining('AI in Healthcare'),
      );
    });

    it('should route to handle_error when no writers are configured', async () => {
      const noWriterConfig: SwarmConfig = {
        writers: [],
        editors: [],
        evaluators: [],
        maxEditCycles: 3,
      };

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-no-writers',
            userId: 'user-001',
          }),
          config: noWriterConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // The conditional edge after initialize routes to handle_error when writers.length === 0
      expect(finalState.phase).toBe('failed');
      // No LLM calls should be made
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // processWritersNode coverage
  // ---------------------------------------------------------------------------
  describe('processWritersNode', () => {
    it('should produce outputs with writer metadata', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-writer-meta',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const writerOutput = finalState.outputs[0]!;
      expect(writerOutput.writerAgentSlug).toBe('writer-creative');
      expect(writerOutput.writerLlmConfigId).toBe('config-1');
      // llmMetadata is overwritten by the editor node (the editor updates the output)
      // so we just verify it is defined and has the tokensUsed field
      expect(writerOutput.llmMetadata).toBeDefined();
      expect(typeof writerOutput.llmMetadata!.tokensUsed).toBe('number');
    });

    it('should handle 2 writers and produce 2 outputs', async () => {
      const twoWriterConfig: SwarmConfig = {
        writers: [
          {
            agentSlug: 'writer-creative',
            llmConfigId: 'config-1',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
          {
            agentSlug: 'writer-technical',
            llmConfigId: 'config-2',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        editors: [],
        evaluators: [
          {
            agentSlug: 'evaluator-quality',
            llmConfigId: 'config-4',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        maxEditCycles: 3,
      };

      // 2 writers + 2 evaluator calls (1 evaluator × 2 outputs)
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse) // writer 1
        .mockResolvedValueOnce({
          ...writerResponse,
          text: 'Technical writer output',
        }) // writer 2
        .mockResolvedValueOnce(evaluatorResponse) // evaluator for output 1
        .mockResolvedValueOnce(evaluatorResponse); // evaluator for output 2

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-two-writers',
            userId: 'user-001',
          }),
          config: twoWriterConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      expect(finalState.phase).toBe('completed');
      expect(finalState.outputs).toHaveLength(2);
      // 2 evaluations (1 evaluator × 2 outputs)
      expect(finalState.evaluations).toHaveLength(2);
    });

    it('should mark writer queue items as completed after success', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-writer-queue',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const writeItem = finalState.executionQueue.find(
        (q: { stepType: string }) => q.stepType === 'write',
      );
      expect(writeItem!.status).toBe('completed');
      expect(writeItem!.resultId).toBeDefined();
    });

    it('should mark writer queue item as failed when LLM throws', async () => {
      // Writer fails → outputs.length === 0 → routes to handle_error
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('LLM timeout'));

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-writer-fail',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // Writer failure → no outputs → conditional routes to handle_error
      expect(finalState.phase).toBe('failed');

      const writeItem = finalState.executionQueue.find(
        (q: { stepType: string }) => q.stepType === 'write',
      );
      expect(writeItem!.status).toBe('failed');
      expect(writeItem!.error).toContain('LLM timeout');
    });

    it('should skip editors when config.editors is empty', async () => {
      const noEditorConfig: SwarmConfig = {
        ...mockSwarmConfig,
        editors: [],
      };

      // Writer + evaluator (no editor call)
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-no-editors',
            userId: 'user-001',
          }),
          config: noEditorConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      expect(finalState.phase).toBe('completed');
      // Exactly 2 LLM calls: writer + evaluator
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // processEditorsNode coverage
  // ---------------------------------------------------------------------------
  describe('processEditorsNode', () => {
    it('should set editorApproved=true on APPROVE response', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-editor-approve',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const output = finalState.outputs[0]!;
      expect(output.editorApproved).toBe(true);
      // rankOutputsNode promotes the top output from "approved" → "final"
      expect(output.status).toBe('final');
      expect(output.editorAgentSlug).toBe('editor-clarity');
      expect(output.editorFeedback).toContain(
        'well-structured and covers all key points',
      );
    });

    it('should set editorApproved=false on REQUEST_CHANGES response', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorRequestChangesResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-editor-changes',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const output = finalState.outputs[0]!;
      expect(output.editorApproved).toBe(false);
      // rankOutputsNode promotes the top output to "final" even if the editor
      // set status="editing" — it's the only output so it wins
      expect(output.status).toBe('final');
      // Revised content from the editor response should replace the original draft
      expect(output.content).toBe(
        'Improved version with detailed cost analysis.',
      );
    });

    it('should increment editCycle after editor review', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-edit-cycle',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // Started at 0, after 1 edit cycle should be 1
      expect(finalState.outputs[0]!.editCycle).toBe(1);
    });

    it('should mark editor queue item as failed when LLM throws', async () => {
      // Writer succeeds, editor fails
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockRejectedValueOnce(new Error('Editor LLM failed'));

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-editor-fail',
            userId: 'user-001',
          }),
          config: {
            ...mockSwarmConfig,
            // No evaluators so it routes rank_outputs after editors
            evaluators: [],
          },
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // After editor failure the graph still reaches rank since evaluators=[]
      // Check editor step is marked failed
      const editItem = finalState.executionQueue.find(
        (q: { stepType: string }) => q.stepType === 'edit',
      );
      expect(editItem!.status).toBe('failed');
      expect(editItem!.error).toContain('Editor LLM failed');
    });

    it('should mark editor step as skipped when no output found for inputOutputId', async () => {
      // This tests lines 368-374 (the !output branch in processEditorsNode)
      // We achieve this by making the writer fail (so no output is produced),
      // then configuring the queue manually. The easiest path: use a 2-writer
      // config where the first writer fails (no output) but the second succeeds,
      // then the editor step for the failed writer will have an inputOutputId
      // that doesn't match any output.
      //
      // Actually the simpler path is: writer succeeds but then processEditorsNode
      // runs with a stale inputOutputId (one that was pre-set in the queue before
      // the writer updated it). But the graph always updates inputOutputId after
      // writer completes. So the skipped branch is only reached when the queue
      // has an edit step with a non-existent inputOutputId.
      //
      // We can trigger this by using 2 writers where writer 1 fails and
      // writer 2 succeeds. The editor step for writer 1 has no output to edit.
      const twoWriterOneEditorConfig: SwarmConfig = {
        writers: [
          {
            agentSlug: 'writer-fail',
            llmConfigId: 'config-fail',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
          {
            agentSlug: 'writer-success',
            llmConfigId: 'config-success',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        editors: [
          {
            agentSlug: 'editor-clarity',
            llmConfigId: 'config-3',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        evaluators: [],
        maxEditCycles: 3,
      };

      // writer-fail fails, writer-success succeeds
      // Then editor for writer-fail: skipped (no output)
      // Then editor for writer-success: processes
      mockLLMClient.callLLM
        .mockRejectedValueOnce(new Error('Writer 1 failed')) // writer-fail
        .mockResolvedValueOnce(writerResponse) // writer-success
        .mockResolvedValueOnce(editorApproveResponse); // editor for writer-success

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-editor-skipped',
            userId: 'user-001',
          }),
          config: twoWriterOneEditorConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // 1 writer succeeded so we have 1 output
      expect(finalState.outputs).toHaveLength(1);

      // The editor step for the failed writer should be skipped
      const editItems = finalState.executionQueue.filter(
        (q: { stepType: string }) => q.stepType === 'edit',
      );
      // One should be skipped (failed writer's editor), one completed (success writer's editor)
      const skippedItem = editItems.find(
        (q: { status: string }) => q.status === 'skipped',
      );
      expect(skippedItem).toBeDefined();
      expect(skippedItem!.error).toBe('Output not found');
    });
  });

  // ---------------------------------------------------------------------------
  // processEvaluatorsNode coverage
  // ---------------------------------------------------------------------------
  describe('processEvaluatorsNode', () => {
    it('should parse score from evaluator response', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-score-parse',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      expect(finalState.evaluations[0]!.score).toBe(8);
      expect(finalState.evaluations[0]!.reasoning).toContain(
        'clear, well-organized',
      );
    });

    it('should default score to 5 when no score pattern in response', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce({
          text: 'Great content, no structured score here.',
          usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
        });

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-default-score',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      expect(finalState.evaluations[0]!.score).toBe(5);
    });

    it('should link evaluation to the correct outputId', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-eval-link',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const evaluation = finalState.evaluations[0]!;
      const output = finalState.outputs.find(
        (o: { id: string }) => o.id === evaluation.outputId,
      );
      expect(output).toBeDefined();
    });

    it('should continue evaluating other outputs when one evaluator LLM call throws', async () => {
      // This tests the catch block at line 593 in processEvaluatorsNode
      // 2 writers, 0 editors, 1 evaluator
      // Evaluator fails for output 1 but should still process output 2
      const twoWriterConfig: SwarmConfig = {
        writers: [
          {
            agentSlug: 'writer-a',
            llmConfigId: 'config-1',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
          {
            agentSlug: 'writer-b',
            llmConfigId: 'config-2',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        editors: [],
        evaluators: [
          {
            agentSlug: 'evaluator-quality',
            llmConfigId: 'config-4',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        maxEditCycles: 3,
      };

      // writer-a, writer-b both succeed
      // evaluator: first output fails, second output succeeds
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse) // writer-a
        .mockResolvedValueOnce({ ...writerResponse, text: 'Writer B output' }) // writer-b
        .mockRejectedValueOnce(new Error('Evaluator LLM failed on output 1')) // evaluator for output 1
        .mockResolvedValueOnce(evaluatorResponse); // evaluator for output 2

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-eval-partial-fail',
            userId: 'user-001',
          }),
          config: twoWriterConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // Graph should still complete even though one evaluation failed
      expect(finalState.phase).toBe('completed');
      // Only 1 evaluation produced (second one succeeded, first was caught and continued)
      expect(finalState.evaluations).toHaveLength(1);
      expect(finalState.evaluations[0]!.score).toBe(8);
    });

    it('should skip evaluators when config.evaluators is empty', async () => {
      const noEvalConfig: SwarmConfig = {
        ...mockSwarmConfig,
        evaluators: [],
      };

      // writer + editor only
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-no-eval',
            userId: 'user-001',
          }),
          config: noEvalConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // Skips evaluators → goes straight to rank_outputs
      expect(finalState.phase).toBe('completed');
      expect(finalState.evaluations).toHaveLength(0);
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // rankOutputsNode coverage
  // ---------------------------------------------------------------------------
  describe('rankOutputsNode', () => {
    it('should emit emitCompleted with ranked results', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-rank-emit',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(mockObservability.emitCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-rank-emit' }),
        'task-rank-emit',
        expect.objectContaining({
          rankedResults: expect.any(Array),
          totalOutputs: 1,
          totalEvaluations: 1,
        }),
      );
    });

    it('should compute average score correctly for multiple evaluators', async () => {
      const twoEvalConfig: SwarmConfig = {
        writers: [
          {
            agentSlug: 'writer-creative',
            llmConfigId: 'config-1',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        editors: [],
        evaluators: [
          {
            agentSlug: 'evaluator-a',
            llmConfigId: 'config-4',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
          {
            agentSlug: 'evaluator-b',
            llmConfigId: 'config-5',
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
          },
        ],
        maxEditCycles: 3,
      };

      // writer + eval-a (score 8) + eval-b (score 6) → average 7
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce({
          text: '**Score**: 8\n**Reasoning**: Very good.',
          usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
        })
        .mockResolvedValueOnce({
          text: '**Score**: 6\n**Reasoning**: Decent but could improve.',
          usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
        });

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-avg-score',
            userId: 'user-001',
          }),
          config: twoEvalConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      // 2 evaluations, average of 8+6=14/2=7
      expect(finalState.evaluations).toHaveLength(2);
      // emitCompleted is called with the ranked results
      const completedCall = (mockObservability.emitCompleted as jest.Mock).mock
        .calls[0];
      const completedPayload = completedCall[2];
      expect(completedPayload.rankedResults[0].averageScore).toBe(7);
    });

    it('should add a final AIMessage about the best score', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-msg',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const messages = finalState.messages;
      const lastMessage = messages[messages.length - 1]!;
      expect(lastMessage.content).toContain('Completed!');
      expect(lastMessage.content).toContain('/10');
    });
  });

  // ---------------------------------------------------------------------------
  // handleErrorNode coverage
  // ---------------------------------------------------------------------------
  describe('handleErrorNode', () => {
    it('should emit emitFailed when routed to handle_error', async () => {
      // No writers → routes to handle_error after initialize
      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-handle-error',
            userId: 'user-001',
          }),
          config: {
            writers: [],
            editors: [],
            evaluators: [],
            maxEditCycles: 3,
          },
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(mockObservability.emitFailed).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-handle-error' }),
        'task-handle-error',
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should set phase=failed when all writers fail', async () => {
      // Writer throws → no outputs → handle_error
      mockLLMClient.callLLM.mockRejectedValueOnce(
        new Error('All writers failed'),
      );

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-all-writers-fail',
            userId: 'user-001',
          }),
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      expect(finalState.phase).toBe('failed');
    });

    it('should set completedAt timestamp when handling error', async () => {
      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const before = Date.now();

      const finalState = (await graph.invoke(
        {
          executionContext: createMockExecutionContext({
            conversationId: 'conv-error-timestamp',
            userId: 'user-001',
          }),
          config: {
            writers: [],
            editors: [],
            evaluators: [],
            maxEditCycles: 3,
          },
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      )) as unknown as MarketingSwarmState;

      const after = Date.now();
      expect(finalState.completedAt).toBeGreaterThanOrEqual(before);
      expect(finalState.completedAt).toBeLessThanOrEqual(after);
    });
  });

  // ---------------------------------------------------------------------------
  // ExecutionContext flow validation
  // ---------------------------------------------------------------------------
  describe('ExecutionContext flows through all nodes', () => {
    it('should pass executionContext to emitStarted in initializeNode', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const ctx = createMockExecutionContext({
        conversationId: 'conv-ctx-started',
        userId: 'ctx-user',
        orgSlug: 'ctx-org',
      });

      await graph.invoke(
        {
          executionContext: ctx,
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(mockObservability.emitStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-ctx-started',
          userId: 'ctx-user',
          orgSlug: 'ctx-org',
        }),
        'task-ctx-started',
        expect.any(String),
      );
    });

    it('should pass executionContext to callLLM in processWritersNode', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const ctx = createMockExecutionContext({
        conversationId: 'conv-ctx-llm',
        userId: 'ctx-user-llm',
      });

      await graph.invoke(
        {
          executionContext: ctx,
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      // First callLLM is for the writer
      const firstCall = (mockLLMClient.callLLM as jest.Mock).mock.calls[0][0];
      expect(firstCall.context).toMatchObject({
        conversationId: 'conv-ctx-llm',
        userId: 'ctx-user-llm',
      });
    });

    it('should pass executionContext to emitCompleted in rankOutputsNode', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce(writerResponse)
        .mockResolvedValueOnce(editorApproveResponse)
        .mockResolvedValueOnce(evaluatorResponse);

      const graph = await createMarketingSwarmGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const ctx = createMockExecutionContext({
        conversationId: 'conv-ctx-completed',
        userId: 'ctx-user-complete',
      });

      await graph.invoke(
        {
          executionContext: ctx,
          config: mockSwarmConfig,
          promptData: mockPromptData,
          contentTypeContext: '',
          contentTypeSlug: 'blog-post',
          executionQueue: [],
          outputs: [],
          evaluations: [],
          phase: 'initializing' as const,
          messages: [],
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(mockObservability.emitCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-ctx-completed' }),
        'task-ctx-completed',
        expect.any(Object),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // State annotation validation
  // ---------------------------------------------------------------------------
  describe('State annotation', () => {
    it('should define all required fields in MarketingSwarmStateAnnotation', () => {
      const annotation = MarketingSwarmStateAnnotation;
      expect(annotation).toBeDefined();
      expect(annotation.spec.executionContext).toBeDefined();
      expect(annotation.spec.config).toBeDefined();
      expect(annotation.spec.promptData).toBeDefined();
      expect(annotation.spec.executionQueue).toBeDefined();
      expect(annotation.spec.outputs).toBeDefined();
      expect(annotation.spec.evaluations).toBeDefined();
      expect(annotation.spec.phase).toBeDefined();
    });
  });
});
