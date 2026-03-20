import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { SupabaseMCPServer } from './supabase.mcp';
import {
  MCPJsonRpcRequest,
  MCPJsonRpcResponse,
  MCPServerInfo,
  MCPToolDefinition,
} from '../../interfaces/mcp.interface';

// Helper function to safely get error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * NestJS Service Wrapper for Supabase MCP Server
 *
 * Provides HTTP endpoints and lifecycle management for the MCP server
 * Integrates with NestJS dependency injection and startup/shutdown hooks
 */
@Injectable()
export class SupabaseMCPService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupabaseMCPService.name);
  private mcpServer: SupabaseMCPServer;
  private isReady = false;

  constructor(
    private configService: ConfigService,
    @Inject(LLM_SERVICE) private llmService: LLMServiceProvider,
    @Inject(DATABASE_SERVICE) private db: DatabaseService,
  ) {
    this.mcpServer = new SupabaseMCPServer(configService, llmService, db);
  }

  /**
   * Initialize the MCP server on module startup
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.mcpServer.initialize();
      this.isReady = true;
      this.logger.log('Supabase MCP Service ready');
    } catch (error) {
      this.logger.error(
        `Supabase MCP Service initialization failed: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Clean up resources on module shutdown
   */
  onModuleDestroy(): void {
    this.isReady = false;
    this.logger.log('Supabase MCP Service shut down');
  }

  /**
   * Health check for the MCP server
   */
  healthCheck(): boolean {
    return this.isReady;
  }

  /**
   * Get server information (HTTP endpoint handler)
   */
  async getServerInfo(): Promise<MCPServerInfo> {
    if (!this.isReady) {
      throw new Error('MCP server is not ready');
    }
    return await this.mcpServer.getServerInfo();
  }

  /**
   * List available tools (HTTP endpoint handler)
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    if (!this.isReady) {
      throw new Error('MCP server is not ready');
    }
    return await this.mcpServer.listTools();
  }

  /**
   * Handle JSON-RPC requests (HTTP endpoint handler)
   */
  async handleJsonRpcRequest(
    request: MCPJsonRpcRequest,
  ): Promise<MCPJsonRpcResponse> {
    const startTime = Date.now();

    if (!this.isReady) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: 'MCP server is not ready',
          data: { server_status: 'initializing' },
        },
      };
    }

    try {
      let result: unknown;

      switch (request.method) {
        case 'get_server_info':
          result = await this.mcpServer.getServerInfo();
          break;

        case 'list_tools':
          result = { tools: await this.mcpServer.listTools() };
          break;

        case 'call_tool':
          if (!request.params || !request.params.name) {
            throw new Error('Tool name is required');
          }
          result = await this.mcpServer.callTool({
            name: request.params.name as string,
            arguments:
              (request.params.arguments as
                | Record<string, unknown>
                | undefined) || {},
          });
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      const executionTime = Date.now() - startTime;

      this.logger.debug(
        `MCP ${request.method} completed in ${executionTime}ms`,
      );

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error(
        `MCP ${request.method} failed after ${executionTime}ms: ${getErrorMessage(error)}`,
      );

      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: getErrorMessage(error),
          data: {
            method: request.method,
            execution_time_ms: executionTime,
          },
        },
      };
    }
  }

  /**
   * Direct tool execution (for internal use)
   */
  async executeToolInternal(
    toolName: string,
    args: unknown = {},
  ): Promise<unknown> {
    if (!this.isReady) {
      throw new Error('MCP server is not ready');
    }

    const response = await this.mcpServer.callTool({
      name: toolName,
      arguments:
        args && typeof args === 'object'
          ? (args as Record<string, unknown>)
          : undefined,
    });

    if (response.isError) {
      throw new Error(`Tool execution failed: ${response.content[0]?.text}`);
    }

    try {
      const content = response.content[0]?.text;
      if (content && content.startsWith('{')) {
        return JSON.parse(content);
      }
      return content;
    } catch {
      return response.content[0]?.text;
    }
  }

  /**
   * Get database schema (convenience method)
   */
  async getSchema(tables?: string[], domain?: 'core' | 'kpi'): Promise<string> {
    const result = await this.executeToolInternal('get-schema', {
      tables,
      domain,
    });
    if (typeof result === 'string') {
      return result;
    }
    return JSON.stringify(result);
  }

  /**
   * Generate SQL from natural language (convenience method)
   */
  async generateSQL(
    query: string,
    tables: string[],
    domainHint?: string,
    maxRows = 100,
  ): Promise<unknown> {
    return await this.executeToolInternal('generate-sql', {
      query,
      tables,
      domain_hint: domainHint,
      max_rows: maxRows,
    });
  }

  /**
   * Execute SQL query (convenience method)
   */
  async executeSQL(sql: string, maxRows = 1000): Promise<unknown> {
    return await this.executeTool({
      name: 'execute-sql',
      arguments: {
        sql,
        max_rows: maxRows,
      },
    });
  }

  /**
   * Analyze query results (convenience method)
   */
  async analyzeResults(
    data: unknown[],
    prompt: string,
    provider = 'anthropic',
    model = 'claude-3-5-sonnet-20241022',
  ): Promise<unknown> {
    return await this.executeTool({
      name: 'analyze-results',
      arguments: {
        data,
        analysis_prompt: prompt,
        provider,
        model,
      },
    });
  }

  /**
   * Get tools available in this namespace (for MCPService compatibility)
   */
  async getTools(): Promise<MCPToolDefinition[]> {
    if (!this.isReady) {
      await this.onModuleInit();
    }
    return await this.mcpServer.listTools();
  }

  /**
   * Execute a tool (for MCPService compatibility)
   */
  async executeTool(request: {
    name: string;
    arguments?: unknown;
  }): Promise<unknown> {
    if (!this.isReady) {
      throw new Error('MCP server is not ready');
    }
    return await this.mcpServer.callTool({
      name: request.name,
      arguments:
        request.arguments && typeof request.arguments === 'object'
          ? (request.arguments as Record<string, unknown>)
          : undefined,
    });
  }

  /**
   * Health check for this tool handler (for MCPService compatibility)
   */
  ping(): boolean {
    return this.isReady;
  }

  /**
   * Get server statistics and metrics
   */
  getServerMetrics(): unknown {
    return {
      server_name: 'Supabase MCP Server',
      status: this.isReady ? 'ready' : 'initializing',
      uptime_ms: this.isReady ? Date.now() : 0,
      tools_available: this.isReady ? 4 : 0,
      schema_domains: ['core', 'kpi'],
      context_files: [
        'core-schema.md',
        'kpi-schema.md',
        'relationships.md',
        'sql-patterns.md',
      ],
    };
  }
}
