import { Test, TestingModule } from '@nestjs/testing';
import { RagAgentRunnerService } from './rag-agent-runner.service';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { LLMService } from '@llm/llm.service';
import { LLM_SERVICE } from '@/planes/llm/llm.interface';
import { PlansService } from '../plans/services/plans.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';
import { CollectionsService } from '@/rag/collections.service';
import { QueryService } from '@/rag/query.service';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('RagAgentRunnerService', () => {
  let service: RagAgentRunnerService;
  let collectionsService: jest.Mocked<CollectionsService>;
  let queryService: jest.Mocked<QueryService>;
  let llmService: jest.Mocked<LLMService>;
  let deliverablesService: jest.Mocked<DeliverablesService>;
  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagAgentRunnerService,
        {
          provide: CollectionsService,
          useValue: {
            getCollections: jest.fn(),
          },
        },
        {
          provide: QueryService,
          useValue: {
            queryCollection: jest.fn(),
          },
        },
        {
          provide: LLM_SERVICE,
          useValue: {
            generateResponse: jest.fn(),
            emitLlmObservabilityEvent: jest.fn(),
          },
        },
        {
          provide: ContextOptimizationService,
          useValue: {
            optimizeContext: jest.fn(),
          },
        },
        {
          provide: PlansService,
          useValue: {
            executeAction: jest.fn(),
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: DeliverablesService,
          useValue: {
            executeAction: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: Agent2AgentConversationsService,
          useValue: {
            findByConversationId: jest.fn(),
            updateConversation: jest.fn(),
          },
        },
        {
          provide: StreamingService,
          useValue: {
            sendUpdate: jest.fn(),
            emitProgress: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RagAgentRunnerService>(RagAgentRunnerService);
    collectionsService = module.get(CollectionsService);
    queryService = module.get(QueryService);
    llmService = module.get(LLM_SERVICE);
    deliverablesService = module.get(DeliverablesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ExecutionContext handling', () => {
    it('should pass ExecutionContext unchanged to deliverablesService', async () => {
      // Arrange
      const definition = {
        slug: 'hr-agent',
        displayName: 'HR Agent',
        agentType: 'rag',
        organizationSlug: 'human-resources',
        metadata: {
          raw: {
            rag_config: {
              collection_slug: 'hr-policy',
              top_k: 5,
            },
          },
        },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'What is the PTO policy?',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const collection = {
        id: 'coll-123',
        slug: 'hr-policy',
        name: 'HR Policy Collection',
        description: 'Company HR policies',
        organizationSlug: 'human-resources',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkOverlap: 50,
        status: 'active' as const,
        requiredRole: null,
        allowedUsers: null,
        complexityType: 'basic' as const,
        createdBy: 'user-123',
        documentCount: 10,
        chunkCount: 100,
        totalTokens: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const queryResults = {
        query: 'What is the PTO policy?',
        results: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentFilename: 'pto-policy.md',
            content: 'PTO policy content',
            score: 0.95,
            pageNumber: null,
            chunkIndex: 0,
          },
        ],
        totalResults: 1,
        searchDurationMs: 50,
      };

      collectionsService.getCollections.mockResolvedValue([collection]);
      queryService.queryCollection.mockResolvedValue(queryResults);
      llmService.generateResponse.mockResolvedValue({
        content: 'Our PTO policy allows...',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 1000,
          },
          status: 'completed',
        },
      });
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-123' },
          version: { id: 'ver-123' },
          isNew: true,
        },
      });

      // Act
      await service.execute(definition, request, mockContext.orgSlug);

      // Assert - Verify ExecutionContext passed to deliverablesService
      expect(deliverablesService.executeAction).toHaveBeenCalledWith(
        'create',
        expect.any(Object),
        mockContext,
      );
    });
  });

  describe('BUILD mode - RAG query and response', () => {
    it('should query collection and generate response', async () => {
      const definition = {
        slug: 'hr-agent',
        displayName: 'HR Assistant',
        agentType: 'rag',
        organizationSlug: 'human-resources',
        metadata: {
          raw: {
            rag_config: {
              collection_slug: 'hr-policy',
              top_k: 5,
              similarity_threshold: 0.7,
            },
          },
        },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'What is the remote work policy?',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const collection = {
        id: 'coll-123',
        slug: 'hr-policy',
        name: 'HR Policies',
        description: 'Company policies',
        organizationSlug: 'human-resources',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkOverlap: 50,
        status: 'active' as const,
        requiredRole: null,
        allowedUsers: null,
        complexityType: 'basic' as const,
        createdBy: 'user-123',
        documentCount: 10,
        chunkCount: 100,
        totalTokens: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const queryResults = {
        query: 'What is the remote work policy?',
        results: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentFilename: 'remote-work.md',
            content: 'Remote work is allowed 3 days per week',
            score: 0.9,
            pageNumber: null,
            chunkIndex: 0,
          },
          {
            chunkId: 'chunk-2',
            documentId: 'doc-2',
            documentFilename: 'work-hours.md',
            content: 'Core hours are 10am-4pm',
            score: 0.75,
            pageNumber: null,
            chunkIndex: 0,
          },
        ],
        totalResults: 2,
        searchDurationMs: 100,
      };

      collectionsService.getCollections.mockResolvedValue([collection]);
      queryService.queryCollection.mockResolvedValue(queryResults);
      llmService.generateResponse.mockResolvedValue({
        content: 'Our remote work policy allows employees...',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 1500,
          },
          status: 'completed',
        },
      });
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-123', content: 'Response content' },
          version: { id: 'ver-123' },
          isNew: true,
        },
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(collectionsService.getCollections).toHaveBeenCalledWith(
        'human-resources',
        'user-123',
      );
      expect(queryService.queryCollection).toHaveBeenCalledWith(
        'coll-123',
        'human-resources',
        expect.objectContaining({
          query: 'What is the remote work policy?',
          topK: 5,
          similarityThreshold: 0.7,
        }),
        'text-embedding-3-small',
      );
      expect(llmService.generateResponse).toHaveBeenCalled();
      expect(deliverablesService.executeAction).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({
          type: 'rag-response',
          format: 'markdown',
        }),
        mockContext,
      );
    });

    it('should handle missing RAG config', async () => {
      const definition = {
        slug: 'invalid-agent',
        agentType: 'rag',
        organizationSlug: 'human-resources',
        metadata: {}, // No rag_config
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Query something',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain('rag_config');
    });

    it('should handle collection not found or no access', async () => {
      const definition = {
        slug: 'hr-agent',
        agentType: 'rag',
        organizationSlug: 'human-resources',
        metadata: {
          raw: {
            rag_config: {
              collection_slug: 'restricted-collection',
              no_access_message: 'You do not have access to this collection',
            },
          },
        },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Query restricted data',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      // No collections returned - user doesn't have access
      collectionsService.getCollections.mockResolvedValue([]);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true); // Returns success but with no access message
      expect(result.payload?.content).toMatchObject({
        message: 'You do not have access to this collection',
        hasAccess: false,
      });
    });

    it('should handle no query results found', async () => {
      const definition = {
        slug: 'hr-agent',
        agentType: 'rag',
        organizationSlug: 'human-resources',
        metadata: {
          raw: {
            rag_config: {
              collection_slug: 'hr-policy',
              no_results_message: 'No relevant information found',
            },
          },
        },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Query unknown topic',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const collection = {
        id: 'coll-123',
        slug: 'hr-policy',
        name: 'HR Policies',
        description: null,
        organizationSlug: 'human-resources',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkOverlap: 50,
        status: 'active' as const,
        requiredRole: null,
        allowedUsers: null,
        complexityType: 'basic' as const,
        createdBy: 'user-123',
        documentCount: 10,
        chunkCount: 100,
        totalTokens: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      collectionsService.getCollections.mockResolvedValue([collection]);
      queryService.queryCollection.mockResolvedValue({
        query: 'Query unknown topic',
        results: [], // No results
        totalResults: 0,
        searchDurationMs: 50,
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.payload?.content).toMatchObject({
        message: 'No relevant information found',
        hasResults: false,
      });
      expect(llmService.generateResponse).not.toHaveBeenCalled(); // Should not call LLM if no results
    });

    it('should handle missing user message', async () => {
      const definition = {
        slug: 'hr-agent',
        agentType: 'rag',
        organizationSlug: 'human-resources',
        metadata: {
          raw: {
            rag_config: {
              collection_slug: 'hr-policy',
            },
          },
        },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: '', // Empty message
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const collection = {
        id: 'coll-123',
        slug: 'hr-policy',
        name: 'HR Policies',
        description: null,
        organizationSlug: 'human-resources',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkOverlap: 50,
        status: 'active' as const,
        requiredRole: null,
        allowedUsers: null,
        complexityType: 'basic' as const,
        createdBy: 'user-123',
        documentCount: 10,
        chunkCount: 100,
        totalTokens: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      collectionsService.getCollections.mockResolvedValue([collection]);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'User message is required',
      );
    });
  });

  describe('CONVERSE mode', () => {
    it('should query RAG and return conversational response', async () => {
      const definition = {
        slug: 'hr-agent',
        displayName: 'HR Assistant',
        agentType: 'rag',
        organizationSlug: 'human-resources',
        metadata: {
          raw: {
            rag_config: {
              collection_slug: 'hr-policy',
              top_k: 3,
            },
          },
        },
        capabilities: ['converse'],
        execution: { canConverse: true, canPlan: false, canBuild: false },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Tell me about the benefits',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const collection = {
        id: 'coll-123',
        slug: 'hr-policy',
        name: 'HR Policies',
        description: null,
        organizationSlug: 'human-resources',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkOverlap: 50,
        status: 'active' as const,
        requiredRole: null,
        allowedUsers: null,
        complexityType: 'basic' as const,
        createdBy: 'user-123',
        documentCount: 10,
        chunkCount: 100,
        totalTokens: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const queryResults = {
        query: 'Tell me about the benefits',
        results: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentFilename: 'benefits.md',
            content: 'Health insurance, 401k, etc.',
            score: 0.88,
            pageNumber: null,
            chunkIndex: 0,
          },
        ],
        totalResults: 1,
        searchDurationMs: 75,
      };

      collectionsService.getCollections.mockResolvedValue([collection]);
      queryService.queryCollection.mockResolvedValue(queryResults);
      llmService.generateResponse.mockResolvedValue({
        content: 'Our benefits package includes...',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 150, outputTokens: 80, totalTokens: 230 },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 1200,
          },
          status: 'completed',
        },
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.CONVERSE);
      expect(result.payload?.content).toMatchObject({
        message: expect.any(String),
        isConversational: true,
      });
      expect(queryService.queryCollection).toHaveBeenCalled();
      expect(llmService.generateResponse).toHaveBeenCalled();
    });
  });
});
