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
  Get,
  Headers,
  HttpCode,
  Logger,
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
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InvokeDispatchService } from './invoke-dispatch.service';
import { AgentDefinitionService } from './agent-definition.service';
import { ProvidersModelsService } from './providers-models.service';
import { ConversationsService } from './conversations.service';
import type { ConversationRecord } from './conversations.service';

@Controller()
@UseGuards(JwtAuthGuard)
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
    }
  }
}
