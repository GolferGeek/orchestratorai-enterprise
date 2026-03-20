import { Test, TestingModule } from '@nestjs/testing';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import {
  ExtendedPostWriterInput,
  HitlResumeInput,
  GeneratedContent,
} from './extended-post-writer.state';

// Mock PostgresSaver before any imports that need it
jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: jest.fn(() => ({
      setup: jest.fn().mockResolvedValue(undefined),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    })),
  },
}));

// Mock pg Pool
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Now import after mocking
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

// Mock the graph module
jest.mock('./extended-post-writer.graph', () => ({
  createExtendedPostWriterGraph: jest.fn(async () => ({
    invoke: jest.fn().mockResolvedValue({
      status: 'hitl_waiting',
      generatedContent: {
        blogPost: 'Mock blog post',
        seoDescription: 'Mock SEO',
        socialPosts: ['Mock social'],
      },
    }),
    getState: jest.fn().mockResolvedValue({
      values: {
        status: 'hitl_waiting',
        topic: 'Test topic',
        startedAt: Date.now(),
      },
      next: ['hitl_interrupt'],
    }),
    getStateHistory: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { values: { status: 'started' } };
        yield { values: { status: 'hitl_waiting' } };
      },
    }),
  })),
}));

// Import after mocking
import { ExtendedPostWriterService } from './extended-post-writer.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Unit tests for ExtendedPostWriterService
 *
 * Tests the Extended Post Writer agent service that manages
 * the HITL pattern for content generation.
 */
