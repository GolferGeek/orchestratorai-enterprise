import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { LangChainClientService } from './langchain-client.service';
import { DynamicTool } from '@langchain/core/tools';

/**
 * LangChain Notion Tools Service
 *
 * Provides LangChain.js tool integration for Notion operations.
 * Creates tools that can be used by LangChain agents for Notion interactions.
 */
@Injectable()
export class LangChainNotionService {
  private readonly logger = new Logger(LangChainNotionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly langchainClient: LangChainClientService,
  ) {}

  /**
   * Create a Notion page creation tool
   */
  createNotionPageTool(): DynamicTool {
    return new DynamicTool({
      name: 'notion-create-page',
      description: 'Create a new page in Notion with title and content',
      func: (input: string) => {
        try {
          // Parse input - expect JSON with title and content
          const params: unknown = JSON.parse(input);
          const paramsObj = params as {
            title?: string;
            content?: string;
            databaseId?: string;
          };
          const { title, content, databaseId } = paramsObj;

          if (!title) {
            throw new Error('Title is required to create a Notion page');
          }

          // For now, return a mock response - this would integrate with actual Notion API
          // TODO: Implement actual Notion API integration or Zapier MCP integration
          const mockResponse = {
            success: true,
            pageId: `page_${Date.now()}`,
            title,
            content: content || '',
            url: `https://notion.so/page_${Date.now()}`,
            createdAt: new Date().toISOString(),
            parentDatabaseId: databaseId ?? null,
          };

          return Promise.resolve(JSON.stringify(mockResponse));
        } catch (error) {
          return Promise.resolve(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          );
        }
      },
    });
  }

  /**
   * Create a Notion database query tool
   */
  createNotionQueryTool(): DynamicTool {
    return new DynamicTool({
      name: 'notion-query-database',
      description: 'Query a Notion database for pages matching criteria',
      func: (input: string) => {
        try {
          const params = JSON.parse(input) as Record<string, unknown>;
          const { databaseId, filter, sorts } = params as {
            databaseId?: string;
            filter?: unknown;
            sorts?: unknown;
          };

          if (!databaseId) {
            throw new Error('Database ID is required to query Notion');
          }

          // Mock response - would integrate with actual Notion API
          const mockResponse = {
            success: true,
            results: [
              {
                id: `page_${Date.now()}_1`,
                title: 'Sample Page 1',
                url: `https://notion.so/page_${Date.now()}_1`,
                createdAt: new Date().toISOString(),
              },
              {
                id: `page_${Date.now()}_2`,
                title: 'Sample Page 2',
                url: `https://notion.so/page_${Date.now()}_2`,
                createdAt: new Date().toISOString(),
              },
            ],
            hasMore: false,
            appliedFilter: filter ?? null,
            appliedSorts: sorts ?? null,
          };

          return Promise.resolve(JSON.stringify(mockResponse));
        } catch (error) {
          return Promise.resolve(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          );
        }
      },
    });
  }

  /**
   * Create a Notion page update tool
   */
  createNotionUpdateTool(): DynamicTool {
    return new DynamicTool({
      name: 'notion-update-page',
      description: 'Update an existing Notion page with new content',
      func: (input: string) => {
        try {
          const params = JSON.parse(input) as Record<string, unknown>;
          const { pageId, updates } = params as {
            pageId?: string;
            updates?: unknown;
          };

          if (!pageId) {
            throw new Error('Page ID is required to update a Notion page');
          }

          // Mock response - would integrate with actual Notion API
          const mockResponse = {
            success: true,
            pageId: pageId,
            updates: updates,
            updatedAt: new Date().toISOString(),
          };

          return Promise.resolve(JSON.stringify(mockResponse));
        } catch (error) {
          return Promise.resolve(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          );
        }
      },
    });
  }

  /**
   * Get all available Notion tools
   */
  getAllNotionTools(): DynamicTool[] {
    return [
      this.createNotionPageTool(),
      this.createNotionQueryTool(),
      this.createNotionUpdateTool(),
    ];
  }

  /**
   * Process a natural language request for Notion operations
   */
  async processNotionRequest(
    userMessage: string,
    executionContext: import('@orchestrator-ai/transport-types').ExecutionContext,
    options?: {
      provider?: string;
      model?: string;
    },
  ): Promise<{
    intent: string;
    action: string;
    parameters?: Record<string, unknown>;
    response: string;
  }> {
    try {
      const systemPrompt = `You are a Notion operations assistant. Analyze user requests and determine the appropriate Notion action.

Available actions:
- create-page: Create a new Notion page
- query-database: Search for pages in a database
- update-page: Update an existing page

Respond with JSON containing:
{
  "intent": "brief description of what user wants",
  "action": "one of the actions above",
  "parameters": { "relevant parameters for the action" }
}`;

      const llmResponse = await this.langchainClient.executeSimpleCall(
        systemPrompt,
        userMessage,
        executionContext,
        options,
      );

      // Parse LLM response
      const parsed = JSON.parse(llmResponse) as Record<string, unknown>;

      return {
        intent: (parsed.intent as string) || 'Unknown intent',
        action: (parsed.action as string) || 'unknown',
        parameters: (parsed.parameters as Record<string, unknown>) || {},
        response: `I understand you want to ${String(parsed.intent)}. I'll ${String(parsed.action)} for you.`,
      };
    } catch (error) {
      return {
        intent: 'Unknown',
        action: 'error',
        response: `I couldn't understand your Notion request: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check if Notion integration is configured
   */
  isConfigured(): boolean {
    // For now, just check if LangChain client is configured
    // TODO: Add actual Notion API key or Zapier MCP configuration checks
    return this.langchainClient.isConfigured();
  }

  /**
   * Health check for Notion service
   */
  healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: Record<string, unknown>;
  }> {
    try {
      if (!this.isConfigured()) {
        return Promise.resolve({
          status: 'unhealthy',
          details: { error: 'LLM not configured for Notion operations' },
        });
      }

      return Promise.resolve({
        status: 'healthy',
        details: {
          toolsAvailable: this.getAllNotionTools().length,
          llmProviders: this.langchainClient.getAvailableProviders(),
          note: 'Using mock Notion API - integrate with real API for production',
        },
      });
    } catch (error) {
      return Promise.resolve({
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
}
