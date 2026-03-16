import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MCPServerInfo,
  MCPToolDefinition,
  MCPToolRequest,
  MCPToolResponse,
  IMCPToolHandler,
} from './interfaces/mcp.interface';

// Service implementations for different namespaces
import { SupabaseMCPService } from './services/supabase/supabase-mcp.service';
import { SlackMCPTools } from './tools/slack.tools';
import { NotionMCPTools } from './tools/notion.tools';

/**
 * Unified MCP Service
 *
 * Single service implementing full MCP 2025-03-26 specification.
 * Handles all tool namespaces (data and productivity) in one application.
 * Supports: supabase/, slack/, notion/ namespaces.
 *
 * ExecutionContext note: MCP operates as a tool protocol router — it dispatches
 * to external system handlers (Supabase, Slack, Notion) that have fixed
 * authentication and do not participate in the A2A LLM observability pipeline.
 * The MCP controller (mcp.controller.ts) validates the caller's JWT, but the
 * ExecutionContext capsule is not threaded through to individual tool handlers
 * because tool calls are fire-and-return with no LLM invocations.
 *
 * If MCP tools need to make LLM calls in future, ExecutionContext must be added
 * as a parameter to callTool() and propagated to affected tool handlers.
 */
@Injectable()
export class MCPService {
  private readonly logger = new Logger(MCPService.name);

  // Tool namespace handlers
  private readonly toolHandlers: Map<string, IMCPToolHandler> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseMCPService,
    private readonly slackTools: SlackMCPTools,
    private readonly notionTools: NotionMCPTools,
  ) {
    this.initializeToolHandlers();
  }

  /**
   * Initialize service handlers for each namespace
   */
  private initializeToolHandlers(): void {
    this.toolHandlers.set(
      'supabase',
      this.supabaseService as unknown as IMCPToolHandler,
    );
    this.toolHandlers.set('slack', this.slackTools);
    this.toolHandlers.set('notion', this.notionTools);

    this.logger.log(
      `Initialized MCP service handlers: ${Array.from(this.toolHandlers.keys()).join(', ')}`,
    );
  }

  /**
   * MCP initialize method
   * Returns server capabilities and information
   */
  initialize(): MCPServerInfo {
    return {
      protocolVersion: '2025-03-26',
      serverInfo: {
        name: 'OrchestratorAI Compose MCP Server',
        version: '1.0.0',
        description:
          'Unified MCP server supporting data and productivity operations',
      },
      capabilities: {
        tools: {
          listChanged: true,
        },
        resources: {
          subscribe: false,
          listChanged: false,
        },
        prompts: {
          listChanged: false,
        },
        logging: {},
      },
      instructions:
        'This server provides access to multiple tool namespaces: supabase/, slack/, notion/',
    };
  }

  /**
   * MCP tools/list method
   * Returns all available tools from all namespaces
   */
  async listTools(): Promise<{ tools: MCPToolDefinition[] }> {
    const allTools: MCPToolDefinition[] = [];

    // Collect tools from each namespace handler
    for (const [namespace, handler] of this.toolHandlers.entries()) {
      try {
        const namespaceTools = await (
          handler as { getTools: () => Promise<unknown> }
        ).getTools();

        // Add namespace prefix to tool names
        const prefixedTools = (namespaceTools as MCPToolDefinition[]).map(
          (tool: MCPToolDefinition) => ({
            ...tool,
            name: `${namespace}/${tool.name}`,
            description: `[${this.getNamespaceType(namespace)}] ${tool.description}`,
          }),
        );

        allTools.push(...prefixedTools);
        this.logger.debug(
          `Loaded ${prefixedTools.length} tools from ${namespace} namespace`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to load tools from ${namespace}: ${errorMessage}`,
        );
      }
    }

    this.logger.log(
      `Returning ${allTools.length} tools across ${this.toolHandlers.size} namespaces`,
    );
    return { tools: allTools };
  }

  /**
   * MCP tools/call method
   * Execute a specific tool based on namespace routing
   */
  async callTool(request: MCPToolRequest): Promise<MCPToolResponse> {
    const { namespace, toolName } = this.parseToolName(request.name);

    if (!namespace) {
      return this.createErrorResponse(
        `Tool name must include namespace: ${request.name}. Use format: namespace/tool-name`,
      );
    }

    const handler = this.toolHandlers.get(namespace);
    if (!handler) {
      const availableNamespaces = Array.from(this.toolHandlers.keys()).join(
        ', ',
      );
      return this.createErrorResponse(
        `Unknown namespace '${namespace}'. Available: ${availableNamespaces}`,
      );
    }

    try {
      // Execute tool with original name (without namespace prefix)
      const toolRequest: MCPToolRequest = {
        ...request,
        name: toolName,
      };

      const result = await (
        handler as { executeTool: (req: MCPToolRequest) => Promise<unknown> }
      ).executeTool(toolRequest);

      this.logger.debug(`Successfully executed ${request.name}`);
      return result as MCPToolResponse;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Tool execution failed for ${request.name}: ${errorMessage}`,
      );

      return this.createErrorResponse(`Tool execution failed: ${errorMessage}`);
    }
  }

  /**
   * MCP ping method
   * Health check for the MCP server
   */
  async ping(): Promise<{
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    namespaces: Record<string, boolean>;
  }> {
    const timestamp = new Date().toISOString();
    const namespaceHealth: Record<string, boolean> = {};

    // Check health of each namespace handler
    for (const [namespace, handler] of this.toolHandlers.entries()) {
      try {
        const isHealthy =
          typeof handler.ping === 'function'
            ? await (handler as { ping: () => Promise<boolean> }).ping()
            : true;
        namespaceHealth[namespace] = isHealthy;
      } catch (error) {
        namespaceHealth[namespace] = false;
        this.logger.warn(
          `MCP namespace ${namespace} failed health check`,
          error instanceof Error ? error : { message: String(error) },
        );
      }
    }

    // MCP server is considered healthy if it can serve tools
    const hasLoadedTools = this.toolHandlers.size > 0;
    const overallHealth = hasLoadedTools;

    return {
      status: overallHealth ? 'healthy' : 'unhealthy',
      timestamp,
      namespaces: namespaceHealth,
    };
  }

  /**
   * Parse namespaced tool name into components
   */
  private parseToolName(toolName: string): {
    namespace: string | null;
    toolName: string;
  } {
    const parts = toolName.split('/');

    if (parts.length < 2) {
      return { namespace: null, toolName };
    }

    const namespace = parts[0] || null;
    const tool = parts.slice(1).join('/');

    return { namespace, toolName: tool };
  }

  /**
   * Get the type category for a namespace
   */
  private getNamespaceType(namespace: string): string {
    const dataNamespaces = ['supabase', 'sqlserver', 'postgres', 'mysql'];
    const productivityNamespaces = ['slack', 'notion', 'asana', 'trello'];

    if (dataNamespaces.includes(namespace)) {
      return 'data';
    } else if (productivityNamespaces.includes(namespace)) {
      return 'productivity';
    }

    return 'utility';
  }

  /**
   * Create standardized error response
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

  /**
   * Get server configuration for debugging
   */
  getServerConfig(): Record<string, unknown> {
    return {
      namespaces: Array.from(this.toolHandlers.keys()),
      capabilities: ['tools', 'logging'],
      version: '1.0.0',
      protocolVersion: '2025-03-26',
    };
  }
}
