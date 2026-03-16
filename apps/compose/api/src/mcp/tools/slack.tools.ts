import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MCPToolDefinition,
  MCPToolRequest,
  MCPToolResponse,
  IMCPToolHandler,
} from '../interfaces/mcp.interface';

/**
 * Slack MCP Tools Handler
 *
 * Implements productivity namespace tools for Slack workspace operations
 * Provides: messaging, channel management, user information, and search capabilities
 */
@Injectable()
export class SlackMCPTools implements IMCPToolHandler {
  private readonly logger = new Logger(SlackMCPTools.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get all Slack tools available
   */
  getTools(): Promise<MCPToolDefinition[]> {
    return Promise.resolve([
      {
        name: 'send-message',
        description: 'Send a message to a Slack channel or user',
        inputSchema: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description:
                'Channel ID or name (e.g., #general, @username, or C1234567890)',
            },
            text: {
              type: 'string',
              description: 'Message text content',
            },
            thread_ts: {
              type: 'string',
              description: 'Timestamp of parent message to reply in thread',
            },
            blocks: {
              type: 'array',
              description: 'Rich message blocks (Slack Block Kit format)',
              items: { type: 'object' },
            },
          },
          required: ['channel', 'text'],
          additionalProperties: false,
        },
      },
      {
        name: 'get-channels',
        description: 'List channels in the Slack workspace',
        inputSchema: {
          type: 'object',
          properties: {
            types: {
              type: 'string',
              description:
                'Channel types to include (public_channel, private_channel, mpim, im)',
              default: 'public_channel',
            },
            exclude_archived: {
              type: 'boolean',
              description: 'Exclude archived channels',
              default: true,
            },
            limit: {
              type: 'number',
              description: 'Maximum number of channels to return',
              default: 100,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: 'get-users',
        description: 'Get information about workspace users',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              description: 'Specific user ID to get info for',
            },
            include_deleted: {
              type: 'boolean',
              description: 'Include deleted/deactivated users',
              default: false,
            },
            limit: {
              type: 'number',
              description: 'Maximum number of users to return',
              default: 100,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: 'search-messages',
        description: 'Search for messages in Slack workspace',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query string',
            },
            channel: {
              type: 'string',
              description: 'Limit search to specific channel',
            },
            user: {
              type: 'string',
              description: 'Limit search to messages from specific user',
            },
            count: {
              type: 'number',
              description: 'Number of results to return',
              default: 20,
            },
            sort: {
              type: 'string',
              enum: ['score', 'timestamp'],
              description: 'Sort results by relevance or time',
              default: 'score',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
      {
        name: 'get-channel-history',
        description: 'Get recent messages from a channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description: 'Channel ID or name',
            },
            count: {
              type: 'number',
              description: 'Number of messages to retrieve',
              default: 100,
            },
            oldest: {
              type: 'string',
              description: 'Start of time range (Unix timestamp)',
            },
            latest: {
              type: 'string',
              description: 'End of time range (Unix timestamp)',
            },
            inclusive: {
              type: 'boolean',
              description: 'Include messages with oldest and latest timestamps',
              default: true,
            },
          },
          required: ['channel'],
          additionalProperties: false,
        },
      },
      {
        name: 'create-channel',
        description: 'Create a new Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Channel name (lowercase, no spaces)',
            },
            is_private: {
              type: 'boolean',
              description: 'Create as private channel',
              default: false,
            },
            purpose: {
              type: 'string',
              description: 'Channel purpose/description',
            },
            topic: {
              type: 'string',
              description: 'Channel topic',
            },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    ]);
  }

  /**
   * Execute a Slack tool
   */
  async executeTool(request: MCPToolRequest): Promise<MCPToolResponse> {
    const { name, arguments: args = {} } = request;

    try {
      switch (name) {
        case 'send-message':
          return await this.sendMessage(args);
        case 'get-channels':
          return await this.getChannels(args);
        case 'get-users':
          return await this.getUsers(args);
        case 'search-messages':
          return await this.searchMessages(args);
        case 'get-channel-history':
          return await this.getChannelHistory(args);
        case 'create-channel':
          return await this.createChannel(args);
        default:
          return this.createErrorResponse(`Unknown Slack tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Slack tool ${name} failed: ${errorMessage}`);
      return this.createErrorResponse(`Tool execution failed: ${errorMessage}`);
    }
  }

  /**
   * Health check for Slack API connection
   */
  async ping(): Promise<boolean> {
    try {
      // Check if basic configuration is available
      const slackToken = this.configService.get<string>('SLACK_BOT_TOKEN');

      if (!slackToken) {
        this.logger.debug(
          'Slack configuration not available - tools will be available but may fail at execution',
        );
        return false;
      }

      // Try a lightweight connection test
      const response = await this.makeSlackRequest('api.test', 'GET');
      const data = await this.parseJsonResponse(response, 'Slack api.test');
      const ok = this.readBoolean(data, 'ok');
      return ok === true;
    } catch (error) {
      this.logger.debug(
        `Slack ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Send a message to Slack
   */
  private async sendMessage(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { channel, text, thread_ts, blocks } = args;

    try {
      const payload: Record<string, unknown> = { channel, text };

      if (thread_ts) {
        payload.thread_ts = thread_ts;
      }

      if (blocks) {
        payload.blocks = blocks;
      }

      const response = await this.makeSlackRequest(
        'chat.postMessage',
        'POST',
        payload,
      );
      const data = await this.parseJsonResponse(
        response,
        'Slack chat.postMessage',
      );
      const ok = this.readBoolean(data, 'ok');

      if (!response.ok || ok === false) {
        const errorMessage =
          this.readString(data, 'error') ||
          response.statusText ||
          'Slack API error';
        throw new Error(`Slack API error: ${errorMessage}`);
      }

      const channelId = this.readString(data, 'channel');
      const timestamp = this.readString(data, 'ts');
      const message = 'message' in data ? data.message : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                channel: channelId ?? 'unknown',
                timestamp,
                message,
                sent_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.createErrorResponse(
        `Send message failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get channels list
   */
  private async getChannels(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const {
      types = 'public_channel',
      exclude_archived = true,
      limit = 100,
    } = args;

    try {
      const params = new URLSearchParams({
        types: String(types),
        exclude_archived: String(exclude_archived),
        limit: String(limit),
      });

      const response = await this.makeSlackRequest(
        `conversations.list?${params}`,
        'GET',
      );
      const data = await this.parseJsonResponse(
        response,
        'Slack conversations.list',
      );
      const ok = this.readBoolean(data, 'ok');

      if (!response.ok || ok === false) {
        const errorMessage =
          this.readString(data, 'error') ||
          response.statusText ||
          'Slack API error';
        throw new Error(`Slack API error: ${errorMessage}`);
      }

      const channels = this.readArray(data, 'channels') ?? [];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                channels,
                total_count: channels.length,
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
        `Get channels failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get users information
   */
  private async getUsers(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { user_id, include_deleted = false, limit = 100 } = args;

    try {
      if (user_id) {
        // Get specific user info
        const userId =
          typeof user_id === 'string' ? user_id : JSON.stringify(user_id);
        const response = await this.makeSlackRequest(
          `users.info?user=${userId}`,
          'GET',
        );
        const data = await this.parseJsonResponse(response, 'Slack users.info');
        const ok = this.readBoolean(data, 'ok');

        if (!response.ok || ok === false) {
          const errorMessage =
            this.readString(data, 'error') ||
            response.statusText ||
            'Slack API error';
          throw new Error(`Slack API error: ${errorMessage}`);
        }

        const user = 'user' in data ? data.user : null;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  user,
                  retrieved_at: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } else {
        // Get users list
        const params = new URLSearchParams({
          include_locale: 'false',
          limit: (limit as number).toString(),
        });

        const response = await this.makeSlackRequest(
          `users.list?${params}`,
          'GET',
        );
        const data = await this.parseJsonResponse(response, 'Slack users.list');
        const ok = this.readBoolean(data, 'ok');

        if (!response.ok || ok === false) {
          const errorMessage =
            this.readString(data, 'error') ||
            response.statusText ||
            'Slack API error';
          throw new Error(`Slack API error: ${errorMessage}`);
        }

        const members = this.readArray(data, 'members') ?? [];

        const users = include_deleted
          ? members
          : members.filter((user) => {
              if (!user || typeof user !== 'object' || Array.isArray(user)) {
                return false;
              }
              const deleted = this.readBoolean(
                user as Record<string, unknown>,
                'deleted',
              );
              return deleted !== true;
            });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  users,
                  total_count: users.length,
                  include_deleted,
                  retrieved_at: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    } catch (error) {
      return this.createErrorResponse(
        `Get users failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Search messages
   */
  private async searchMessages(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { query, channel, user, count = 20, sort = 'score' } = args;

    try {
      let searchQuery =
        typeof query === 'string' ? query : JSON.stringify(query);

      if (channel) {
        const channelStr =
          typeof channel === 'string' ? channel : JSON.stringify(channel);
        searchQuery += ` in:${channelStr}`;
      }

      if (user) {
        const userStr = typeof user === 'string' ? user : JSON.stringify(user);
        searchQuery += ` from:${userStr}`;
      }

      const params = new URLSearchParams({
        query: String(searchQuery),
        count: String(count),
        sort: String(sort),
      });

      const response = await this.makeSlackRequest(
        `search.messages?${params}`,
        'GET',
      );
      const data = await this.parseJsonResponse(
        response,
        'Slack search.messages',
      );
      const ok = this.readBoolean(data, 'ok');

      if (!response.ok || ok === false) {
        const errorMessage =
          this.readString(data, 'error') ||
          response.statusText ||
          'Slack API error';
        throw new Error(`Slack API error: ${errorMessage}`);
      }

      const messages = this.ensureObject(
        'messages' in data ? data.messages : {},
        'Slack search.messages response payload',
      );
      const matches = Array.isArray(messages.matches) ? messages.matches : [];
      const total =
        typeof messages.total === 'number' ? messages.total : matches.length;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                matches,
                total,
                query: searchQuery,
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
        `Search messages failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get channel history
   */
  private async getChannelHistory(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { channel, count = 100, oldest, latest, inclusive = true } = args;

    try {
      const channelStr = channel as string;
      const countNum = count as number;
      const inclusiveBool = inclusive as boolean;
      const params = new URLSearchParams({
        channel: channelStr,
        limit: countNum.toString(),
        inclusive: inclusiveBool.toString(),
      });

      const oldestStr = oldest as string | undefined;
      if (oldestStr) {
        params.append('oldest', oldestStr);
      }

      const latestStr = latest as string | undefined;
      if (latestStr) {
        params.append('latest', latestStr);
      }

      const response = await this.makeSlackRequest(
        `conversations.history?${params}`,
        'GET',
      );
      const data = await this.parseJsonResponse(
        response,
        'Slack conversations.history',
      );
      const ok = this.readBoolean(data, 'ok');

      if (!response.ok || ok === false) {
        const errorMessage =
          this.readString(data, 'error') ||
          response.statusText ||
          'Slack API error';
        throw new Error(`Slack API error: ${errorMessage}`);
      }

      const messages = this.readArray(data, 'messages') ?? [];
      const hasMore = this.readBoolean(data, 'has_more') ?? false;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                messages,
                has_more: hasMore,
                channel,
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
        `Get channel history failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create a new channel
   */
  private async createChannel(
    args: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    const { name, is_private = false, purpose, topic } = args;

    try {
      const payload: Record<string, unknown> = { name, is_private };

      const response = await this.makeSlackRequest(
        'conversations.create',
        'POST',
        payload,
      );
      const data = await this.parseJsonResponse(
        response,
        'Slack conversations.create',
      );
      const ok = this.readBoolean(data, 'ok');

      if (!response.ok || ok === false) {
        const errorMessage =
          this.readString(data, 'error') ||
          response.statusText ||
          'Slack API error';
        throw new Error(`Slack API error: ${errorMessage}`);
      }

      const channelRecord = this.ensureObject(
        'channel' in data ? data.channel : {},
        'Slack conversations.create channel payload',
      );
      const channelId = this.readString(channelRecord, 'id');

      if (!channelId) {
        throw new Error('Slack API response missing channel identifier');
      }

      if (purpose) {
        await this.makeSlackRequest('conversations.setPurpose', 'POST', {
          channel: channelId,
          purpose,
        });
      }

      if (topic) {
        await this.makeSlackRequest('conversations.setTopic', 'POST', {
          channel: channelId,
          topic,
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                channel: channelRecord,
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
        `Create channel failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Make authenticated request to Slack API
   */
  private async makeSlackRequest(
    endpoint: string,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    const slackToken =
      this.configService.get<string>('SLACK_BOT_TOKEN') ||
      this.configService.get<string>('SLACK_API_TOKEN');

    if (!slackToken) {
      throw new Error('Slack token not configured');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${slackToken}`,
      'Content-Type': 'application/json',
    };

    const url = `https://slack.com/api/${endpoint}`;

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
