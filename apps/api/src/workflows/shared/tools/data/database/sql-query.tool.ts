import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '@orchestratorai/planes/database';
import { LLMUsageReporterService } from '../../../services/llm-usage-reporter.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * SqlQueryTool
 *
 * Executes read-only SQL queries against the database.
 * Uses Ollama (default: gpt-oss:20b, configurable via SQLCODER_MODEL) for natural language to SQL generation.
 * Reports LLM usage via the LLMUsageReporterService.
 */
@Injectable()
export class SqlQueryTool {
  private readonly logger = new Logger(SqlQueryTool.name);
  private readonly ollamaBaseUrl: string;
  private readonly sqlCoderModel: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly usageReporter: LLMUsageReporterService,
  ) {
    this.ollamaBaseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434';
    this.sqlCoderModel =
      this.configService.get<string>('SQLCODER_MODEL') || 'gpt-oss:20b';
  }

  /**
   * Create the LangGraph tool instance for executing pre-written SQL.
   *
   * Note: Uses require() to avoid TypeScript's TS2589 (type instantiation
   * excessively deep) caused by DynamicStructuredTool's deeply nested generic
   * types. Static imports trigger OOM in ts-jest. See ESLint config override
   * for apps/forge/api/src/agents/shared/tools/data/database/*.
   */
  /**
   * Create the LangGraph tool instance for executing pre-written SQL.
   *
   * Note: Uses require() to avoid TypeScript's TS2589 (type instantiation
   * excessively deep) caused by DynamicStructuredTool's deeply nested generic
   * types. Static imports trigger OOM in ts-jest due to unbounded type
   * inference. The ESLint config overrides no-require-imports and related
   * rules for this directory.
   */
  createTool(): any {
    const { DynamicStructuredTool } = require('@langchain/core/tools');
    const { z } = require('zod');

    return new DynamicStructuredTool({
      name: 'execute_sql',
      description:
        'Executes a read-only SQL query against the database. Only SELECT statements are allowed. Use list_tables and describe_table first to understand the schema.',
      schema: z.object({
        sql: z
          .string()
          .describe('The SQL SELECT query to execute. Must be read-only.'),
        params: z
          .array(z.unknown())
          .optional()
          .describe('Optional query parameters for parameterized queries.'),
      }),
      func: async (input: {
        sql: string;
        params?: unknown[];
      }): Promise<string> => {
        return this.executeSql(input.sql, input.params);
      },
    });
  }

  /**
   * Create the LangGraph tool instance for natural language to SQL.
   *
   * Note: Uses require() to avoid TypeScript's TS2589 (type instantiation
   * excessively deep) caused by DynamicStructuredTool's deeply nested generic
   * types. Static imports trigger OOM in ts-jest due to unbounded type
   * inference. The ESLint config overrides no-require-imports and related
   * rules for this directory.
   *
   * @param context - Full ExecutionContext capsule
   */
  createNaturalLanguageTool(context: ExecutionContext): any {
    const { DynamicStructuredTool } = require('@langchain/core/tools');
    const { z } = require('zod');

    return new DynamicStructuredTool({
      name: 'query_database',
      description:
        'Converts a natural language question into SQL and executes it. Provide the question and relevant table schema information.',
      schema: z.object({
        question: z
          .string()
          .describe('The natural language question to answer with SQL.'),
        tableContext: z
          .string()
          .describe(
            'The relevant table schemas (from describe_table) to help generate accurate SQL.',
          ),
      }),
      func: async (input: {
        question: string;
        tableContext: string;
      }): Promise<string> => {
        return this.generateAndExecuteSql(
          input.question,
          input.tableContext,
          context,
        );
      },
    });
  }

  /**
   * Execute a pre-written SQL query (read-only)
   */
  async executeSql(sql: string, params?: unknown[]): Promise<string> {
    // Validate read-only
    const normalizedSql = sql.trim().toUpperCase();
    if (!normalizedSql.startsWith('SELECT')) {
      return 'Error: Only SELECT queries are allowed. This tool is read-only.';
    }

    // Block dangerous patterns
    const dangerousPatterns = [
      /INSERT\s+INTO/i,
      /UPDATE\s+/i,
      /DELETE\s+FROM/i,
      /DROP\s+/i,
      /CREATE\s+/i,
      /ALTER\s+/i,
      /TRUNCATE\s+/i,
      /GRANT\s+/i,
      /REVOKE\s+/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        return 'Error: Query contains forbidden SQL operations. Only SELECT is allowed.';
      }
    }

    try {
      const result = await this.db.rawQuery(sql, params || []);

      if (result.error) {
        return `SQL Error: ${result.error.message}`;
      }

      const rows = result.data as Record<string, unknown>[];
      if (!rows || rows.length === 0) {
        return 'Query returned no results.';
      }

      // Format results as a table-like string
      const columns = Object.keys(rows[0] as Record<string, unknown>);
      const header = columns.join(' | ');
      const separator = columns.map(() => '---').join(' | ');

      // Helper to format date values to shorter strings
      const formatValue = (value: unknown, columnName: string): string => {
        if (value === null || value === undefined) {
          return 'NULL';
        }

        // Check if column name suggests it's a date/timestamp field
        const isDateColumn = /_(at|date|time|created|updated)$/i.test(
          columnName,
        );

        if (
          isDateColumn &&
          (value instanceof Date || typeof value === 'string')
        ) {
          try {
            const date = value instanceof Date ? value : new Date(value);
            if (!isNaN(date.getTime())) {
              // Format as YYYY-MM-DD HH:MM (much shorter)
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              return `${year}-${month}-${day} ${hours}:${minutes}`;
            }
          } catch {
            // If date parsing fails, return as string
          }
        }

        return String(value as string | number | boolean);
      };

      const formattedRows = rows
        .slice(0, 100) // Limit to 100 rows
        .map((row: Record<string, unknown>) =>
          columns.map((col) => formatValue(row[col], col)).join(' | '),
        )
        .join('\n');

      const truncated = rows.length > 100 ? '\n... (truncated)' : '';

      return `Results (${rows.length} rows):\n${header}\n${separator}\n${formattedRows}${truncated}`;
    } catch (error) {
      this.logger.error('SQL execution failed', error);
      return `SQL Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Generate SQL from natural language using Ollama/SQLCoder and execute it
   *
   * @param question - The natural language question to convert to SQL
   * @param tableContext - The relevant table schemas
   * @param context - Full ExecutionContext capsule
   */
  async generateAndExecuteSql(
    question: string,
    tableContext: string,
    context: ExecutionContext,
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Generate SQL using Ollama/SQLCoder
      const prompt = this.buildSqlCoderPrompt(question, tableContext);
      const sql = await this.callOllama(prompt);

      if (!sql) {
        return 'Failed to generate SQL from the question.';
      }

      // Report usage
      const latencyMs = Date.now() - startTime;
      await this.usageReporter.reportSQLCoderUsage({
        promptTokens: this.usageReporter.estimateTokens(prompt),
        completionTokens: this.usageReporter.estimateTokens(sql),
        userId: context.userId,
        conversationId: context.conversationId,
        threadId: context.conversationId,
        latencyMs,
      });

      // Execute the generated SQL
      const result = await this.executeSql(sql);

      // Check if execution failed due to missing table
      if (result.includes('SQL Error:') && result.includes('does not exist')) {
        // Extract the table name from the error
        const tableMatch = result.match(
          /relation\s+"([^"]+)"\s+does not exist/i,
        );
        if (tableMatch) {
          const missingTable = tableMatch[1];
          return `Generated SQL:\n\`\`\`sql\n${sql}\n\`\`\`\n\n${result}\n\n⚠️ The table "${missingTable}" does not exist. Please check the available tables and try again with a valid table name.`;
        }
      }

      return `Generated SQL:\n\`\`\`sql\n${sql}\n\`\`\`\n\n${result}`;
    } catch (error) {
      this.logger.error('Failed to generate and execute SQL', error);
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Build the prompt for SQLCoder
   */
  private buildSqlCoderPrompt(question: string, tableContext: string): string {
    return `### Task
Generate a SQL query to answer the following question:
"${question}"

### Database Schema
${tableContext}

### Instructions
- Generate only a SELECT query (read-only)
- Use proper PostgreSQL syntax
- CRITICAL: ONLY use tables that are defined in the Database Schema section above
- If the question mentions a table name that is NOT in the schema, you MUST find an alternative table from the schema or return "-- Unable to generate query: table not found"
- Verify the table name matches exactly (case-sensitive) before using it
- Return only the SQL query, no explanations
- If you cannot generate a valid query, respond with "-- Unable to generate query"

### SQL Query
`;
  }

  /**
   * Call Ollama API for SQL generation
   */
  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.sqlCoderModel,
          prompt,
          stream: false,
          options: {
            temperature: 0.1, // Low temperature for consistent SQL
            num_predict: 1000, // Increased to allow for longer, more accurate queries
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = (await response.json()) as { response: string };
      const sql = data.response.trim();

      // Clean up the response - extract just the SQL
      const sqlMatch = sql.match(/SELECT[\s\S]+?;/i);
      return sqlMatch ? sqlMatch[0] : sql;
    } catch (error) {
      this.logger.error('Ollama API call failed', error);
      throw error;
    }
  }
}
