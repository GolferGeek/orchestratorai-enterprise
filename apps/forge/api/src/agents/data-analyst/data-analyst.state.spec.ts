import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import {
  DataAnalystStateAnnotation,
  DataAnalystState,
  DataAnalystInput,
  DataAnalystResult,
  DataAnalystStatus,
  ToolResult,
} from './data-analyst.state';

/**
 * Unit tests for Data Analyst State Annotation
 *
 * Tests state structure, interfaces, ExecutionContext handling, and type definitions.
 * Note: LangGraph's Annotation API doesn't expose default/reducer functions directly,
 * so we test the state structure and interfaces instead.
 */
describe('DataAnalystStateAnnotation', () => {
  describe('State Structure', () => {
    it('should have all required fields in spec', () => {
      expect(DataAnalystStateAnnotation.spec.messages).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.executionContext).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.userMessage).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.availableTables).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.selectedTables).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.tableSchemas).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.generatedSql).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.sqlResults).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.toolResults).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.summary).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.status).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.error).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.startedAt).toBeDefined();
      expect(DataAnalystStateAnnotation.spec.completedAt).toBeDefined();
    });

    it('should define a valid State type', () => {
      // Type-level test - if it compiles, it passes
      const state: DataAnalystState = {
        messages: [],
        executionContext: createMockExecutionContext(),
        userMessage: 'test message',
        availableTables: ['users'],
        selectedTables: ['users'],
        tableSchemas: { users: 'id (int), name (varchar)' },
        generatedSql: 'SELECT * FROM users',
        sqlResults: 'result data',
        toolResults: [],
        summary: 'Analysis summary',
        status: 'completed',
        error: undefined,
        startedAt: Date.now(),
        completedAt: Date.now(),
      };

      expect(state).toBeDefined();
      expect(state.executionContext).toBeDefined();
      expect(state.userMessage).toBe('test message');
      expect(state.status).toBe('completed');
    });
  });

  describe('ExecutionContext Integration', () => {
    it('should accept ExecutionContext with all required fields', () => {
      const context = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: 'test-user-id',
        conversationId: 'test-conversation-id',
        conversationId: 'test-conv-id',
        planId: 'test-plan-id',
        deliverableId: 'test-deliverable-id',
        agentSlug: 'data-analyst',
        agentType: 'langgraph',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });

      const state: DataAnalystState = {
        messages: [],
        executionContext: context,
        userMessage: 'test',
        availableTables: [],
        selectedTables: [],
        tableSchemas: {},
        generatedSql: undefined,
        sqlResults: undefined,
        toolResults: [],
        summary: undefined,
        status: 'started',
        error: undefined,
        startedAt: Date.now(),
        completedAt: undefined,
      };

      expect(state.executionContext.orgSlug).toBe('test-org');
      expect(state.executionContext.userId).toBe('test-user-id');
      expect(state.executionContext.conversationId).toBe(
        'test-conversation-id',
      );
      expect(state.executionContext.conversationId).toBe('test-task-id');
      expect(state.executionContext.planId).toBe('test-plan-id');
      expect(state.executionContext.deliverableId).toBe('test-deliverable-id');
      expect(state.executionContext.agentSlug).toBe('data-analyst');
      expect(state.executionContext.agentType).toBe('langgraph');
      expect(state.executionContext.provider).toBe('anthropic');
      expect(state.executionContext.model).toBe('claude-sonnet-4-20250514');
    });

    it('should pass ExecutionContext as whole capsule, not individual fields', () => {
      const context = createMockExecutionContext({
        userId: 'user-123',
        conversationId: 'conv-456',
        conversationId: 'conv-789',
      });

      const state: DataAnalystState = {
        messages: [],
        executionContext: context, // Full capsule, not destructured
        userMessage: 'test',
        availableTables: [],
        selectedTables: [],
        tableSchemas: {},
        generatedSql: undefined,
        sqlResults: undefined,
        toolResults: [],
        summary: undefined,
        status: 'started',
        error: undefined,
        startedAt: Date.now(),
        completedAt: undefined,
      };

      // Verify we can access all fields from the capsule
      expect(state.executionContext.userId).toBe('user-123');
      expect(state.executionContext.conversationId).toBe('conv-456');
      expect(state.executionContext.conversationId).toBe('task-789');
      expect(state.executionContext.orgSlug).toBeDefined();
      expect(state.executionContext.provider).toBeDefined();
      expect(state.executionContext.model).toBeDefined();
    });
  });

  describe('State Field Types', () => {
    it('should accept valid string arrays for availableTables', () => {
      const state: Partial<DataAnalystState> = {
        availableTables: ['users', 'posts', 'comments'],
      };

      expect(state.availableTables).toHaveLength(3);
      expect(state.availableTables).toContain('users');
    });

    it('should accept valid string arrays for selectedTables', () => {
      const state: Partial<DataAnalystState> = {
        selectedTables: ['users', 'posts'],
      };

      expect(state.selectedTables).toHaveLength(2);
      expect(state.selectedTables).toContain('users');
    });

    it('should accept valid Record<string, string> for tableSchemas', () => {
      const state: Partial<DataAnalystState> = {
        tableSchemas: {
          users: 'id (int), name (varchar), email (varchar)',
          posts: 'id (int), title (varchar), content (text)',
        },
      };

      expect(Object.keys(state.tableSchemas!)).toHaveLength(2);
      expect(state.tableSchemas!.users).toContain('id (int)');
    });

    it('should accept optional string for generatedSql', () => {
      const stateWithSql: Partial<DataAnalystState> = {
        generatedSql: 'SELECT * FROM users WHERE active = true',
      };
      const stateWithoutSql: Partial<DataAnalystState> = {
        generatedSql: undefined,
      };

      expect(stateWithSql.generatedSql).toBe(
        'SELECT * FROM users WHERE active = true',
      );
      expect(stateWithoutSql.generatedSql).toBeUndefined();
    });

    it('should accept optional string for sqlResults', () => {
      const stateWithResults: Partial<DataAnalystState> = {
        sqlResults: 'Results: 42 rows',
      };
      const stateWithoutResults: Partial<DataAnalystState> = {
        sqlResults: undefined,
      };

      expect(stateWithResults.sqlResults).toBe('Results: 42 rows');
      expect(stateWithoutResults.sqlResults).toBeUndefined();
    });

    it('should accept ToolResult array for toolResults', () => {
      const state: Partial<DataAnalystState> = {
        toolResults: [
          { toolName: 'list_tables', result: 'users, posts', success: true },
          {
            toolName: 'execute_sql',
            result: '',
            success: false,
            error: 'Syntax error',
          },
        ],
      };

      expect(state.toolResults).toHaveLength(2);
      expect(state.toolResults![0]!.success).toBe(true);
      expect(state.toolResults![1]!.success).toBe(false);
    });

    it('should accept valid status values', () => {
      const validStatuses: Array<DataAnalystState['status']> = [
        'started',
        'discovering',
        'querying',
        'summarizing',
        'completed',
        'failed',
      ];

      validStatuses.forEach((status) => {
        const state: Partial<DataAnalystState> = { status };
        expect(state.status).toBe(status);
      });
    });

    it('should accept optional string for error', () => {
      const stateWithError: Partial<DataAnalystState> = {
        error: 'Database connection timeout',
      };
      const stateWithoutError: Partial<DataAnalystState> = {
        error: undefined,
      };

      expect(stateWithError.error).toBe('Database connection timeout');
      expect(stateWithoutError.error).toBeUndefined();
    });

    it('should accept timestamp numbers for startedAt and completedAt', () => {
      const now = Date.now();
      const state: Partial<DataAnalystState> = {
        startedAt: now,
        completedAt: now + 5000,
      };

      expect(state.startedAt).toBe(now);
      expect(state.completedAt).toBe(now + 5000);
    });
  });

  describe('State Workflow Progression', () => {
    it('should represent a complete successful workflow', () => {
      const startTime = Date.now();

      // Initial state
      const initialState: DataAnalystState = {
        messages: [],
        executionContext: createMockExecutionContext(),
        userMessage: 'Show me total sales by region',
        availableTables: [],
        selectedTables: [],
        tableSchemas: {},
        generatedSql: undefined,
        sqlResults: undefined,
        toolResults: [],
        summary: undefined,
        status: 'started',
        error: undefined,
        startedAt: startTime,
        completedAt: undefined,
      };

      // After discovering tables
      const discoveringState: DataAnalystState = {
        ...initialState,
        status: 'discovering',
        availableTables: ['sales', 'regions', 'customers'],
        toolResults: [
          {
            toolName: 'list_tables',
            result: 'sales, regions, customers',
            success: true,
          },
        ],
      };

      // After selecting and describing tables
      const queryingState: DataAnalystState = {
        ...discoveringState,
        status: 'querying',
        selectedTables: ['sales', 'regions'],
        tableSchemas: {
          sales: 'id (int), region_id (int), amount (decimal)',
          regions: 'id (int), name (varchar)',
        },
        generatedSql:
          'SELECT r.name, SUM(s.amount) FROM sales s JOIN regions r ON s.region_id = r.id GROUP BY r.name',
      };

      // After executing query
      const summarizingState: DataAnalystState = {
        ...queryingState,
        status: 'summarizing',
        sqlResults: 'North: $1.2M, South: $980K, East: $1.5M, West: $1.1M',
      };

      // Final completed state
      const completedState: DataAnalystState = {
        ...summarizingState,
        status: 'completed',
        summary:
          'Total sales by region: North leads with $1.2M, followed by East at $1.5M',
        completedAt: startTime + 5000,
      };

      expect(initialState.status).toBe('started');
      expect(discoveringState.availableTables).toHaveLength(3);
      expect(queryingState.generatedSql).toContain('SELECT');
      expect(summarizingState.sqlResults).toBeDefined();
      expect(completedState.status).toBe('completed');
      expect(completedState.summary).toBeDefined();
    });

    it('should represent a failed workflow', () => {
      const startTime = Date.now();

      const failedState: DataAnalystState = {
        messages: [],
        executionContext: createMockExecutionContext(),
        userMessage: 'Invalid query',
        availableTables: ['users'],
        selectedTables: ['users'],
        tableSchemas: { users: 'schema' },
        generatedSql: 'SELECT * FORM users', // Typo
        sqlResults: undefined,
        toolResults: [
          {
            toolName: 'execute_sql',
            result: '',
            success: false,
            error: 'Syntax error: unexpected token "FORM"',
          },
        ],
        summary: undefined,
        status: 'failed',
        error: 'SQL execution failed: unexpected token "FORM"',
        startedAt: startTime,
        completedAt: startTime + 1000,
      };

      expect(failedState.status).toBe('failed');
      expect(failedState.error).toBeDefined();
      expect(failedState.toolResults[0]!.success).toBe(false);
    });
  });
});

