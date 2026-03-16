import { Injectable, Logger } from '@nestjs/common';
import { MCPService } from '../mcp.service';
import { MCPToolResponse } from '../interfaces/mcp.interface';

/**
 * MCP Client Service for Function Agents
 *
 * Provides a clean, simple interface for agents to use MCP tools
 * without needing to know about JSON-RPC protocol details.
 *
 * Updated to use direct MCPService instead of HTTP calls to avoid circular dependencies.
 */
@Injectable()
export class MCPClientService {
  private readonly logger = new Logger(MCPClientService.name);

  constructor(private readonly mcpService: MCPService) {}

  /**
   * Check if MCP service is available
   */
  isAvailable(): boolean {
    // For now, assume MCP service is available if it's injected
    // This could be enhanced to cache the last ping result
    return !!this.mcpService;
  }

  /**
   * Generate SQL from natural language query (interface-compatible)
   */
  async generateSQL(params: {
    natural_language_query: string;
    query_type?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'auto-detect';
    model_override?: string;
    include_explanation?: boolean;
    max_rows?: number;
    schema_tables?: string[];
    providerName?: string;
    modelName?: string;
  }): Promise<unknown> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/generate-sql',
        arguments: {
          query: params.natural_language_query,
          tables: params.schema_tables || [],
          max_rows: params.max_rows || 100,
          // Pass through provider/model (optional)
          provider: params.providerName,
          model: params.modelName,
        },
      });

      if (response.isError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: response.content[0]?.text || 'SQL generation failed',
            },
          ],
        };
      }

      return response;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Execute SQL query (interface-compatible)
   */
  async executeSQL(params: {
    sql_query: string;
    parameters?: unknown[];
    dry_run?: boolean;
    max_rows?: number;
    format?: 'detailed' | 'compact' | 'csv' | 'json';
  }): Promise<MCPToolResponse> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/execute-sql',
        arguments: {
          sql: params.sql_query,
          max_rows: params.max_rows || 1000,
        },
      });

      if (response.isError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: response.content[0]?.text || 'SQL execution failed',
            },
          ],
        };
      }

      return response;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Get database schema information (interface-compatible)
   */
  async getSchema(options?: {
    table_name?: string;
    refresh_cache?: boolean;
  }): Promise<unknown> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/get-schema',
        arguments: {
          table_name: options?.table_name,
          include_system: false,
        },
      });

      if (response.isError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: response.content[0]?.text || 'Schema retrieval failed',
            },
          ],
        };
      }

      return response;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Read data from a table (interface-compatible)
   */
  async readData(params: {
    table_name: string;
    columns?: string[];
    filters?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    order_by?: { column: string; ascending?: boolean };
    format?: 'json' | 'table' | 'csv';
  }): Promise<unknown> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/read-data',
        arguments: {
          table_name: params.table_name,
          columns: params.columns || ['*'],
          where: params.filters || {},
          limit: params.limit || 100,
          offset: params.offset || 0,
          order_by: params.order_by?.column,
          format: params.format || 'json',
        },
      });

      if (response.isError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: response.content[0]?.text || 'Data read failed',
            },
          ],
        };
      }

      return response;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Query and format results (interface-compatible)
   */
  async queryAndFormat(params: {
    user_prompt: string;
    output_format?: 'table' | 'json' | 'summary' | 'chart-data' | 'report';
    include_explanation?: boolean;
    max_rows?: number;
    schema_context?: string[];
  }): Promise<unknown> {
    try {
      const response = await this.mcpService.callTool({
        name: 'query-and-format',
        arguments: {
          query: params.user_prompt,
          format: params.output_format || 'table',
          analysis_type: 'raw',
        },
      });

      if (response.isError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: response.content[0]?.text || 'Query and format failed',
            },
          ],
        };
      }

      return response;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Call a tool on a specific server (interface-compatible)
   */
  async callTool(
    server: string,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    try {
      const response = await this.mcpService.callTool({
        name: toolName,
        arguments: params,
      });

      return response;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }
}
