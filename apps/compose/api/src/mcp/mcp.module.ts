import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { MCPController } from './mcp.controller';
import { MCPService } from './mcp.service';
import { MCPClientService } from './clients/mcp-client.service';

// Service and tool handlers for different namespaces
import { SupabaseMCPService } from './services/supabase/supabase-mcp.service';
import { SlackMCPTools } from './tools/slack.tools';
import { NotionMCPTools } from './tools/notion.tools';

/**
 * MCP Module
 *
 * Unified Model Context Protocol module implementing MCP 2025-03-26 specification
 * Provides single-app architecture supporting multiple tool namespaces:
 * - Data tools: supabase/
 * - Productivity tools: slack/, notion/
 *
 * Runners (context runner, API runner) can use MCPClientService to call MCP tools.
 * LLM_SERVICE and DATABASE_SERVICE are injected via the global planes modules
 * (LLMPlaneModule and DatabaseModule) — no direct imports needed here.
 */
@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [MCPController],
  providers: [
    MCPService,
    MCPClientService,

    // Service namespace handlers
    SupabaseMCPService,
    SlackMCPTools,
    NotionMCPTools,
  ],
  exports: [
    MCPService,
    MCPClientService,

    // Export service handlers for use in other modules
    SupabaseMCPService,
    SlackMCPTools,
    NotionMCPTools,
  ],
})
export class MCPModule {
  constructor(private readonly mcpService: MCPService) {
    void this.initializeModule();
  }

  /**
   * Initialize the MCP module
   */
  private async initializeModule(): Promise<void> {
    try {
      // Initialize MCP service and verify tool handlers
      this.mcpService.initialize();

      // List available tools for initialization
      await this.mcpService.listTools();

      // Health check all tool handlers
      await this.mcpService.ping();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`MCP Module initialization failed: ${errorMessage}`);
    }
  }
}
