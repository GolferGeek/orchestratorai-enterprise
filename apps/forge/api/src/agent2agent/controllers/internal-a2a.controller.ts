/**
 * Internal A2A Controller
 *
 * Accepts JSON-RPC 2.0 requests from internal services (Pulse, Bridge)
 * and routes them through the standard AgentExecutionGateway.
 *
 * Authentication: shared INTERNAL_SERVICE_KEY (not JWT).
 * This is the proper A2A path for system-originated triggers —
 * the same agent lookup, mode routing, and execution as external A2A,
 * but without requiring a user JWT.
 *
 * Used by Pulse DB watchers to trigger agent workflows when
 * database events fire (e.g., new article → predictor agent).
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../auth/decorators/public.decorator';
import { AgentExecutionGateway } from '../services/agent-execution-gateway.service';
import { AgentRegistryService } from '../../agent-platform/services/agent-registry.service';
import { TaskResponseDto } from '../dto/task-response.dto';
import { AgentTaskMode } from '../dto/task-request.dto';
import { JsonRpcResponseService } from '../services/json-rpc-response.service';
import {
  ExecutionContext,
  A2ATaskSuccessResponse,
  A2ATaskErrorResponse,
} from '@orchestrator-ai/transport-types';

interface InternalA2ARequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: {
    context: ExecutionContext;
    mode: string;
    userMessage?: string;
    payload?: Record<string, unknown>;
  };
}

@Controller('agent-to-agent/internal')
export class InternalA2AController {
  private readonly logger = new Logger(InternalA2AController.name);

  constructor(
    private readonly gateway: AgentExecutionGateway,
    private readonly agentRegistry: AgentRegistryService,
    private readonly configService: ConfigService,
    private readonly jsonRpcResponse: JsonRpcResponseService,
  ) {}

  /**
   * Internal A2A task execution.
   *
   * POST /agent-to-agent/internal/tasks
   *
   * Accepts JSON-RPC 2.0 from internal services (Pulse trigger executor).
   * Validates INTERNAL_SERVICE_KEY header, then routes through the
   * standard AgentExecutionGateway — same as external A2A.
   */
  @Post('tasks')
  @Public()
  @HttpCode(HttpStatus.OK)
  async executeInternalTask(
    @Body() body: InternalA2ARequest,
    @Headers('x-internal-service-key') serviceKey?: string,
  ): Promise<A2ATaskSuccessResponse | A2ATaskErrorResponse> {
    // Validate internal service key
    const expectedKey = this.configService.get<string>('INTERNAL_SERVICE_KEY');
    if (expectedKey && serviceKey !== expectedKey) {
      throw new UnauthorizedException('Invalid internal service key');
    }

    // Validate JSON-RPC format
    if (body.jsonrpc !== '2.0' || !body.params?.context) {
      return {
        jsonrpc: '2.0',
        id: body.id ?? 'unknown',
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC 2.0 request: missing params.context',
        },
      };
    }

    const { context, mode, userMessage, payload } = body.params;

    this.logger.log(
      `[INTERNAL-A2A] Request: agent=${context.agentSlug}, mode=${mode}, method=${body.method}`,
    );

    // Validate agent exists
    const agent = await this.agentRegistry.getAgent(
      context.orgSlug,
      context.agentSlug,
    );
    if (!agent) {
      return {
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32001,
          message: `Agent ${context.agentSlug} not found in organization ${context.orgSlug}`,
        },
      };
    }

    try {
      // Parse mode from JSON-RPC method (e.g., "runner.process-article" → mode="runner")
      const parsedMode = mode ?? body.method?.split('.')[0] ?? 'converse';
      const parsedAction = body.method?.split('.').slice(1).join('.') ?? undefined;

      // Build TaskRequestDto — same structure the gateway expects
      const taskRequest = {
        context,
        mode: parsedMode as AgentTaskMode,
        userMessage,
        payload: {
          ...(payload ?? {}),
          // Include action in payload for runner-mode routing
          ...(parsedAction ? { action: parsedAction, method: `${parsedMode}.${parsedAction}` } : {}),
        },
      };

      // Route through the standard execution gateway
      const result = await this.gateway.execute(context, taskRequest);

      // Wrap in JSON-RPC 2.0 response
      return {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          success: result.success,
          mode: result.mode,
          payload: result.payload,
          context,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[INTERNAL-A2A] Execution failed: ${message}`);

      return {
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32000,
          message,
        },
      };
    }
  }
}
