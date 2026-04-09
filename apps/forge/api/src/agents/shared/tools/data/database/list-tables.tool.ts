import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '@orchestratorai/planes/database';

/**
 * ListTablesTool
 *
 * Lists all available tables in the database that the agent can query.
 * Returns table names with their schemas.
 */
@Injectable()
export class ListTablesTool {
  private readonly logger = new Logger(ListTablesTool.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create the LangGraph tool instance.
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
      name: 'list_tables',
      description:
        'Lists all available database tables. Use this to discover what tables exist before writing SQL queries.',
      schema: z.object({
        schema: z
          .string()
          .optional()
          .describe(
            'Optional schema name to filter tables. Defaults to public.',
          ),
      }),
      func: async (input: { schema?: string }): Promise<string> => {
        return this.execute(input.schema);
      },
    });
  }

  /**
   * Execute the list tables query
   */
  async execute(schema?: string): Promise<string> {
    const targetSchema = schema || 'public';

    try {
      const query = `
        SELECT
          table_schema,
          table_name,
          table_type
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;

      const result = await this.db.rawQuery(query, [targetSchema]);

      if (result.error) {
        return `Error listing tables: ${result.error.message}`;
      }

      const rows = result.data as {
        table_schema: string;
        table_name: string;
      }[];
      if (!rows || rows.length === 0) {
        return `No tables found in schema '${targetSchema}'.`;
      }

      const tableList = rows
        .map((row) => `- ${row.table_schema}.${row.table_name}`)
        .join('\n');

      return `Available tables in '${targetSchema}' schema:\n${tableList}`;
    } catch (error) {
      this.logger.error('Failed to list tables', error);
      return `Error listing tables: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