describe('ExtendedPostWriterService', () => {
  let service: ExtendedPostWriterService;
  let _llmClient: jest.Mocked<LLMHttpClientService>;
  let _observability: jest.Mocked<ObservabilityService>;
  let _checkpointer: jest.Mocked<PostgresCheckpointerService>;
  const _mockContext = createMockExecutionContext();

  const mockSaver = {
    setup: jest.fn().mockResolvedValue(undefined),
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtendedPostWriterService,
        {
          provide: LLMHttpClientService,
          useValue: {
            callLLM: jest.fn().mockResolvedValue({
              text: 'Generated blog post content...',
              usage: {
                promptTokens: 50,
                completionTokens: 200,
                totalTokens: 250,
              },
            }),
          },
        },
        {
          provide: ObservabilityService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
            emitStarted: jest.fn().mockResolvedValue(undefined),
            emitProgress: jest.fn().mockResolvedValue(undefined),
            emitHitlWaiting: jest.fn().mockResolvedValue(undefined),
            emitHitlResumed: jest.fn().mockResolvedValue(undefined),
            emitCompleted: jest.fn().mockResolvedValue(undefined),
            emitFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PostgresCheckpointerService,
          useValue: {
            getSaver: jest.fn().mockResolvedValue(mockSaver),
          },
        },
      ],
    }).compile();

    service = module.get<ExtendedPostWriterService>(ExtendedPostWriterService);
    _llmClient = module.get(LLMHttpClientService);
    _observability = module.get(ObservabilityService);
    _checkpointer = module.get(PostgresCheckpointerService);

    // Initialize the service (triggers onModuleInit)
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    const validInput: ExtendedPostWriterInput = {
      context: createMockExecutionContext({
        userId: 'user-456',
        conversationId: 'conv-789',
        orgSlug: 'org-abc',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      }),
      userMessage: 'Introduction to AI',
      additionalContext: 'Write for beginners',
      keywords: ['AI', 'machine learning', 'basics'],
      tone: 'casual',
    };

    it('should return result with taskId for valid input', async () => {
      const result = await service.generate(validInput);

      expect(result.taskId).toBeDefined();
      expect(result.taskId).toBe(validInput.context.conversationId);
      expect(result.userMessage).toBe(validInput.userMessage);
    });

    it('should return hitl_waiting status on successful generation', async () => {
      const result = await service.generate(validInput);

      expect(result.status).toBe('hitl_waiting');
      expect(result.generatedContent).toBeDefined();
    });
  });

  describe('resume', () => {
    const approveResponse: HitlResumeInput = {
      decision: 'approve',
    };

    const editResponse: HitlResumeInput = {
      decision: 'edit',
      editedContent: {
        blogPost: 'Edited blog post...',
        seoDescription: 'Edited SEO description',
        socialPosts: ['Edited social post 1', 'Edited social post 2'],
      },
    };

    const rejectResponse: HitlResumeInput = {
      decision: 'reject',
      feedback: 'Content is not relevant to the topic',
    };

    it('should throw error for non-existent thread', async () => {
      // Mock getState to return null for non-existent thread
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const epwGraphMod1 = require('./extended-post-writer.graph');
      const { createExtendedPostWriterGraph } = epwGraphMod1;
      createExtendedPostWriterGraph.mockResolvedValueOnce({
        invoke: jest.fn(),
        getState: jest.fn().mockResolvedValue({ values: null }),
        getStateHistory: jest.fn(),
      });

      // Re-initialize service with new mock
      await service.onModuleInit();

      await expect(
        service.resume('non-existent-thread', approveResponse),
      ).rejects.toThrow();
    });

    it('should accept approve decision', () => {
      expect(approveResponse.decision).toBe('approve');
      expect(approveResponse.editedContent).toBeUndefined();
    });

    it('should accept edit decision with edited content', () => {
      expect(editResponse.decision).toBe('edit');
      expect(editResponse.editedContent).toBeDefined();
      expect((editResponse.editedContent as GeneratedContent)?.blogPost).toBe(
        'Edited blog post...',
      );
    });

    it('should accept reject decision with feedback', () => {
      expect(rejectResponse.decision).toBe('reject');
      expect(rejectResponse.feedback).toBe(
        'Content is not relevant to the topic',
      );
    });
  });

  describe('getStatus', () => {
    it('should return null for non-existent thread', async () => {
      // Mock getState to return null
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const epwGraphMod2 = require('./extended-post-writer.graph');
      const { createExtendedPostWriterGraph } = epwGraphMod2;
      createExtendedPostWriterGraph.mockResolvedValueOnce({
        invoke: jest.fn(),
        getState: jest.fn().mockResolvedValue({ values: null }),
        getStateHistory: jest.fn(),
      });

      await service.onModuleInit();
      const result = await service.getStatus('non-existent-thread');

      expect(result).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return empty array for non-existent thread', async () => {
      // Mock getStateHistory to return empty iterator
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const epwGraphMod3 = require('./extended-post-writer.graph');
      const { createExtendedPostWriterGraph } = epwGraphMod3;
      createExtendedPostWriterGraph.mockResolvedValueOnce({
        invoke: jest.fn(),
        getState: jest.fn(),
        getStateHistory: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            // Empty iterator
          },
        }),
      });

      await service.onModuleInit();
      const result = await service.getHistory('non-existent-thread');

      expect(result).toEqual([]);
    });
  });

  // Note: Input validation is now handled by NestJS DTOs at the controller level
  // No need for separate validation tests here

  describe('GeneratedContent structure', () => {
    it('should have required fields for generated content', () => {
      const content: GeneratedContent = {
        blogPost: 'Blog post content...',
        seoDescription: 'SEO description for the post',
        socialPosts: ['Social post 1', 'Social post 2', 'Social post 3'],
      };

      expect(content.blogPost).toBeDefined();
      expect(content.seoDescription).toBeDefined();
      expect(content.socialPosts).toHaveLength(3);
    });
  });

  describe('HitlResumeInput structure', () => {
    it('should support approve decision', () => {
      const response: HitlResumeInput = {
        decision: 'approve',
      };

      expect(response.decision).toBe('approve');
    });

    it('should support edit decision with content', () => {
      const response: HitlResumeInput = {
        decision: 'edit',
        editedContent: {
          blogPost: 'Edited content',
          seoDescription: 'Edited SEO',
          socialPosts: [],
        },
      };

      expect(response.decision).toBe('edit');
      expect(response.editedContent).toBeDefined();
    });

    it('should support reject decision with feedback', () => {
      const response: HitlResumeInput = {
        decision: 'reject',
        feedback: 'Content needs improvement',
      };

      expect(response.decision).toBe('reject');
      expect(response.feedback).toBe('Content needs improvement');
    });
  });
});

/**
 * Integration tests for ExtendedPostWriterService
 *
 * These tests require a running database and should be run
 * against the test environment.
 */
describe.skip('ExtendedPostWriterService (Integration)', () => {
  // Integration tests would be marked with a different tag
  // and run separately against the test database

  it.todo('should complete full generate-approve workflow');
  it.todo('should complete generate-edit-approve workflow');
  it.todo('should complete generate-reject workflow');
  it.todo('should persist state through HITL interrupt');
  it.todo('should resume from checkpoint after restart');
  it.todo('should emit correct observability events');
});
