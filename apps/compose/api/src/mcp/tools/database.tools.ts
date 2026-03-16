import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  MCPToolDefinition,
  MCPToolRequest,
  MCPToolResponse,
  IMCPToolHandler,
} from '../interfaces/mcp.interface';

/**
 * Database MCP Tools Handler
 *
 * Implements data namespace tools using the DATABASE_SERVICE abstraction.
 * Works with any configured DB_PROVIDER (supabase, postgresql, sqlserver).
 * Provides: schema discovery, SQL execution, data querying, and table operations.
 */
@Injectable()
export class DatabaseMCPTools implements IMCPToolHandler {
  private readonly logger = new Logger(DatabaseMCPTools.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Get all database tools available
   */
  getTools(): Promise<MCPToolDefinition[]> {
    return Promise.resolve([
      {
        name: 'get-schema',
        description:
          'Get database schema information including tables, columns, and relationships',
        inputSchema: {
          type: 'object',
          properties: {
            table_name: {
              type: 'string',
              description:
                'Specific table name to get schema for (optional - returns all tables if not specified)',
            },
            include_system: {
              type: 'boolean',
              description: 'Include system tables in results',
              default: false,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: 'execute-sql',
        description: 'Execute a read-only SQL query against the database',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute (SELECT only)',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
      {
        name: 'read-data',
        description:
          'Read data from a specific table with filtering and pagination',
        inputSchema: {
          type: 'object',
          properties: {
            table_name: {
              type: 'string',
              description: 'Name of the table to read from',
            },
            schema: {
              type: 'string',
              description:
                'Schema name (e.g. prediction, risk). Omit for public schema.',
            },
            columns: {
              type: 'string',
              description:
                'Columns to select as comma-separated string (default: *)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of rows to return',
              default: 100,
            },
            format: {
              type: 'string',
              enum: ['json', 'table', 'csv'],
              description: 'Output format',
              default: 'json',
            },
          },
          required: ['table_name'],
          additionalProperties: false,
        },
      },
      {
        name: 'query-and-format',
        description:
          'Execute a custom read-only SQL query and format the results for analysis',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute (SELECT only)',
            },
            format: {
              type: 'string',
              enum: ['json', 'table', 'csv', 'summary'],
              description: 'Output format for results',
              default: 'table',
            },
            analysis_type: {
              type: 'string',
              enum: ['metrics', 'trends', 'comparison', 'raw'],
              description: 'Type of analysis to perform on results',
              default: 'raw',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
      {
        name: 'generate-sql',
        description: 'Generate SQL query from natural language description',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Natural language description of desired query',
            },
            table_context: {
              type: 'array',
              description: 'Specific tables to focus on',
              items: { type: 'string' },
            },
            query_type: {
              type: 'string',
              enum: ['select', 'insert', 'update', 'delete', 'analyze'],
              description: 'Type of SQL operation',
              default: 'select',
            },
          },
          required: ['description'],
          additionalProperties: false,
        },
      },
    ]);
  }

  /**
   * Execute a database tool
   */
  async executeTool(request: MCPToolRequest): Promise<MCPToolResponse> {
    const { name, arguments: args = {} } = request;

    switch (name) {
      case 'get-schema':
        return await this.getSchema(args);
      case 'execute-sql':
        return await this.executeSql(args);
      case 'read-data':
        return await this.readData(args);
      case 'query-and-format':
        return await this.queryAndFormat(args);
      case 'generate-sql':
        return this.generateSql(args);
      default:
        return this.createErrorResponse(`Unknown database tool: ${name}`);
    }
  }

  /**
   * Health check — verifies the database connection is reachable
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.db.checkConnection();
      return result.status === 'ok' || result.status === 'healthy';
    } catch (error) {
      this.logger.debug(
        `Database ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Get database schema information using information_schema
   */
  private async getSchema(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { table_name, include_system = false } = args;

    let sql = `
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    if (table_name) {
      const tableName =
        typeof table_name === 'string'
          ? table_name
          : JSON.stringify(table_name);
      sql += ` AND table_name = '${tableName}'`;
    }

    if (!include_system) {
      sql += ` AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'information_schema%'`;
    }

    sql += ` ORDER BY table_name, ordinal_position`;

    const result = await this.db.rawQuery(sql);

    if (result.error) {
      return this.createErrorResponse(
        `Schema retrieval failed: ${result.error.message}`,
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              schema: result.data as unknown,
              timestamp: new Date().toISOString(),
              table_filter: table_name || 'all tables',
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Execute a read-only SQL query via rawQuery
   */
  private async executeSql(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { query } = args;

    if (!query || typeof query !== 'string') {
      return this.createErrorResponse(
        'Missing or invalid query parameter. A SQL query string is required.',
      );
    }

    // Security: deny destructive operations
    const denied = ['DROP', 'TRUNCATE', 'ALTER', 'DELETE', 'UPDATE', 'INSERT'];
    const upper = query.toUpperCase();
    for (const op of denied) {
      if (new RegExp(`\\b${op}\\b`).test(upper)) {
        return this.createErrorResponse(
          `Security violation: Operation '${op}' is not allowed in read-only mode.`,
        );
      }
    }

    const result = await this.db.rawQuery(query);

    if (result.error) {
      return this.createErrorResponse(
        `SQL execution failed: ${result.error.message}`,
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              results: result.data as unknown,
              query,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Read data from table using QueryBuilder
   */
  private async readData(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const {
      table_name,
      schema = null,
      columns = '*',
      limit = 100,
      format = 'json',
    } = args;

    if (!table_name || typeof table_name !== 'string') {
      return this.createErrorResponse(
        'Missing or invalid table_name parameter.',
      );
    }

    const schemaValue = typeof schema === 'string' ? schema : null;
    const columnsStr = typeof columns === 'string' ? columns : '*';
    const limitNum = typeof limit === 'number' ? limit : 100;

    const result = await this.db
      .from(schemaValue, table_name)
      .select(columnsStr)
      .limit(limitNum);

    if (result.error) {
      return this.createErrorResponse(
        `Data read failed: ${result.error.message}`,
      );
    }

    const payload = Array.isArray(result.data) ? result.data : [];
    const formatStr = typeof format === 'string' ? format : 'json';

    return {
      content: [
        {
          type: 'text',
          text: this.formatData(payload, formatStr),
        },
      ],
    };
  }

  /**
   * Query and format results using rawQuery
   */
  private async queryAndFormat(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { query, format = 'table', analysis_type = 'raw' } = args;

    if (!query || typeof query !== 'string') {
      return this.createErrorResponse(
        'Missing or invalid query parameter. A SQL query string is required.',
      );
    }

    // Security: deny destructive operations
    const denied = ['DROP', 'TRUNCATE', 'ALTER', 'DELETE', 'UPDATE', 'INSERT'];
    const upper = query.toUpperCase();
    for (const op of denied) {
      if (new RegExp(`\\b${op}\\b`).test(upper)) {
        return this.createErrorResponse(
          `Security violation: Operation '${op}' is not allowed in read-only mode.`,
        );
      }
    }

    const result = await this.db.rawQuery(query);

    if (result.error) {
      return this.createErrorResponse(
        `Query execution failed: ${result.error.message}`,
      );
    }

    const payload = Array.isArray(result.data) ? result.data : [];
    const formatStr = typeof format === 'string' ? format : 'table';
    const analysisType =
      typeof analysis_type === 'string' ? analysis_type : 'raw';

    return {
      content: [
        {
          type: 'text',
          text: this.formatData(payload, formatStr, analysisType),
        },
      ],
    };
  }

  /**
   * Generate SQL from natural language (template stub — no LLM here)
   */
  private generateSql(args: Record<string, unknown>): MCPToolResponse {
    const { description, table_context = [], query_type = 'select' } = args;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              description,
              suggested_query: `-- Generated SQL for: ${String(description)}\n-- Query type: ${String(query_type)}\n-- TODO: Implement AI-powered SQL generation`,
              table_context,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Format data according to specified format
   */
  private formatData(
    data: unknown,
    format: string,
    analysisType?: string,
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'table':
        return this.formatAsTable(data as unknown[]);
      case 'csv':
        return this.formatAsCsv(data as unknown[]);
      case 'summary':
        return this.formatAsSummary(data as unknown[], analysisType);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * Format data as ASCII table
   */
  private formatAsTable(data: unknown[]): string {
    if (!Array.isArray(data) || data.length === 0) {
      return 'No data to display';
    }

    const firstRow = data[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow);
    const maxWidths = keys.map((key) =>
      Math.max(
        key.length,
        ...data.map((row) => {
          const rowRec = row as Record<string, unknown>;
          const value = rowRec[key];
          if (value == null) return 0;
          if (typeof value === 'object') return JSON.stringify(value).length;
          if (typeof value === 'string') return value.length;
          if (typeof value === 'number' || typeof value === 'boolean')
            return String(value).length;
          return 0;
        }),
      ),
    );

    let table = '';

    // Header
    table +=
      '| ' +
      keys.map((key, i) => key.padEnd(maxWidths[i] || 0)).join(' | ') +
      ' |\n';
    table +=
      '| ' +
      maxWidths.map((width) => '-'.repeat(width || 0)).join(' | ') +
      ' |\n';

    // Rows
    data.forEach((row) => {
      const rowRec = row as Record<string, unknown>;
      table +=
        '| ' +
        keys
          .map((key, i) => {
            const value = rowRec[key];
            if (value == null) return ''.padEnd(maxWidths[i] || 0);
            if (typeof value === 'object')
              return JSON.stringify(value).padEnd(maxWidths[i] || 0);
            if (typeof value === 'string')
              return value.padEnd(maxWidths[i] || 0);
            if (typeof value === 'number' || typeof value === 'boolean')
              return String(value).padEnd(maxWidths[i] || 0);
            return ''.padEnd(maxWidths[i] || 0);
          })
          .join(' | ') +
        ' |\n';
    });

    return table;
  }

  /**
   * Format data as CSV
   */
  private formatAsCsv(data: unknown[]): string {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const firstRow = data[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow);
    const csv = [keys.join(',')];

    data.forEach((row) => {
      const rowRec = row as Record<string, unknown>;
      csv.push(
        keys
          .map((key) => {
            const value = rowRec[key];
            if (typeof value === 'string') {
              return value.includes(',') ? `"${value}"` : value;
            }
            if (value == null) return '';
            if (typeof value === 'object') {
              const jsonStr = JSON.stringify(value);
              return jsonStr.includes(',') ? `"${jsonStr}"` : jsonStr;
            }
            if (typeof value === 'number' || typeof value === 'boolean') {
              const strValue = String(value);
              return strValue.includes(',') ? `"${strValue}"` : strValue;
            }
            return '';
          })
          .join(','),
      );
    });

    return csv.join('\n');
  }

  /**
   * Format data as summary with analysis
   */
  private formatAsSummary(data: unknown[], analysisType?: string): string {
    if (!Array.isArray(data)) {
      return JSON.stringify(data, null, 2);
    }

    let summary = `Data Summary (${data.length} records)\n\n`;

    if (data.length > 0) {
      const firstRow = data[0] as Record<string, unknown>;
      const keys = Object.keys(firstRow);
      summary += `Columns: ${keys.join(', ')}\n\n`;

      if (analysisType === 'metrics' || analysisType === 'trends') {
        summary += 'Sample Data:\n';
        summary += this.formatAsTable(data.slice(0, 5));
        summary += data.length > 5 ? '\n... and more\n' : '';
      } else {
        summary += this.formatAsTable(data);
      }
    }

    return summary;
  }

  /**
   * Create error response
   */
  private createErrorResponse(message: string): MCPToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: message,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }
}
