import {
  Controller,
  Post,
  Body,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MCPService } from './mcp.service';
import {
  MCPJsonRpcRequest,
  MCPJsonRpcResponse,
  MCPJsonRpcError,
  MCPErrorCode,
  MCPInitializeParams,
  MCPCallToolParams,
  MCPServerInfo,
  MCPListToolsResult,
  MCPToolResponse,
  MCPPingResult,
} from './interfaces/mcp.interface';

/**
 * MCP Controller
 *
 * Handles all MCP JSON-RPC 2.0 requests in a single endpoint
 * Implements MCP 2025-03-26 specification with proper error handling
 * Routes to unified MCP service for all tool namespaces
 */
@Controller('mcp')
export class MCPController {
  private readonly logger = new Logger(MCPController.name);

  constructor(private readonly mcpService: MCPService) {}

  /**
   * Single MCP endpoint handling all JSON-RPC 2.0 methods
   * Supports: initialize, tools/list, tools/call, ping
   */
  @Post()
  async handleMCPRequest(
    @Body() request: MCPJsonRpcRequest,
  ): Promise<MCPJsonRpcResponse> {
    // Validate JSON-RPC 2.0 request format
    if (!this.isValidJsonRpcRequest(request)) {
      const requestId =
        request && typeof request === 'object' && 'id' in request
          ? (request as { id: string | number | null }).id
          : null;
      return this.createErrorResponse(
        requestId,
        MCPErrorCode.INVALID_REQUEST,
        'Invalid JSON-RPC 2.0 request format',
      );
    }

    const method: unknown = request.method;
    const params: unknown = request.params;
    const id = request.id as string | number | null;
    this.logger.debug(`Handling MCP method: ${String(method)}`);

    try {
      let result: unknown;

      switch (method) {
        case 'initialize': {
          const initParams: MCPInitializeParams =
            params && typeof params === 'object'
              ? (params as MCPInitializeParams)
              : ({
                  protocolVersion: '',
                  clientInfo: { name: '', version: '' },
                  capabilities: {},
                } as MCPInitializeParams);
          result = this.handleInitialize(initParams);
          break;
        }

        case 'tools/list':
          result = await this.handleListTools(params);
          break;

        case 'tools/call': {
          const callParams: MCPCallToolParams =
            params && typeof params === 'object'
              ? (params as MCPCallToolParams)
              : { name: '', arguments: {} };
          result = await this.handleCallTool(callParams);
          break;
        }

        case 'ping':
          result = await this.handlePing(params);
          break;

        case 'notifications/initialized':
          // MCP protocol handshake completion - no response needed
          result = {};
          break;

        default:
          return this.createErrorResponse(
            id,
            MCPErrorCode.METHOD_NOT_FOUND,
            `Method '${String(method)}' not found. Supported methods: initialize, tools/list, tools/call, ping`,
          );
      }

      return this.createSuccessResponse(id, result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`MCP method ${String(method)} failed: ${errorMessage}`);

      return this.createErrorResponse(
        id,
        MCPErrorCode.INTERNAL_ERROR,
        `Internal error: ${errorMessage}`,
      );
    }
  }

  /**
   * Handle MCP initialize method
   */
  private handleInitialize(params: MCPInitializeParams): MCPServerInfo {
    this.logger.log('MCP client initializing connection');

    // Validate client protocol version
    if (
      !params.protocolVersion ||
      !params.protocolVersion.startsWith('2025-03')
    ) {
      throw new Error(
        `Unsupported protocol version: ${params.protocolVersion}. Required: 2025-03-26`,
      );
    }

    const serverInfo = this.mcpService.initialize();

    this.logger.log(
      `MCP initialized for client: ${params.clientInfo?.name || 'unknown'}`,
    );

    return serverInfo;
  }

  /**
   * Handle tools/list method
   */
  private async handleListTools(_params: unknown): Promise<MCPListToolsResult> {
    this.logger.debug('Listing available MCP tools');

    const toolsResult = await this.mcpService.listTools();

    this.logger.debug(`Returning ${toolsResult.tools.length} tools`);

    return toolsResult;
  }

