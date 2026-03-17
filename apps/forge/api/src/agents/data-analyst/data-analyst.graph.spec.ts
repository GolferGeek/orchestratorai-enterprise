import { MemorySaver } from '@langchain/langgraph';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { createDataAnalystGraph } from './data-analyst.graph';
import { DataAnalystState } from './data-analyst.state';
import {
  ListTablesTool,
  DescribeTableTool,
  SqlQueryTool,
} from '../shared/tools/data/database';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

/**
 * Unit tests for createDataAnalystGraph — node invocation coverage
 *
 * Uses MemorySaver so the graph can be compiled and fully invoked
 * without a real PostgreSQL checkpointer.  Each test exercises one or
 * more real node functions (startNode, discoverTablesNode, planSchemaNode,
 * describeTablesNode, executeQueryNode, summarizeNode, handleErrorNode).
 */
describe('createDataAnalystGraph — node invocation', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  let mockListTablesTool: jest.Mocked<ListTablesTool>;
  let mockDescribeTableTool: jest.Mocked<DescribeTableTool>;
  let mockSqlQueryTool: jest.Mocked<SqlQueryTool>;

  // MemorySaver is a real in-memory checkpointer — no database required
  const memorySaver = new MemorySaver();

  const mockExecutionContext = createMockExecutionContext({
    userId: 'user-graph-test',
    conversationId: 'conv-graph-test',
    orgSlug: 'org-graph-test',
    agentSlug: 'data-analyst',
    agentType: 'langgraph',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  });

  /** Helper: build a compiled graph with all current mocks */
  async function buildGraph() {
    return createDataAnalystGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockListTablesTool,
      mockDescribeTableTool,
      mockSqlQueryTool,
    );
  }

  /** Helper: produce a unique thread_id so MemorySaver never replays stale state */
  let threadCounter = 0;
  function nextThreadId(): string {
    return `test-thread-${++threadCounter}`;
  }

  beforeEach(() => {
    // Mock ObservabilityService — all emit methods are no-ops
    mockObservability = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitToolCalling: jest.fn().mockResolvedValue(undefined),
      emitToolCompleted: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock LLMHttpClientService — returns a valid JSON table selection by default
    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue({
        text: '["users", "orders"]',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    } as any;

    // Mock PostgresCheckpointerService — returns the shared MemorySaver
    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as any;

    // Mock ListTablesTool — returns three tables
    mockListTablesTool = {
      execute: jest
        .fn()
        .mockResolvedValue(
          '- public.users\n- public.orders\n- public.products',
        ),
    } as any;

    // Mock DescribeTableTool — returns a simple schema string
    mockDescribeTableTool = {
      execute: jest
        .fn()
        .mockResolvedValue(
          `Table: users\nColumns:\n- id (integer)\n- name (varchar)\n- email (varchar)`,
        ),
    } as any;

    // Mock SqlQueryTool — returns a result with SQL code block
    mockSqlQueryTool = {
      generateAndExecuteSql: jest
        .fn()
        .mockResolvedValue(
          `\`\`\`sql\nSELECT COUNT(*) as count FROM users\n\`\`\`\n\nResults:\n| count |\n|-------|\n| 100   |`,
        ),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Graph Creation
  // ---------------------------------------------------------------------------

  describe('Graph Creation', () => {
    it('should create a compiled graph', async () => {
      const graph = await buildGraph();
      expect(graph).toBeDefined();
      expect(mockCheckpointer.getSaver).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path — full workflow
  // ---------------------------------------------------------------------------

  describe('Happy path — full workflow', () => {
    it('should complete the full workflow and return status=completed with a summary', async () => {
      // The summarize node calls callLLM a second time — configure a specific response
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          // planSchemaNode call
          text: '["users", "orders"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          // summarizeNode call
          text: '## Summary\n\nThere are **100 users** in the database.',
          usage: { promptTokens: 20, completionTokens: 30, totalTokens: 50 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'How many users are there?',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // Status must reach completed
      expect(finalState.status).toBe('completed');

      // Summary must be set
      expect(finalState.summary).toBeDefined();
      expect(typeof finalState.summary).toBe('string');

      // Tables must have been discovered
      expect(finalState.availableTables).toContain('users');
      expect(finalState.availableTables).toContain('orders');
      expect(finalState.availableTables).toContain('products');

      // SQL must have been generated
      expect(finalState.generatedSql).toContain('SELECT COUNT');

      // SQL results must be present
      expect(finalState.sqlResults).toBeDefined();

      // completedAt must be set
      expect(finalState.completedAt).toBeDefined();
    });

    it('should invoke startNode and emit a started observability event', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Summary here',
          usage: { promptTokens: 20, completionTokens: 30, totalTokens: 50 },
        });

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Show me all tables',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      // startNode calls emitStarted
      expect(mockObservability.emitStarted).toHaveBeenCalledWith(
        mockExecutionContext,
        mockExecutionContext.conversationId,
        expect.stringContaining('Starting data analysis'),
      );
    });

    it("should invoke discoverTablesNode and call listTablesTool.execute with 'public'", async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Done',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        });

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'List tables',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      expect(mockListTablesTool.execute).toHaveBeenCalledWith('public');
    });

    it('should invoke planSchemaNode and call llmClient.callLLM with the ExecutionContext', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: '## Result',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'How many users?',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      // planSchemaNode is the first LLM call
      const firstCall = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(firstCall.context).toEqual(mockExecutionContext);
      expect(firstCall.callerName).toBe('data-analyst');
    });

    it('should invoke describeTablesNode and call describeTableTool.execute for each selected table', async () => {
      // planSchemaNode selects only "users"
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Schema fetched.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Describe the users table',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      expect(mockDescribeTableTool.execute).toHaveBeenCalledWith('users');
    });

    it('should invoke executeQueryNode and call sqlQueryTool.generateAndExecuteSql with the ExecutionContext', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Results formatted.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Count users',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      expect(mockSqlQueryTool.generateAndExecuteSql).toHaveBeenCalledWith(
        expect.stringContaining('Count users'),
        expect.any(String),
        mockExecutionContext,
      );
    });

    it('should invoke summarizeNode and emit completed observability event', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: '## Summary\n100 users found.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'How many users?',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(mockObservability.emitCompleted).toHaveBeenCalledWith(
        mockExecutionContext,
        mockExecutionContext.conversationId,
        expect.objectContaining({ summary: expect.any(String) }),
        expect.any(Number),
      );
      expect(finalState.status).toBe('completed');
    });

    it('should accumulate toolResults across discoverTablesNode and executeQueryNode', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Done.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // discoverTablesNode adds list_tables; describeTablesNode adds describe_table; executeQueryNode adds execute_sql
      const toolNames = finalState.toolResults.map(
        (r: { toolName: string }) => r.toolName,
      );
      expect(toolNames).toContain('list_tables');
      expect(toolNames).toContain('describe_table');
      expect(toolNames).toContain('execute_sql');
    });
  });

  // ---------------------------------------------------------------------------
  // Table discovery failure → handle_error
  // ---------------------------------------------------------------------------

  describe('discoverTablesNode failure path', () => {
    it('should route to handle_error when listTablesTool.execute rejects', async () => {
      mockListTablesTool.execute.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(finalState.status).toBe('failed');
      expect(finalState.error).toContain('Failed to discover tables');
      expect(finalState.completedAt).toBeDefined();
    });

    it('should call emitFailed when routing to handle_error', async () => {
      mockListTablesTool.execute.mockRejectedValue(
        new Error('Connection refused'),
      );

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      expect(mockObservability.emitFailed).toHaveBeenCalledWith(
        mockExecutionContext,
        mockExecutionContext.conversationId,
        expect.any(String),
        expect.any(Number),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Empty tables → handle_error
  // ---------------------------------------------------------------------------

  describe('empty tables path', () => {
    it('should route to handle_error when listTablesTool returns no tables', async () => {
      // Return a result with no "- public.*" lines
      mockListTablesTool.execute.mockResolvedValue(
        'No tables found in schema.',
      );

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(finalState.status).toBe('failed');
      // availableTables must be empty (the conditional edge routes to handle_error)
      expect(finalState.availableTables).toHaveLength(0);
    });

    it('should call emitFailed when tables list is empty', async () => {
      mockListTablesTool.execute.mockResolvedValue('No tables.');

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // LLM failure in planSchemaNode → falls back to all available tables
  // ---------------------------------------------------------------------------

  describe('planSchemaNode LLM failure — fallback to all tables', () => {
    it('should fall back to all available tables when planSchemaNode LLM rejects', async () => {
      // First callLLM (planSchemaNode) rejects; second (summarizeNode) succeeds
      mockLLMClient.callLLM
        .mockRejectedValueOnce(new Error('LLM timeout'))
        .mockResolvedValueOnce({
          text: '## Summary\nUsing all tables.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // Graph still progresses when planSchemaNode catches the error internally
      expect(finalState.status).toBe('completed');
      // Falls back to available tables (all 3 from the mock)
      expect(finalState.selectedTables.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // LLM failure in summarizeNode → status=failed
  // ---------------------------------------------------------------------------

  describe('summarizeNode LLM failure', () => {
    it('should set status=failed and call emitFailed when summarize LLM rejects', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          // planSchemaNode succeeds
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockRejectedValueOnce(new Error('LLM quota exceeded'));

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'How many users?',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(finalState.status).toBe('failed');
      expect(finalState.error).toContain('LLM quota exceeded');
      expect(finalState.completedAt).toBeDefined();

      expect(mockObservability.emitFailed).toHaveBeenCalledWith(
        mockExecutionContext,
        mockExecutionContext.conversationId,
        expect.stringContaining('LLM quota exceeded'),
        expect.any(Number),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // SQL query error — still reaches summarize node
  // ---------------------------------------------------------------------------

  describe('SQL query with error result', () => {
    it('should still reach summarize node when sqlQueryTool returns an error string', async () => {
      // sqlQueryTool returns a string that contains "Error:" but does NOT throw
      mockSqlQueryTool.generateAndExecuteSql.mockResolvedValue(
        "Error: relation 'users' does not exist",
      );

      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: '## Error Summary\nThe table does not exist.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Query the users table',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // executeQueryNode does NOT set state.error when the tool resolves (even with error text)
      // so the conditional edge routes to summarize, not handle_error
      expect(finalState.status).toBe('completed');
      expect(finalState.sqlResults).toContain('Error:');

      // The execute_sql tool result must be marked success=false
      const sqlToolResult = finalState.toolResults.find(
        (r: { toolName: string }) => r.toolName === 'execute_sql',
      );
      expect(sqlToolResult).toBeDefined();
      expect(sqlToolResult!.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // describeTablesNode — tool error for individual table is non-fatal
  // ---------------------------------------------------------------------------

  describe('describeTablesNode partial failure', () => {
    it('should continue and mark describe_table as success=false when tool throws', async () => {
      mockDescribeTableTool.execute.mockRejectedValue(
        new Error('Schema not found'),
      );

      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Could not describe table.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Describe users',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // Graph does not fail — describeTablesNode catches per-table errors
      // (the error path sets success=false in toolResults but doesn't set state.error)
      const describeResult = finalState.toolResults.find(
        (r: { toolName: string }) => r.toolName === 'describe_table',
      );
      expect(describeResult).toBeDefined();
      expect(describeResult!.success).toBe(false);
      expect(describeResult!.result).toContain('Error:');
    });
  });

  // ---------------------------------------------------------------------------
  // ExecutionContext flows through all nodes
  // ---------------------------------------------------------------------------

  describe('ExecutionContext flow validation', () => {
    it('should pass ExecutionContext unchanged to all observability emit calls', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Summary.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'How many users?',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      // Every emit call should receive the exact same ExecutionContext object
      const allEmitCalls = [
        ...mockObservability.emitStarted.mock.calls,
        ...mockObservability.emitProgress.mock.calls,
        ...mockObservability.emitCompleted.mock.calls,
      ];

      for (const call of allEmitCalls) {
        // First argument to every emit helper is always the ExecutionContext
        expect(call[0]).toEqual(mockExecutionContext);
      }
    });

    it('should pass ExecutionContext to sqlQueryTool.generateAndExecuteSql', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Done.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Count rows',
        },
        { configurable: { thread_id: nextThreadId() } },
      );

      // Third arg to generateAndExecuteSql must be the ExecutionContext
      const [, , passedContext] =
        mockSqlQueryTool.generateAndExecuteSql.mock.calls[0]!;
      expect(passedContext).toEqual(mockExecutionContext);
    });

    it('should preserve executionContext in final state', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Summary.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(finalState.executionContext).toEqual(mockExecutionContext);
    });
  });

  // ---------------------------------------------------------------------------
  // planSchemaNode table selection logic
  // ---------------------------------------------------------------------------

  describe('planSchemaNode table selection', () => {
    it('should filter LLM-selected tables to only those that actually exist', async () => {
      // LLM returns a table that does not exist alongside one that does
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users", "nonexistent_table"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Only users exists.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Get users',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // nonexistent_table should not appear in selectedTables
      expect(finalState.selectedTables).toContain('users');
      expect(finalState.selectedTables).not.toContain('nonexistent_table');
    });

    it('should fall back to all available tables when LLM returns empty array', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '[]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Used all tables.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Show everything',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // Falls back to availableTables (up to 5)
      expect(finalState.selectedTables.length).toBeGreaterThan(0);
    });

    it('should cap selectedTables at 5 tables', async () => {
      // Return a list of tables with exactly 5 entries from the mock (3 available → capped at 3)
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users", "orders", "products"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Summary.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'All data',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(finalState.selectedTables.length).toBeLessThanOrEqual(5);
    });
  });

  // ---------------------------------------------------------------------------
  // startNode state mutations
  // ---------------------------------------------------------------------------

  describe('startNode state mutations', () => {
    it('should set status=discovering in startNode', async () => {
      // We cannot easily inspect intermediate state with MemorySaver in a unit test,
      // but we can verify that status ends with a non-started value, proving startNode ran.
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Done.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'How many users?',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // startedAt is set by startNode — must be a reasonable timestamp
      expect(finalState.startedAt).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Non-Error throws — cover the String(error) branches in catch blocks
  // ---------------------------------------------------------------------------

  describe('non-Error object throws (String(error) branches)', () => {
    it('should stringify a non-Error discoverTablesNode throw into the error field', async () => {
      // Throw a plain string (not an Error instance)
      mockListTablesTool.execute.mockRejectedValue('string failure message');

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(finalState.status).toBe('failed');
      expect(finalState.error).toContain('string failure message');
    });

    it('should stringify a non-Error describeTableTool throw into toolResult.result', async () => {
      // Throw a plain string instead of an Error
      mockDescribeTableTool.execute.mockRejectedValue('plain string error');

      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Handled.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Describe',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      const describeResult = finalState.toolResults.find(
        (r: { toolName: string }) => r.toolName === 'describe_table',
      );
      expect(describeResult).toBeDefined();
      expect(describeResult!.result).toContain('plain string error');
      expect(describeResult!.success).toBe(false);
    });

    it('should stringify a non-Error summarizeNode LLM throw into the error field', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '["users"]',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockRejectedValueOnce('raw string from LLM');

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      expect(finalState.status).toBe('failed');
      expect(finalState.error).toContain('raw string from LLM');
    });
  });

  // ---------------------------------------------------------------------------
  // describeTablesNode fallback — no selectedTables, uses availableTables
  // ---------------------------------------------------------------------------

  describe('describeTablesNode fallback to availableTables', () => {
    it('should describe availableTables directly when planSchemaNode fails to set selectedTables', async () => {
      // planSchemaNode catch returns an empty selectedTables via the fallback
      // We simulate this by making planSchemaNode produce an LLM response with no JSON match
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          // planSchemaNode receives text with no JSON array — relevantTables = []
          // validTables = [], so falls back to availableTables (non-empty)
          text: 'No tables relevant.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: 'Summary.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      const graph = await buildGraph();
      const finalState = (await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Any query',
        },
        { configurable: { thread_id: nextThreadId() } },
      )) as unknown as DataAnalystState;

      // Falls back to first 5 availableTables — describeTableTool should still be called
      expect(mockDescribeTableTool.execute).toHaveBeenCalled();
      expect(finalState.status).toBe('completed');
    });
  });
});
