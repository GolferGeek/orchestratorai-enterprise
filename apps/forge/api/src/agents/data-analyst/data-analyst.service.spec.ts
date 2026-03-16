import { Test, TestingModule } from '@nestjs/testing';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { DataAnalystInput } from './data-analyst.state';

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
    query: jest.fn().mockResolvedValue({ rows: [] }),
  })),
}));

// Now import after mocking
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import {
  ListTablesTool,
  DescribeTableTool,
  SqlQueryTool,
} from '../shared/tools/data/database';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

// Mock the graph module
jest.mock('./data-analyst.graph', () => ({
  createDataAnalystGraph: jest.fn(async () => ({
    invoke: jest.fn().mockResolvedValue({
      status: 'completed',
      summary: 'There are 100 users in the database.',
      generatedSql: 'SELECT COUNT(*) FROM users',
      sqlResults: 'count: 100',
    }),
    getState: jest.fn().mockResolvedValue({
      values: {
        status: 'completed',
        question: 'How many users?',
        summary: 'There are 100 users.',
      },
      next: [],
    }),
    getStateHistory: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { values: { status: 'started' } };
        yield { values: { status: 'completed' } };
      },
    }),
  })),
}));

// Import after mocking
import { DataAnalystService } from './data-analyst.service';

/**
 * Unit tests for DataAnalystService
 *
 * Tests the Data Analyst agent service that manages
 * the tool-calling pattern for database queries.
 */
describe('DataAnalystService', () => {
  let service: DataAnalystService;
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
        DataAnalystService,
        {
          provide: LLMHttpClientService,
          useValue: {
            callLLM: jest.fn().mockResolvedValue({
              text: 'Mocked LLM response',
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            }),
          },
        },
        {
          provide: ObservabilityService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
            emitStarted: jest.fn().mockResolvedValue(undefined),
            emitProgress: jest.fn().mockResolvedValue(undefined),
            emitToolCalling: jest.fn().mockResolvedValue(undefined),
            emitToolCompleted: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: ListTablesTool,
          useValue: {
            execute: jest.fn().mockResolvedValue('Tables: users, orders'),
            createTool: jest.fn().mockReturnValue({
              invoke: jest.fn().mockResolvedValue('Tables list'),
            }),
          },
        },
        {
          provide: DescribeTableTool,
          useValue: {
            execute: jest
              .fn()
              .mockResolvedValue('Schema: id INT, name VARCHAR'),
            createTool: jest.fn().mockReturnValue({
              invoke: jest.fn().mockResolvedValue('Schema info'),
            }),
          },
        },
        {
          provide: SqlQueryTool,
          useValue: {
            executeSql: jest.fn().mockResolvedValue('count: 100'),
            createTool: jest.fn().mockReturnValue({
              invoke: jest.fn().mockResolvedValue('Query result'),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DataAnalystService>(DataAnalystService);
    _llmClient = module.get(LLMHttpClientService);
    _observability = module.get(ObservabilityService);
    _checkpointer = module.get(PostgresCheckpointerService);

    // Initialize the service (triggers onModuleInit)
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyze', () => {
    const validInput: DataAnalystInput = {
      context: createMockExecutionContext({
        conversationId: 'conv-123',
        userId: 'user-456',
        conversationId: 'conv-789',
        orgSlug: 'org-abc',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      }),
      userMessage: 'How many users are there?',
    };

    it('should return result with taskId for valid input', async () => {
      const result = await service.analyze(validInput);

      expect(result.conversationId).toBeDefined();
      expect(result.conversationId).toBe(validInput.context.conversationId);
      expect(result.userMessage).toBe(validInput.userMessage);
    });

    it('should return completed status on successful analysis', async () => {
      const result = await service.analyze(validInput);

      expect(result.status).toBe('completed');
      expect(result.summary).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return null for non-existent thread', async () => {
      // Mock getState to return null
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const daGraphMod1 = require('./data-analyst.graph');
      const { createDataAnalystGraph } = daGraphMod1;
      createDataAnalystGraph.mockResolvedValueOnce({
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
      const daGraphMod2 = require('./data-analyst.graph');
      const { createDataAnalystGraph } = daGraphMod2;
      createDataAnalystGraph.mockResolvedValueOnce({
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
});

/**
 * Integration tests for DataAnalystService
 *
 * These tests require a running database and should be run
 * against the test environment.
 */
describe.skip('DataAnalystService (Integration)', () => {
  // Integration tests would be marked with a different tag
  // and run separately against the test database

  it.todo('should complete full analysis workflow');
  it.todo('should discover tables from database');
  it.todo('should generate and execute SQL queries');
  it.todo('should handle database connection errors');
  it.todo('should track state through checkpointer');
});