  /**
   * Handle tools/call method
   */
  private async handleCallTool(
    params: MCPCallToolParams,
  ): Promise<MCPToolResponse> {
    if (!params.name) {
      throw new Error('Tool name is required');
    }

    this.logger.debug(`Executing MCP tool: ${params.name}`);

    const toolRequest = {
      name: params.name,
      arguments: params.arguments || {},
    };

    const result = await this.mcpService.callTool(toolRequest);

    // If the tool returned an error, throw it to be handled by JSON-RPC error response
    if (result.isError) {
      const errorContent = result.content[0]?.text || 'Tool execution failed';
      let errorData: unknown;

      try {
        errorData = JSON.parse(errorContent);
      } catch {
        errorData = { message: errorContent };
      }

      const errorMessage =
        typeof errorData === 'object' && errorData !== null
          ? (errorData as { error?: string }).error ||
            (errorData as { message?: string }).message ||
            errorContent
          : errorContent;
      throw new Error(errorMessage);
    }

    this.logger.debug(`Successfully executed tool: ${params.name}`);

    return result;
  }

  /**
   * Handle ping method
   */
  private async handlePing(_params: unknown): Promise<MCPPingResult> {
    this.logger.debug('MCP ping request');

    const pingResult = await this.mcpService.ping();

    this.logger.debug(`MCP ping result: ${pingResult.status}`);

    return pingResult;
  }

  /**
   * Validate JSON-RPC 2.0 request format
   */
  private isValidJsonRpcRequest(
    request: unknown,
  ): request is MCPJsonRpcRequest {
    if (!request || typeof request !== 'object') {
      return false;
    }
    const req = request as { jsonrpc?: string; method?: unknown; id?: unknown };
    return (
      req.jsonrpc === '2.0' &&
      typeof req.method === 'string' &&
      req.id !== undefined // id can be string, number, or null
    );
  }

  /**
   * Create successful JSON-RPC response
   */
  private createSuccessResponse(
    id: string | number | null,
    result: unknown,
  ): MCPJsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  /**
   * Create JSON-RPC error response
   */
  private createErrorResponse(
    id: string | number | null,
    code: MCPErrorCode,
    message: string,
    data?: unknown,
  ): MCPJsonRpcResponse {
    const error: MCPJsonRpcError = {
      code,
      message,
      ...(data && typeof data === 'object' ? { data } : {}),
    };

    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }

  /**
   * Additional endpoints for debugging and health checks
   */

  /**
   * Get server configuration (debug endpoint)
   */
  @Post('debug/config')
  getServerConfig(): Record<string, unknown> {
    try {
      return this.mcpService.getServerConfig();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Get server config failed: ${errorMessage}`);
      throw new HttpException(
        `Failed to get server config: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Health check endpoint
   */
  @Post('health')
  async healthCheck(): Promise<unknown> {
    try {
      const pingResult = await this.mcpService.ping();

      return {
        status: pingResult.status,
        timestamp: pingResult.timestamp,
        namespaces: pingResult.namespaces,
        healthy: pingResult.status === 'healthy',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Health check failed: ${errorMessage}`);

      return {
        status: 'unhealthy',
        error: errorMessage,
        timestamp: new Date().toISOString(),
        healthy: false,
      };
    }
  }

  /**
   * List tools endpoint (for easy debugging)
   */
  @Post('debug/tools')
  async debugListTools(): Promise<unknown> {
    try {
      const toolsResult = await this.mcpService.listTools();

      return {
        ...toolsResult,
        total_count: toolsResult.tools.length,
        namespaces: [
          ...new Set(toolsResult.tools.map((tool) => tool.name.split('/')[0])),
        ],
        retrieved_at: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Debug list tools failed: ${errorMessage}`);
      throw new HttpException(
        `Failed to list tools: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