describe('DataAnalystInput', () => {
  it('should have correct structure with ExecutionContext', () => {
    const input: DataAnalystInput = {
      context: createMockExecutionContext(),
      userMessage: 'Analyze sales data',
    };

    expect(input.context).toBeDefined();
    expect(input.userMessage).toBe('Analyze sales data');
  });

  it('should accept ExecutionContext with all required fields', () => {
    const context = createMockExecutionContext({
      orgSlug: 'test-org',
      userId: 'user-123',
      conversationId: 'conv-456',
      conversationId: 'conv-789',
      agentSlug: 'data-analyst',
    });

    const input: DataAnalystInput = {
      context,
      userMessage: 'Query database',
    };

    expect(input.context.orgSlug).toBe('test-org');
    expect(input.context.userId).toBe('user-123');
    expect(input.context.conversationId).toBe('conv-456');
    expect(input.context.conversationId).toBe('task-789');
    expect(input.context.agentSlug).toBe('data-analyst');
  });

  it('should validate that context is passed as whole capsule', () => {
    const context = createMockExecutionContext({
      userId: 'user-123',
      conversationId: 'conv-456',
    });

    const input: DataAnalystInput = {
      context, // Full capsule, not individual fields
      userMessage: 'test',
    };

    // Should have all fields from ExecutionContext, not just the ones we set
    expect(input.context.userId).toBe('user-123');
    expect(input.context.conversationId).toBe('task-456');
    expect(input.context.orgSlug).toBeDefined();
    expect(input.context.conversationId).toBeDefined();
    expect(input.context.provider).toBeDefined();
    expect(input.context.model).toBeDefined();
  });
});

