import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AgentTaskMode,
  NormalizedTaskRequestDto,
  TaskRequestDto,
} from '../dto/task-request.dto';
import { LlmSelection } from './agent-tasks.service';

export interface FrontendTaskRequest {
  jsonrpc?: string;
  mode?: string;
  method?: string;
  prompt?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  conversationId?: string;
  params?: Record<string, unknown>;
  llmSelection?: LlmSelection;
  executionMode?: string;
  taskId?: string;
  timeoutSeconds?: number;
  metadata?: Record<string, unknown>;
  id?: string;
  [key: string]: unknown;
}

export interface NormalizedTaskRequest {
  dto: NormalizedTaskRequestDto;
  jsonrpc?: {
    id: string | number | null;
    method?: string | null;
  };
}

@Injectable()
export class RequestNormalizationService {
  private readonly logger = new Logger(RequestNormalizationService.name);

  /**
   * Adapt frontend CreateTaskDto format to Agent2Agent TaskRequestDto format.
   * Frontend sends: { method, prompt, conversationHistory, llmSelection, ... }
   * Backend expects: { mode, userMessage, messages, payload, metadata, ... }
   */
  adaptFrontendRequest(body: FrontendTaskRequest): FrontendTaskRequest {
    // Check if it's JSON-RPC format (frontend now sends this for database agents)
    if (body.jsonrpc === '2.0') {
      return body; // Let normalizeTaskRequest handle JSON-RPC
    }

    // If it already has 'mode' field, assume it's already in correct format
    if (body.mode) {
      return body;
    }

    // Transform frontend format to backend format
    const adapted: FrontendTaskRequest = {
      // Map 'method' to 'mode' enum
      mode: body.method || 'converse',

      // Map 'prompt' to 'userMessage' (also pass through userMessage if already set)
      userMessage: body.prompt || body.userMessage,

      // Map 'conversationHistory' to 'messages'
      messages: body.conversationHistory?.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),

      // Pass through standard fields
      conversationId: body.conversationId,

      // CRITICAL: Pass through ExecutionContext (required for all A2A requests)
      context: body.context,

      // Pack additional data into payload
      // CRITICAL: Preserve body.payload (contains documents for JSON-based upload)
      payload: {
        ...(body.params || {}),
        ...(body.payload || {}),
        llmSelection: body.llmSelection,
        executionMode: body.executionMode,
        taskId: body.taskId,
        timeoutSeconds: body.timeoutSeconds,
      },

      // Preserve metadata
      metadata: body.metadata,
    };

