/**
 * Invoke Controller
 *
 * Single entry point for all Compose agent invocations.
 * Uses the invoke { context, data, metadata? } contract.
 *
 * Endpoints:
 *   GET  /invoke/providers-models — list active LLM providers and models
 *   GET  /invoke/agents           — list available agents for the current org
 *   POST /invoke                  — synchronous invocation
 *   POST /invoke/stream           — streaming invocation (SSE)
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import type {
  A2AInvokeRequest,
  A2AInvokeSuccessResponse,
  A2AInvokeErrorResponse,
  DatabaseService,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode, DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
  CurrentUser,
} from '@orchestratorai/auth-client';
import { InvokeDispatchService } from './invoke-dispatch.service';
import { AgentDefinitionService } from './agent-definition.service';
import { ProvidersModelsService } from './providers-models.service';
import { ConversationsService } from './conversations.service';
import type { ConversationRecord } from './conversations.service';

@Controller()
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class InvokeController {
  private readonly logger = new Logger(InvokeController.name);

  constructor(
    private readonly dispatch: InvokeDispatchService,
    private readonly agentDefs: AgentDefinitionService,
    private readonly providersModels: ProvidersModelsService,
    private readonly conversationsSvc: ConversationsService,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  /**
   * GET /invoke/providers-models — list active LLM providers and models
   * Optional query param: model_type (text-generation | image-generation | video-generation)
   */
  @Get('invoke/providers-models')
  async listProvidersAndModels(
    @Query('model_type') modelType?: string,
  ): Promise<{
    providers: { name: string; displayName: string; isLocal: boolean }[];
    models: {
      modelName: string;
      providerName: string;
      displayName: string;
      modelType: string;
      isLocal: boolean;
    }[];
  }> {
    return this.providersModels.fetchProvidersAndModels(modelType);
  }

  /**
   * GET /invoke/agents — list available agents for the current org
   */
  @Get('invoke/agents')
  async listAgents(
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<{ status: string; agents: unknown[] }> {
    const agents = await this.agentDefs.listAgents(orgSlug);
    return {
      status: 'ok',
      agents: agents.map((a) => ({
        id: a.slug,
        name: a.slug,
        displayName: a.name,
        type: a.agentType,
        description: a.description,
        organizationSlug: a.orgSlug ?? null,
      })),
    };
  }

  /**
   * GET /invoke/conversations — list conversations for the authenticated user.
   * User ID is extracted from the JWT token, not from query params.
   */
  @Get('invoke/conversations')
  async listConversations(
    @CurrentUser() user: { id: string },
  ): Promise<{ conversations: ConversationRecord[] }> {
    const conversations = await this.conversationsSvc.fetchForUser(user.id);
    return { conversations };
  }

  /**
   * GET /invoke/conversations/:conversationId/messages
   * Load message history for a conversation, ordered by created_at ASC.
   */
  @Get('invoke/conversations/:conversationId/messages')
  async getConversationMessages(
    @Param('conversationId') conversationId: string,
  ): Promise<{
    messages: Array<{
      id: string;
      role: string;
      content: string;
      outputType: string;
      metadata: Record<string, unknown>;
      attachments: Array<{ filename: string; mimeType: string }> | null;
      createdAt: string;
    }>;
  }> {
    const result = await this.db
      .from(null, 'conversation_messages')
      .select('id, role, content, output_type, metadata, attachments, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (result.error) {
      this.logger.error(
        `Failed to load messages for conversation ${conversationId}: ${JSON.stringify(result.error)}`,
      );
      throw new Error(`Failed to load messages: ${JSON.stringify(result.error)}`);
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    const messages = rows.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      let metadata: Record<string, unknown> = {};
      if (r.metadata) {
        if (typeof r.metadata === 'string') {
          try { metadata = JSON.parse(r.metadata); } catch { metadata = {}; }
        } else if (typeof r.metadata === 'object') {
          metadata = r.metadata as Record<string, unknown>;
        }
      }
      let attachments: Array<{ filename: string; mimeType: string }> | null = null;
      if (r.attachments) {
        if (typeof r.attachments === 'string') {
          try { attachments = JSON.parse(r.attachments); } catch { attachments = null; }
        } else if (Array.isArray(r.attachments)) {
          attachments = r.attachments as Array<{ filename: string; mimeType: string }>;
        }
      }
      return {
        id: r.id as string,
        role: r.role as string,
        content: r.content as string,
        outputType: (r.output_type as string) ?? 'text',
        metadata,
        attachments,
        createdAt: r.created_at as string,
      };
    });

    return { messages };
  }

  /**
   * DELETE /invoke/conversations/:conversationId
   * Delete a conversation and its messages (cascade handles messages).
   */
  @Delete('invoke/conversations/:conversationId')
  async deleteConversation(
    @Param('conversationId') conversationId: string,
  ): Promise<{ deleted: boolean }> {
    const result = await this.db
      .from(null, 'conversations')
      .delete()
      .eq('id', conversationId);

    if (result.error) {
      this.logger.error(
        `Failed to delete conversation ${conversationId}: ${JSON.stringify(result.error)}`,
      );
      throw new Error(`Failed to delete conversation: ${JSON.stringify(result.error)}`);
    }

    return { deleted: true };
  }

  /**
   * POST /invoke — synchronous agent invocation
   */
  @Post('invoke')
  @HttpCode(200)
  async invoke(
    @Body() body: A2AInvokeRequest,
  ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse> {
    const { id, params } = body;

    if (!params?.context || !params?.data) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: 'Missing required params: context and data',
        },
      };
    }

    try {
      const output = await this.dispatch.invoke(
        params.context,
        params.data,
        params.metadata,
      );

      return {
        jsonrpc: '2.0',
        id,
        result: {
          success: true,
          output,
          context: params.context,
        },
      };
    } catch (error) {
      this.logger.error(
        `Invoke failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
          data: {
            errorType: 'invocation_failed',
            retryable: false,
          },
        },
      };
    }
  }

  /**
   * POST /invoke/stream — streaming agent invocation (SSE)
   */
  @Post('invoke/stream')
  @HttpCode(200)
  async invokeStream(
    @Body() body: A2AInvokeRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { id, params } = body;

    if (!params?.context || !params?.data) {
      res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: 'Missing required params: context and data',
        },
      });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send SSE keepalive comments every 30s to prevent Cloudflare 524 timeouts
    const keepalive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 30_000);

    try {
      await this.dispatch.invokeStream(
        params.context,
        params.data,
        params.metadata,
        id,
        res,
      );
    } catch (error) {
      // Send error event
      const errorData = JSON.stringify({
        event: 'error',
        requestId: id,
        context: params.context,
        data: {
          code: 'invocation_failed',
          message: error instanceof Error ? error.message : 'Internal error',
          retryable: false,
        },
        timestamp: new Date().toISOString(),
      });
      res.write(`event: error\ndata: ${errorData}\n\n`);
      res.end();
    } finally {
      clearInterval(keepalive);
    }
  }
}