describe('DataAnalystResult', () => {
  it('should have correct structure for completed status', () => {
    const result: DataAnalystResult = {
      conversationId: 'conv-123',
      status: 'completed',
      userMessage: 'Analyze sales',
      summary: 'Analysis complete: Total sales $5M',
      generatedSql: 'SELECT SUM(amount) FROM sales',
      sqlResults: '5000000',
      duration: 5000,
    };

    expect(result.conversationId).toBe('task-123');
    expect(result.status).toBe('completed');
    expect(result.summary).toBeDefined();
    expect(result.generatedSql).toBeDefined();
    expect(result.sqlResults).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(result.duration).toBe(5000);
  });

  it('should have correct structure for failed status', () => {
    const result: DataAnalystResult = {
      conversationId: 'conv-123',
      status: 'failed',
      userMessage: 'Analyze sales',
      error: 'Database connection failed',
      duration: 1000,
    };

    expect(result.conversationId).toBe('task-123');
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Database connection failed');
    expect(result.summary).toBeUndefined();
    expect(result.generatedSql).toBeUndefined();
    expect(result.sqlResults).toBeUndefined();
    expect(result.duration).toBe(1000);
  });

  it('should calculate duration from timestamps', () => {
    const startedAt = Date.now();
    const completedAt = startedAt + 3500;

    const result: DataAnalystResult = {
      conversationId: 'conv-123',
      status: 'completed',
      userMessage: 'test',
      duration: completedAt - startedAt,
    };

    expect(result.duration).toBe(3500);
  });

  it('should support both status values', () => {
    const completedResult: DataAnalystResult = {
      conversationId: 'conv-1',
      status: 'completed',
      userMessage: 'test',
      duration: 1000,
    };

    const failedResult: DataAnalystResult = {
      conversationId: 'conv-2',
      status: 'failed',
      userMessage: 'test',
      error: 'error',
      duration: 500,
    };

    expect(completedResult.status).toBe('completed');
    expect(failedResult.status).toBe('failed');
  });
});