    return adapted;
  }

  async normalizeTaskRequest(payload: unknown): Promise<NormalizedTaskRequest> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Request body must be a JSON object.');
    }

    const typedPayload = payload as {
      jsonrpc?: unknown;
      params?: unknown;
      method?: unknown;
      mode?: unknown;
      id?: unknown;
    };

    const isJsonRpc =
      typeof typedPayload.jsonrpc === 'string' &&
      typedPayload.jsonrpc.length > 0;

    // For JSON-RPC, params may contain both standard DTO fields AND arbitrary params (like taskId for HITL)
    // We need to preserve all params in the payload field so they're not stripped by whitelist validation
    const paramsObj = isJsonRpc
      ? ((typedPayload.params ?? {}) as Record<string, unknown>)
      : {};

    const candidateSource = isJsonRpc
      ? (typedPayload.params ?? {})
      : typedPayload;
    const candidate = { ...(candidateSource as Record<string, unknown>) };

    // DEBUG: Log userMessage extraction for Marketing Swarm debugging
    if (isJsonRpc && (candidate as Record<string, unknown>).userMessage) {
      const userMsg = (candidate as Record<string, unknown>).userMessage;
      this.logger.log(
        `[MarketingSwarm-DEBUG] Found userMessage in candidate: type=${typeof userMsg}, length=${typeof userMsg === 'string' ? userMsg.length : 'N/A'}, preview=${typeof userMsg === 'string' ? userMsg.substring(0, 100) : 'N/A'}`,
      );
    }

    // For JSON-RPC, ensure all params are preserved in payload (including taskId, decision, etc.)
    // This prevents whitelist validation from stripping non-standard DTO fields
    if (isJsonRpc) {
      const existingPayload =
        (candidate as Record<string, unknown>).payload || {};
      (candidate as Record<string, unknown>).payload = {
        ...(existingPayload as Record<string, unknown>),
        ...paramsObj, // Preserve all JSON-RPC params
        method: typedPayload.method, // Also store the JSON-RPC method
      };
    }

    if (
      isJsonRpc &&
      !(candidate as Record<string, unknown>).mode &&
      typeof typedPayload.method === 'string'
    ) {
      const mapped = this.mapMethodToMode(typedPayload.method);
      if (mapped) {
        (candidate as Record<string, unknown>).mode = mapped;
      }
    }

    const dto = plainToInstance(TaskRequestDto, candidate);

    // DEBUG: Log userMessage after DTO transformation for Marketing Swarm debugging
    if (
      dto.userMessage ||
      (dto.payload as Record<string, unknown>)?.userMessage
    ) {
      const topLevel = dto.userMessage;
      const inPayload = (dto.payload as Record<string, unknown>)
        ?.userMessage as string | undefined;
      this.logger.log(
        `[MarketingSwarm-DEBUG] After DTO: userMessage=${!!topLevel}, payload.userMessage=${!!inPayload}, topLevelLength=${topLevel?.length || 0}, payloadLength=${inPayload?.length || 0}`,
      );
    }

    const errors = await validate(dto, {
      whitelist: true,
      forbidUnknownValues: false,
      forbidNonWhitelisted: false,
    });

    if (errors.length) {
      throw new BadRequestException(this.formatValidationErrors(errors));
    }

    // Ensure mode is always set (default to converse if not specified)
    if (!dto.mode) {
      dto.mode = AgentTaskMode.CONVERSE;
    }

    let jsonrpc: NormalizedTaskRequest['jsonrpc'] | undefined;

    if (isJsonRpc) {
      const jsonrpcContext: NonNullable<NormalizedTaskRequest['jsonrpc']> = {
        id:
          typeof typedPayload.id === 'string' ||
          typeof typedPayload.id === 'number'
            ? typedPayload.id
            : null,
        method:
          typeof typedPayload.method === 'string' ? typedPayload.method : null,
      };

      dto.metadata = {
        ...(dto.metadata ?? {}),
        jsonrpc: jsonrpcContext,
      };

      jsonrpc = jsonrpcContext;
    }

    return { dto: dto as NormalizedTaskRequestDto, jsonrpc };
  }

  mapMethodToMode(method: string): AgentTaskMode | undefined {
    const normalized = method.trim().toLowerCase();
    switch (normalized) {
      case 'converse':
      case 'agent.converse':
      case 'tasks.converse':
        return AgentTaskMode.CONVERSE;
      case 'plan':
      case 'agent.plan':
      case 'tasks.plan':
        return AgentTaskMode.PLAN;
      case 'build':
      case 'agent.build':
      case 'tasks.build':
        return AgentTaskMode.BUILD;
      case 'hitl':
      case 'hitl.resume':
      case 'hitl.status':
      case 'hitl.history':
      case 'agent.hitl':
      case 'tasks.hitl':
        return AgentTaskMode.HITL;
      default:
        return undefined;
    }
  }

  private formatValidationErrors(
    errors: Array<{
      constraints?: Record<string, string>;
      children?: Array<{
        constraints?: Record<string, string>;
        children?: unknown[];
      }>;
    }>,
  ): string {
    const messages = errors
      .map((error) => {
        if (error.constraints) {
          return Object.values(error.constraints).join(', ');
        }
        if (error.children && error.children.length) {
          return this.formatValidationErrors(
            error.children as unknown as Array<{
              constraints?: Record<string, string>;
              children?: Array<{
                constraints?: Record<string, string>;
                children?: unknown[];
              }>;
            }>,
          );
        }
        return null;
      })
      .filter((message): message is string => Boolean(message));

    return messages.length
      ? messages.join('; ')
      : 'Invalid task request payload.';
  }
}
