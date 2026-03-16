import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SqlQueryTool } from './sql-query.tool';
import { LLMUsageReporterService } from '../../../services/llm-usage-reporter.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { DATABASE_SERVICE } from '@orchestratorai/planes/database';

// Mock fetch globally
global.fetch = jest.fn();

/**
 * Unit tests for SqlQueryTool
 *
 * Tests the SQL query execution tool with read-only safety
 * and natural language to SQL conversion.
 * Uses DATABASE_SERVICE.rawQuery() for database access.
 */
describe('SqlQueryTool', () => {
  let tool: SqlQueryTool;
  let usageReporter: jest.Mocked<LLMUsageReporterService>;
  const _mockContext = createMockExecutionContext();
  let mockDb: {
    rawQuery: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDb = {
      rawQuery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqlQueryTool,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                OLLAMA_BASE_URL: 'http://test-ollama-host:11434',
                SQLCODER_MODEL: 'sqlcoder',
              };
              return config[key];
            }),
          },
        },
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
        {
          provide: LLMUsageReporterService,
          useValue: {
            reportSQLCoderUsage: jest.fn().mockResolvedValue(undefined),
            estimateTokens: jest.fn((text: string) =>
              Math.ceil(text.length / 4),
            ),
          },
        },
      ],
    }).compile();

    tool = module.get<SqlQueryTool>(SqlQueryTool);
    usageReporter = module.get(LLMUsageReporterService);
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  describe('createTool', () => {
    it('should create a LangGraph tool instance', () => {
      const langGraphTool = tool.createTool();

      expect(langGraphTool).toBeDefined();
      expect(langGraphTool.name).toBe('execute_sql');
    });
  });

  describe('createNaturalLanguageTool', () => {
    it('should create a natural language tool instance', () => {
      const langGraphTool = tool.createNaturalLanguageTool(_mockContext);

      expect(langGraphTool).toBeDefined();
      expect(langGraphTool.name).toBe('query_database');
    });
  });

  describe('executeSql', () => {
    it('should execute valid SELECT query', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        error: null,
        count: 2,
      });

      const result = await tool.executeSql('SELECT * FROM users');

      expect(result).toContain('Results (2 rows)');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });

    it('should reject non-SELECT queries', async () => {
      const result = await tool.executeSql(
        "INSERT INTO users (name) VALUES ('test')",
      );

      expect(result).toContain('Only SELECT queries are allowed');
    });

    it('should block INSERT statements', async () => {
      const result = await tool.executeSql(
        "SELECT * FROM users; INSERT INTO users (name) VALUES ('hack')",
      );

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block UPDATE statements', async () => {
      const result = await tool.executeSql(
        "SELECT * FROM users WHERE id IN (SELECT id FROM users) UPDATE users SET name = 'x'",
      );

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block DELETE statements', async () => {
      const result = await tool.executeSql('SELECT 1; DELETE FROM users');

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block DROP statements', async () => {
      const result = await tool.executeSql(
        'SELECT * FROM users; DROP TABLE users',
      );

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block CREATE statements', async () => {
      const result = await tool.executeSql(
        'SELECT 1; CREATE TABLE hack (id int)',
      );

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block ALTER statements', async () => {
      const result = await tool.executeSql(
        'SELECT 1; ALTER TABLE users ADD COLUMN x INT',
      );

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block TRUNCATE statements', async () => {
      const result = await tool.executeSql('SELECT 1; TRUNCATE users');

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block GRANT statements', async () => {
      const result = await tool.executeSql(
        'SELECT 1; GRANT ALL ON users TO public',
      );

      expect(result).toContain('forbidden SQL operations');
    });

    it('should block REVOKE statements', async () => {
      const result = await tool.executeSql(
        'SELECT 1; REVOKE ALL ON users FROM public',
      );

      expect(result).toContain('forbidden SQL operations');
    });

    it('should handle parameterized queries', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [{ id: 1, name: 'Alice' }],
        error: null,
        count: 1,
      });

      const result = await tool.executeSql(
        'SELECT * FROM users WHERE id = $1',
        [1],
      );

      expect(mockDb.rawQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1',
        [1],
      );
      expect(result).toContain('Alice');
    });

    it('should return message when no results', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const result = await tool.executeSql(
        'SELECT * FROM users WHERE id = 999',
      );

      expect(result).toBe('Query returned no results.');
    });

    it('should truncate results to 100 rows', async () => {
      const manyRows = Array.from({ length: 150 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
      }));
      mockDb.rawQuery.mockResolvedValue({
        data: manyRows,
        error: null,
        count: 150,
      });

      const result = await tool.executeSql('SELECT * FROM users');

      expect(result).toContain('Results (150 rows)');
      expect(result).toContain('... (truncated)');
      expect(result).toContain('User 100');
      expect(result).not.toContain('User 150');
    });

    it('should handle NULL values', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [{ id: 1, name: null, email: 'test@test.com' }],
        error: null,
        count: 1,
      });

      const result = await tool.executeSql('SELECT * FROM users');

      expect(result).toContain('NULL');
    });

    it('should handle rawQuery error response', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: null,
        error: { message: 'Syntax error' },
        count: null,
      });

      const result = await tool.executeSql('SELECT * FORM users');

      expect(result).toContain('SQL Error');
      expect(result).toContain('Syntax error');
    });

    it('should handle database errors', async () => {
      mockDb.rawQuery.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.executeSql('SELECT * FROM users');

      expect(result).toContain('SQL Error');
      expect(result).toContain('Connection refused');
    });

    it('should format results as table', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [{ id: 1, name: 'Alice', status: 'active' }],
        error: null,
        count: 1,
      });

      const result = await tool.executeSql('SELECT * FROM users');

      expect(result).toContain('id | name | status');
      expect(result).toContain('---');
      expect(result).toContain('1 | Alice | active');
    });
  });

  describe('generateAndExecuteSql', () => {
    const context = createMockExecutionContext({
      userId: 'user-123',
      conversationId: 'conv-456',
    });

    it('should generate SQL from natural language and execute it', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ response: 'SELECT COUNT(*) FROM users;' }),
      });

      mockDb.rawQuery.mockResolvedValue({
        data: [{ count: 42 }],
        error: null,
        count: 1,
      });

      const result = await tool.generateAndExecuteSql(
        'How many users are there?',
        'users table: id (int), name (varchar), email (varchar)',
        context,
      );

      expect(result).toContain('Generated SQL');
      expect(result).toContain('SELECT COUNT(*) FROM users');
      expect(result).toContain('42');
    });

    it('should report LLM usage', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'SELECT 1;' }),
      });

      mockDb.rawQuery.mockResolvedValue({
        data: [{ column: 1 }],
        error: null,
        count: 1,
      });

      await tool.generateAndExecuteSql('Test question', 'Test schema', context);

      expect(usageReporter.reportSQLCoderUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          conversationId: 'conv-456',
          latencyMs: expect.any(Number),
        }),
      );
    });

    it('should handle Ollama API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await tool.generateAndExecuteSql(
        'Question',
        'Schema',
        context,
      );

      expect(result).toContain('Error');
    });

    it('should handle empty SQL response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: '' }),
      });

      const result = await tool.generateAndExecuteSql(
        'Question',
        'Schema',
        context,
      );

      expect(result).toContain('Failed to generate SQL');
    });

    it('should extract SELECT statement from response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response:
              'Here is the query:\nSELECT * FROM users WHERE active = true;',
          }),
      });

      mockDb.rawQuery.mockResolvedValue({
        data: [{ id: 1 }],
        error: null,
        count: 1,
      });

      const result = await tool.generateAndExecuteSql(
        'Show active users',
        'users: id, active',
        context,
      );

      expect(result).toContain('SELECT * FROM users WHERE active = true');
    });

    it('should pass table context to prompt', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'SELECT 1;' }),
      });

      mockDb.rawQuery.mockResolvedValue({
        data: [{ x: 1 }],
        error: null,
        count: 1,
      });

      await tool.generateAndExecuteSql(
        'Question',
        'users: id (int), name (varchar)',
        context,
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('users: id (int), name (varchar)'),
        }),
      );
    });
  });

  describe('security', () => {
    it('should prevent SQL injection via subqueries', async () => {
      const maliciousSql =
        'SELECT * FROM users WHERE id = (SELECT id FROM users); DROP TABLE users;--';

      const result = await tool.executeSql(maliciousSql);

      expect(result).toContain('forbidden SQL operations');
    });

    it('should case-insensitively detect dangerous patterns', async () => {
      const result1 = await tool.executeSql('SELECT 1; drop TABLE users');
      expect(result1).toContain('forbidden');

      const result2 = await tool.executeSql('SELECT 1; DELETE from users');
      expect(result2).toContain('forbidden');

      const result3 = await tool.executeSql(
        'SELECT 1; INSERT Into users VALUES (1)',
      );
      expect(result3).toContain('forbidden');
    });

    it('should allow legitimate SELECT with keywords in strings', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [{ text: 'Remember to DELETE old records' }],
        error: null,
        count: 1,
      });

      const result = await tool.executeSql(
        "SELECT text FROM notes WHERE text LIKE '%DELETE%'",
      );

      expect(result).toContain('Remember to DELETE old records');
    });
  });
});