describe('DataAnalystStatus', () => {
  it('should have correct structure', () => {
    const status: DataAnalystStatus = {
      conversationId: 'conv-123',
      status: 'discovering',
      userMessage: 'Analyze data',
      summary: 'Discovering tables in database...',
    };

    expect(status.conversationId).toBe('task-123');
    expect(status.status).toBe('discovering');
    expect(status.userMessage).toBe('Analyze data');
    expect(status.summary).toBe('Discovering tables in database...');
    expect(status.error).toBeUndefined();
  });

  it('should support all valid status values', () => {
    const statuses: Array<DataAnalystStatus['status']> = [
      'started',
      'discovering',
      'querying',
      'summarizing',
      'completed',
      'failed',
    ];

    statuses.forEach((statusValue) => {
      const status: DataAnalystStatus = {
        conversationId: 'conv-123',
        status: statusValue,
        userMessage: 'test',
      };

      expect(status.status).toBe(statusValue);
    });
  });

  it('should include error for failed status', () => {
    const status: DataAnalystStatus = {
      conversationId: 'conv-123',
      status: 'failed',
      userMessage: 'test',
      error: 'Connection timeout',
    };

    expect(status.status).toBe('failed');
    expect(status.error).toBe('Connection timeout');
  });

  it('should have optional summary and error fields', () => {
    const minimalStatus: DataAnalystStatus = {
      conversationId: 'conv-123',
      status: 'started',
      userMessage: 'test',
    };

    const fullStatus: DataAnalystStatus = {
      conversationId: 'conv-456',
      status: 'completed',
      userMessage: 'test',
      summary: 'Analysis complete',
      error: undefined,
    };

    expect(minimalStatus.summary).toBeUndefined();
    expect(minimalStatus.error).toBeUndefined();
    expect(fullStatus.summary).toBe('Analysis complete');
  });
});

describe('ToolResult', () => {
  it('should have correct structure for successful tool execution', () => {
    const toolResult: ToolResult = {
      toolName: 'list_tables',
      result: 'users, posts, comments',
      success: true,
    };

    expect(toolResult.toolName).toBe('list_tables');
    expect(toolResult.result).toBe('users, posts, comments');
    expect(toolResult.success).toBe(true);
    expect(toolResult.error).toBeUndefined();
  });

  it('should have correct structure for failed tool execution', () => {
    const toolResult: ToolResult = {
      toolName: 'execute_sql',
      result: '',
      success: false,
      error: 'Syntax error in SQL query',
    };

    expect(toolResult.toolName).toBe('execute_sql');
    expect(toolResult.result).toBe('');
    expect(toolResult.success).toBe(false);
    expect(toolResult.error).toBe('Syntax error in SQL query');
  });

  it('should support common data analyst tool names', () => {
    const tools = [
      'list_tables',
      'describe_table',
      'execute_sql',
      'query_database',
    ];

    tools.forEach((toolName) => {
      const toolResult: ToolResult = {
        toolName,
        result: 'test result',
        success: true,
      };

      expect(toolResult.toolName).toBe(toolName);
      expect(toolResult.success).toBe(true);
    });
  });

  it('should track tool execution history', () => {
    const history: ToolResult[] = [
      {
        toolName: 'list_tables',
        result: 'users, posts, comments',
        success: true,
      },
      {
        toolName: 'describe_table',
        result: 'users: id (int), name (varchar)',
        success: true,
      },
      {
        toolName: 'execute_sql',
        result: '42 rows returned',
        success: true,
      },
    ];

    expect(history).toHaveLength(3);
    expect(history[0]!.toolName).toBe('list_tables');
    expect(history[1]!.toolName).toBe('describe_table');
    expect(history[2]!.toolName).toBe('execute_sql');
    expect(history.every((t) => t.success)).toBe(true);
  });

  it('should track both successful and failed tool executions', () => {
    const history: ToolResult[] = [
      {
        toolName: 'list_tables',
        result: 'users, posts',
        success: true,
      },
      {
        toolName: 'execute_sql',
        result: '',
        success: false,
        error: 'Syntax error',
      },
      {
        toolName: 'execute_sql',
        result: 'Results returned',
        success: true,
      },
    ];

    const successCount = history.filter((t) => t.success).length;
    const failureCount = history.filter((t) => !t.success).length;

    expect(successCount).toBe(2);
    expect(failureCount).toBe(1);
    expect(history[1]!.error).toBe('Syntax error');
  });
});
