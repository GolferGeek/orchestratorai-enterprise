import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '../../../../../planes/database/database.interface';

/**
 * DescribeTableTool
 *
 * Describes the schema of a specific database table.
 * Returns column names, types, and constraints.
 */
@Injectable()
export class DescribeTableTool {
  private readonly logger = new Logger(DescribeTableTool.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create the LangGraph tool instance
   *
   * Note: This method uses dynamic require to avoid TypeScript's deep type
   * instantiation limits with LangChain's tool types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createTool(): any {
    // Import dynamically to avoid type inference at module load time
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const { DynamicStructuredTool } = require('@langchain/core/tools');

    const { z } = require('zod');

    return new DynamicStructuredTool({
      name: 'describe_table',
      description:
        'Describes the schema of a database table, showing column names, data types, and constraints. Use this before writing SQL queries to understand the table structure.',
      schema: z.object({
        tableName: z.string().describe('The name of the table to describe'),
        schema: z
          .string()
          .optional()
          .describe('Optional schema name. Defaults to public.'),
      }),
      func: async (input: {
        tableName: string;
        schema?: string;
      }): Promise<string> => {
        return this.execute(input.tableName, input.schema);
      },
    });
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Execute the describe table query
   */
  async execute(tableName: string, schema?: string): Promise<string> {
    const targetSchema = schema || 'public';

    try {
      // Get column information
      const columnsQuery = `
        SELECT
          c.column_name,
          c.data_type,
          c.character_maximum_length,
          c.is_nullable,
          c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN 'PRIMARY KEY' ELSE '' END as key_type
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_schema = $1
          AND c.table_name = $2
        ORDER BY c.ordinal_position
      `;

      const result = await this.db.rawQuery(columnsQuery, [
        targetSchema,
        tableName,
      ]);

      if (result.error) {
        return `Error describing table: ${result.error.message}`;
      }

      const rows = result.data as {
        column_name: string;
        data_type: string;
        character_maximum_length: number | null;
        is_nullable: string;
        column_default: string | null;
        key_type: string;
      }[];

      if (!rows || rows.length === 0) {
        return `Table '${targetSchema}.${tableName}' not found or has no columns.`;
      }

      const columnDescriptions = rows
        .map((row) => {
          let typeStr = row.data_type;
          if (row.character_maximum_length) {
            typeStr += `(${row.character_maximum_length})`;
          }

          const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
          const defaultVal = row.column_default
            ? ` DEFAULT ${row.column_default}`
            : '';
          const keyInfo = row.key_type ? ` [${row.key_type}]` : '';

          return `  - ${row.column_name}: ${typeStr} ${nullable}${defaultVal}${keyInfo}`;
        })
        .join('\n');

      return `Table: ${targetSchema}.${tableName}\nColumns:\n${columnDescriptions}`;
    } catch (error) {
      this.logger.error(`Failed to describe table ${tableName}`, error);
      return `Error describing table: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
