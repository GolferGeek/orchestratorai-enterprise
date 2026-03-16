import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MCPToolDefinition,
  MCPToolRequest,
  MCPToolResponse,
  IMCPToolHandler,
} from '../interfaces/mcp.interface';

/**
 * Notion MCP Tools Handler
 *
 * Implements productivity namespace tools for Notion workspace operations
 * Provides: page management, database operations, search, and content creation
 */
@Injectable()
export class NotionMCPTools implements IMCPToolHandler {
  private readonly logger = new Logger(NotionMCPTools.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get all Notion tools available
   */
  getTools(): Promise<MCPToolDefinition[]> {
    return Promise.resolve([
      {
        name: 'create-page',
        description: 'Create a new page in Notion workspace',
        inputSchema: {
          type: 'object',
          properties: {
            parent: {
              type: 'object',
              description: 'Parent page or database ID',
              properties: {
                type: {
                  type: 'string',
                  enum: ['page_id', 'database_id', 'workspace'],
                },
                id: {
                  type: 'string',
                  description: 'Parent ID (required if type is not workspace)',
                },
              },
              required: ['type'],
            },
            title: {
              type: 'string',
              description: 'Page title',
            },
            content: {
              type: 'array',
              description: 'Page content blocks',
              items: {
                type: 'object',
                description: 'Notion block object',
              },
            },
            properties: {
              type: 'object',
              description: 'Page properties (for database pages)',
              additionalProperties: true,
            },
          },
          required: ['parent', 'title'],
          additionalProperties: false,
        },
      },
      {
        name: 'query-database',
        description: 'Query a Notion database with filters and sorting',
        inputSchema: {
          type: 'object',
          properties: {
            database_id: {
              type: 'string',
              description: 'Database ID to query',
            },
            filter: {
              type: 'object',
              description: 'Filter criteria for the query',
              additionalProperties: true,
            },
            sorts: {
              type: 'array',
              description: 'Sort criteria',
              items: {
                type: 'object',
                properties: {
                  property: { type: 'string' },
                  direction: {
                    type: 'string',
                    enum: ['ascending', 'descending'],
                  },
                },
              },
            },
            start_cursor: {
              type: 'string',
              description: 'Pagination cursor',
            },
            page_size: {
              type: 'number',
              description: 'Number of results to return',
              maximum: 100,
              default: 100,
            },
          },
          required: ['database_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'search-content',
        description: 'Search for pages and databases in Notion workspace',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query string',
            },
            filter: {
              type: 'object',
              description: 'Filter by object type',
              properties: {
                value: {
                  type: 'string',
                  enum: ['page', 'database'],
                },
                property: {
                  type: 'string',
                  enum: ['object'],
                },
              },
            },
            sort: {
              type: 'object',
              description: 'Sort results',
              properties: {
                direction: {
                  type: 'string',
                  enum: ['ascending', 'descending'],
                },
                timestamp: {
                  type: 'string',
                  enum: ['last_edited_time'],
                },
              },
            },
            start_cursor: {
              type: 'string',
              description: 'Pagination cursor',
            },
            page_size: {
              type: 'number',
              description: 'Number of results to return',
              maximum: 100,
              default: 100,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: 'get-page',
        description: 'Retrieve a specific page by ID',
        inputSchema: {
          type: 'object',
          properties: {
            page_id: {
              type: 'string',
              description: 'Page ID to retrieve',
            },
            include_content: {
              type: 'boolean',
              description: 'Include page content blocks',
              default: false,
            },
          },
          required: ['page_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'update-page',
        description: 'Update an existing page properties or content',
        inputSchema: {
          type: 'object',
          properties: {
            page_id: {
              type: 'string',
              description: 'Page ID to update',
            },
            properties: {
              type: 'object',
              description: 'Properties to update',
              additionalProperties: true,
            },
            archived: {
              type: 'boolean',
              description: 'Archive or unarchive the page',
            },
          },
          required: ['page_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'append-blocks',
        description: 'Append content blocks to a page',
        inputSchema: {
          type: 'object',
          properties: {
            page_id: {
              type: 'string',
              description: 'Page ID to append content to',
            },
            children: {
              type: 'array',
              description: 'Content blocks to append',
              items: {
                type: 'object',
                description: 'Notion block object',
              },
            },
          },
          required: ['page_id', 'children'],
          additionalProperties: false,
        },
      },
      {
        name: 'get-databases',
        description: 'List all databases in the workspace',
        inputSchema: {
          type: 'object',
          properties: {
            start_cursor: {
              type: 'string',
              description: 'Pagination cursor',
            },
            page_size: {
              type: 'number',
              description: 'Number of results to return',
              maximum: 100,
              default: 100,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
    ]);
  }

  /**
   * Execute a Notion tool
   */
  async executeTool(request: MCPToolRequest): Promise<MCPToolResponse> {
    const { name, arguments: args = {} } = request;

    try {
      switch (name) {
        case 'create-page':
          return await this.createPage(args);
        case 'query-database':
          return await this.queryDatabase(args);
        case 'search-content':
          return await this.searchContent(args);
        case 'get-page':
          return await this.getPage(args);
        case 'update-page':
          return await this.updatePage(args);
        case 'append-blocks':
          return await this.appendBlocks(args);
        case 'get-databases':
          return await this.getDatabases(args);
        default:
          return this.createErrorResponse(`Unknown Notion tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Notion tool ${name} failed: ${errorMessage}`);
      return this.createErrorResponse(`Tool execution failed: ${errorMessage}`);
    }
  }

  /**
   * Health check for Notion API connection
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.makeNotionRequest('users/me', 'GET');
      return response.ok;
    } catch (error) {
      this.logger.warn(
        `Notion ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Create a new page
   */
  private async createPage(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { parent, title, content = [], properties = {} } = args;

    try {
      const propsObj =
        typeof properties === 'object' && properties !== null
          ? (properties as Record<string, unknown>)
          : {};
      const contentArray = Array.isArray(content) ? content : [];

      const payload: Record<string, unknown> = {
        parent,
        properties: {
          title: {
            title: [
              {
                type: 'text',
                text: {
                  content: title,
                },
              },
            ],
          },
          ...propsObj,
        },
      };

      if (contentArray.length > 0) {
        payload.children = contentArray;
      }

      const response = await this.makeNotionRequest('pages', 'POST', payload);
      const data = await this.parseJsonResponse(response, 'Notion create page');

      if (!response.ok) {
        const errorMessage =
          this.readString(data, 'message') ||
          response.statusText ||
          'Notion API error';
        throw new Error(`Notion API error: ${errorMessage}`);
      }

      const pageId = this.readString(data, 'id');
      const pageUrl = this.readString(data, 'url');
      const createdTime = this.readString(data, 'created_time');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                page_id: pageId,
                url: pageUrl,
                title,
                created_time: createdTime,
                created_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Create page failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Query a database
   */
  private async queryDatabase(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { database_id, filter, sorts, start_cursor, page_size = 100 } = args;

    try {
      const payload: Record<string, unknown> = { page_size };

      if (filter) {
        payload.filter = filter;
      }

      if (sorts) {
        payload.sorts = sorts;
      }

      if (start_cursor) {
        payload.start_cursor = start_cursor;
      }

      const response = await this.makeNotionRequest(
        `databases/${String(database_id)}/query`,
        'POST',
        payload,
      );
      const data = await this.parseJsonResponse(
        response,
        'Notion query database response',
      );

      if (!response.ok) {
        const errorMessage =
          this.readString(data, 'message') ||
          response.statusText ||
          'Notion API error';
        throw new Error(`Notion API error: ${errorMessage}`);
      }

      const results = this.readArray(data, 'results') ?? [];
      const hasMore = this.readBoolean(data, 'has_more') ?? false;
      const nextCursor = this.readString(data, 'next_cursor');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                results,
                has_more: hasMore,
                next_cursor: nextCursor,
                total_count: results.length,
                queried_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Query database failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Search content in workspace
   */
  private async searchContent(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { query, filter, sort, start_cursor, page_size = 100 } = args;

    try {
      const payload: Record<string, unknown> = { page_size };

      if (query) {
        payload.query = query;
      }

      if (filter) {
        payload.filter = filter;
      }

      if (sort) {
        payload.sort = sort;
      }

      if (start_cursor) {
        payload.start_cursor = start_cursor;
      }

      const response = await this.makeNotionRequest('search', 'POST', payload);
      const data = await this.parseJsonResponse(
        response,
        'Notion search content',
      );

      if (!response.ok) {
        const errorMessage =
          this.readString(data, 'message') ||
          response.statusText ||
          'Notion API error';
        throw new Error(`Notion API error: ${errorMessage}`);
      }

      const results = this.readArray(data, 'results') ?? [];
      const hasMore = this.readBoolean(data, 'has_more') ?? false;
      const nextCursor = this.readString(data, 'next_cursor');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                results,
                has_more: hasMore,
                next_cursor: nextCursor,
                total_count: results.length,
                query: query || 'all content',
                searched_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Search content failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get a specific page
   */
  private async getPage(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { page_id, include_content = false } = args;

    try {
      const response = await this.makeNotionRequest(
        `pages/${String(page_id)}`,
        'GET',
      );
      const data = await this.parseJsonResponse(response, 'Notion get page');

      if (!response.ok) {
        const errorMessage =
          this.readString(data, 'message') ||
          response.statusText ||
          'Notion API error';
        throw new Error(`Notion API error: ${errorMessage}`);
      }

      let content: unknown = undefined;
      if (include_content) {
        try {
          const contentResponse = await this.makeNotionRequest(
            `blocks/${String(page_id)}/children`,
            'GET',
          );
          const contentData = await this.parseJsonResponse(
            contentResponse,
            'Notion page content',
          );
          if (contentResponse.ok) {
            content = this.readArray(contentData, 'results') ?? [];
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch page content: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                page: data,
                content,
                retrieved_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Get page failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update a page
   */
  private async updatePage(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { page_id, properties, archived } = args;

    try {
      const payload: Record<string, unknown> = {};

      if (properties) {
        payload.properties = properties;
      }

      if (archived !== undefined) {
        payload.archived = archived;
      }

      const response = await this.makeNotionRequest(
        `pages/${String(page_id)}`,
        'PATCH',
        payload,
      );
      const data = await this.parseJsonResponse(response, 'Notion update page');

      if (!response.ok) {
        const errorMessage =
          this.readString(data, 'message') ||
          response.statusText ||
          'Notion API error';
        throw new Error(`Notion API error: ${errorMessage}`);
      }

      const pageId = this.readString(data, 'id');
      const editedTime = this.readString(data, 'last_edited_time');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                page_id: pageId,
                last_edited_time: editedTime,
                updated_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Update page failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Append blocks to a page
   */
  private async appendBlocks(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { page_id, children } = args;

    try {
      const payload = { children };

      const response = await this.makeNotionRequest(
        `blocks/${String(page_id)}/children`,
        'PATCH',
        payload,
      );
      const data = await this.parseJsonResponse(
        response,
        'Notion append blocks response',
      );

      if (!response.ok) {
        const errorMessage =
          this.readString(data, 'message') ||
          response.statusText ||
          'Notion API error';
        throw new Error(`Notion API error: ${errorMessage}`);
      }

      const results = this.readArray(data, 'results') ?? [];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                blocks_added: results.length,
                page_id,
                appended_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Append blocks failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get all databases
   */
  private async getDatabases(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { start_cursor, page_size = 100 } = args;

    try {
      const payload: Record<string, unknown> = {
        filter: {
          value: 'database',
          property: 'object',
        },
        page_size,
      };

      if (start_cursor) {
        payload.start_cursor = start_cursor;
      }

      const response = await this.makeNotionRequest('search', 'POST', payload);
      const data = await this.parseJsonResponse(
        response,
        'Notion search databases',
      );

      if (!response.ok) {
        const errorMessage =
          this.readString(data, 'message') ||
          response.statusText ||
          'Notion API error';
        throw new Error(`Notion API error: ${errorMessage}`);
      }

      const databases = this.readArray(data, 'results') ?? [];
      const hasMore = this.readBoolean(data, 'has_more') ?? false;
      const nextCursor = this.readString(data, 'next_cursor');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                databases,
                has_more: hasMore,
                next_cursor: nextCursor,
                total_count: databases.length,
                retrieved_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Get databases failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Make authenticated request to Notion API
   */
  private async makeNotionRequest(
    endpoint: string,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    const notionToken =
      this.configService.get<string>('NOTION_API_TOKEN') ||
      this.configService.get<string>('NOTION_TOKEN');

    if (!notionToken) {
      throw new Error('Notion API token not configured');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    const url = `https://api.notion.com/v1/${endpoint}`;

    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async parseJsonResponse(
    response: { json(): Promise<unknown> },
    context: string,
  ): Promise<Record<string, unknown>> {
    const value = await response.json();
    return this.ensureObject(value, `${context} returned invalid JSON payload`);
  }

  private ensureObject(
    value: unknown,
    errorContext: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(errorContext);
    }
    return value as Record<string, unknown>;
  }

  private readString(
    source: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
  }

  private readBoolean(
    source: Record<string, unknown>,
    key: string,
  ): boolean | undefined {
    const value = source[key];
    return typeof value === 'boolean' ? value : undefined;
  }

  private readArray(
    source: Record<string, unknown>,
    key: string,
  ): unknown[] | undefined {
    const value = source[key];
    return Array.isArray(value) ? value : undefined;
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
