/**
 * Invoke Controller
 *
 * Single entry point for all Agent invocations.
 * Uses the invoke { context, data, metadata? } contract.
 *
 * Endpoints:
 *   GET  /invoke/providers-models — list active LLM providers and models
 *   GET  /invoke/agents           — list available agents for the current org
 *   POST /invoke                  — synchronous invocation
 *   POST /invoke/stream           — streaming invocation (SSE)
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import type {
  A2AInvokeSuccessResponse,
  A2AInvokeErrorResponse,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { InvokeDispatchService } from './invoke-dispatch.service';
import { AgentDefinitionService } from './agent-definition.service';
import { ProvidersModelsService } from './providers-models.service';
import { ConversationsService } from './conversations.service';
import type { ConversationRecord } from './conversations.service';
import { validateA2AInvokeRequest } from '../../common/validation/a2a-invoke-validation';

interface AuthorizedRequest {
  organizationSlug?: string;
}

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
    if (
      modelType !== undefined &&
      !['text-generation', 'image-generation', 'video-generation'].includes(
        modelType,
      )
    ) {
      throw new BadRequestException('Unsupported model_type');
    }
    return this.providersModels.fetchProvidersAndModels(modelType);
  }

  /**
   * GET /invoke/agents — list available agents for the current org
   */
  @Get('invoke/agents')
  async listAgents(
    @Req() request: AuthorizedRequest,
  ): Promise<{ status: string; agents: unknown[] }> {
    const agents = await this.agentDefs.listAgents(
      this.requireAuthorizedOrganization(request),
    );
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
    @Req() request: AuthorizedRequest,
  ): Promise<{ conversations: ConversationRecord[] }> {
    const conversations = await this.conversationsSvc.fetchForUser(
      user.id,
      this.requireAuthorizedOrganization(request),
    );
    return { conversations };
  }

  /**
   * GET /invoke/conversations/:conversationId/messages
   * Load message history for a conversation, ordered by created_at ASC.
   */
  @Get('invoke/conversations/:conversationId/messages')
  async getConversationMessages(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    const messages = await this.conversationsSvc.fetchMessagesForUser(
      conversationId,
      user.id,
      this.requireAuthorizedOrganization(request),
    );
    return { messages };
  }

  /**
   * DELETE /invoke/conversations/:conversationId
   * Delete a conversation and its messages (cascade handles messages).
   */
  @Delete('invoke/conversations/:conversationId')
  async deleteConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<{ deleted: boolean }> {
    await this.conversationsSvc.deleteForUser(
      conversationId,
      user.id,
      this.requireAuthorizedOrganization(request),
    );
    return { deleted: true };
  }

  /**
   * POST /invoke — synchronous agent invocation
   */
  @Post('invoke')
  @HttpCode(200)
  async invoke(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse> {
    const validation = validateA2AInvokeRequest(
      body,
      user.id,
      request.organizationSlug,
    );
    if (!validation.valid) {
      return {
        jsonrpc: '2.0',
        id: validation.id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: validation.message,
        },
      };
    }
    const { id, params } = validation.request;

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
    } catch {
      this.logger.error('Agent invoke failed');

      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Agent invocation failed',
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
    @Body() body: unknown,
    @Res() res: Response,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<void> {
    const validation = validateA2AInvokeRequest(
      body,
      user.id,
      request.organizationSlug,
    );
    if (!validation.valid) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: validation.id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: validation.message,
        },
      });
      return;
    }
    const { id, params } = validation.request;

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
    } catch {
      // Send error event
      const errorData = JSON.stringify({
        event: 'error',
        requestId: id,
        context: params.context,
        data: {
          code: 'invocation_failed',
          message: 'Agent invocation failed',
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

  private requireAuthorizedOrganization(request: AuthorizedRequest): string {
    if (!request.organizationSlug) {
      throw new Error('RBAC did not bind an authorized organization');
    }
    return request.organizationSlug;
  }
}
