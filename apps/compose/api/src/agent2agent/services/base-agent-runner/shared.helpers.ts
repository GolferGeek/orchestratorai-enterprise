import { NotFoundException } from '@nestjs/common';
import { LLMServiceProvider } from '@/planes/llm/llm.interface';
import type { LLMResponse } from '@llm/services/llm-interfaces';
import type { ConversationMessage } from '../../context-optimization/context-optimization.service';
import { PlansService } from '../../plans/services/plans.service';
import { DeliverablesService } from '../../deliverables/deliverables.service';
import { Agent2AgentConversationsService } from '../agent-conversations.service';
import { ContextOptimizationService } from '../../context-optimization/context-optimization.service';
import { TaskRequestDto, AgentTaskMode } from '../../dto/task-request.dto';
import { TaskResponseDto } from '../../dto/task-response.dto';
import type { AgentRuntimeDefinition } from '../../../agent-platform/interfaces/agent.interface';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Fetches conversation history required for agent execution.
 * @param conversationsService - Conversations service dependency
 * @param request - Task request containing conversation identifiers
 * @returns A list of conversation messages
 */
export async function fetchConversationHistory(
  conversationsService: Agent2AgentConversationsService,
  request: TaskRequestDto,
): Promise<ConversationMessage[]> {
  const inlineMessages = Array.isArray(request.messages)
    ? request.messages
        .map((message) => ({
          role: String(message.role ?? '').trim() || 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content ?? ''),
          timestamp: new Date().toISOString(),
        }))
        .filter((message) => message.content.length > 0)
    : [];

  const userId = resolveUserId(request);
  const conversationId = resolveConversationId(request);

  if (!userId || !conversationId) {
    return inlineMessages;
  }

  try {
    const conversation = await conversationsService.getConversationById({
      conversationId,
      userId,
    });

    const metadataHistory = conversation?.metadata?.history;
    if (!Array.isArray(metadataHistory)) {
      return inlineMessages;
    }

    const normalizedHistory = metadataHistory
      .map((item: unknown): ConversationMessage | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const itemRec = item as Record<string, unknown>;
        const role = typeof itemRec.role === 'string' ? itemRec.role : null;
        const content =
          typeof itemRec.content === 'string'
            ? itemRec.content
            : typeof itemRec.content !== 'undefined'
              ? JSON.stringify(itemRec.content)
              : null;
        if (!role || !content) {
          return null;
        }

        return {
          role,
          content,
          timestamp:
            typeof itemRec.timestamp === 'string'
              ? itemRec.timestamp
              : new Date().toISOString(),
          metadata:
            itemRec.metadata && typeof itemRec.metadata === 'object'
              ? (itemRec.metadata as Record<string, unknown>)
              : undefined,
        };
      })
      .filter((message): message is ConversationMessage => Boolean(message));

    return normalizedHistory.length > 0 ? normalizedHistory : inlineMessages;
  } catch {
    return inlineMessages;
  }
}

/**
 * Fetches existing plan data for the provided request context.
 * @param plansService - Plans service dependency
 * @param request - Task request containing plan identifiers
 * @returns The plan data if present
 */
export async function fetchExistingPlan(
  plansService: PlansService,
  request: TaskRequestDto,
): Promise<unknown> {
  const userId = resolveUserId(request);
  if (!userId) {
    return null;
  }

  const payload = request.payload as Record<string, unknown>;
  const metadata = request.metadata as Record<string, unknown>;
  const planIdCandidates: Array<unknown> = [
    request.context?.planId,
    payload?.planId,
    (payload?.plan as Record<string, unknown>)?.id,
    metadata?.planId,
    metadata?.plan_id,
  ];

  const planId = planIdCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );

  try {
    // Use the ExecutionContext from the request, updating planId if found
    const executionContext = request.context;
    if (!executionContext) {
      return null;
    }

    // If we found a planId from various sources, use a context with that planId
    const contextWithPlan: ExecutionContext = planId
      ? { ...executionContext, planId }
      : executionContext;

    if (planId) {
      return await plansService.findOne(contextWithPlan);
    }

    return await plansService.findByConversationId(contextWithPlan);
  } catch (error) {
    if (error instanceof NotFoundException) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetches deliverable details used for BUILD mode helpers.
 * @param deliverablesService - Deliverables service dependency
 * @param request - Task request containing deliverable identifiers
 * @returns Deliverable payload data
 */
export async function fetchExistingDeliverable(
  deliverablesService: DeliverablesService,
  request: TaskRequestDto,
): Promise<unknown> {
  const userId = resolveUserId(request);
  if (!userId) {
    return null;
  }

  const payload = request.payload as Record<string, unknown>;
  const metadata = request.metadata as Record<string, unknown>;
  const deliverableIdCandidates: Array<unknown> = [
    payload?.deliverableId,
    (payload?.deliverable as Record<string, unknown> | undefined)?.id,
    metadata?.deliverableId,
    metadata?.deliverable_id,
  ];

  const deliverableId = deliverableIdCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );

  try {
    if (deliverableId) {
      return await deliverablesService.findOne(deliverableId, userId);
    }

    const conversationId = resolveConversationId(request);
    if (!conversationId) {
      return null;
    }

    const deliverables = await deliverablesService.findByConversationId(
      conversationId,
      userId,
    );

    return deliverables.length > 0 ? deliverables[0] : null;
  } catch (error) {
    if (error instanceof NotFoundException) {
      return null;
    }
    throw error;
  }
}

/**
 * Optimizes contextual data for downstream LLM calls.
 * @param contextOptimization - Context optimization service dependency
 * @param history - Conversation history to optimize
 * @param definition - Agent definition providing configuration
 * @returns Optimized context data
 */
export async function optimizeContext(
  contextOptimization: ContextOptimizationService,
  history: unknown[],
  definition: AgentRuntimeDefinition,
): Promise<ConversationMessage[]> {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const conversationHistory = history
    .map((entry): ConversationMessage | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const message = entry as Partial<ConversationMessage>;
      if (
        typeof message.role !== 'string' ||
        typeof message.content !== 'string'
      ) {
        return null;
      }

      return {
        role: message.role,
        content: message.content,
        timestamp:
          typeof message.timestamp === 'string' &&
          message.timestamp.trim().length > 0
            ? message.timestamp
            : new Date().toISOString(),
        metadata:
          message.metadata && typeof message.metadata === 'object'
            ? message.metadata
            : undefined,
      };
    })
    .filter((message): message is ConversationMessage => message !== null);

  if (conversationHistory.length === 0) {
    return [];
  }

  const config = definition.config as Record<string, unknown> | undefined;
  const plan = config?.plan as Record<string, unknown> | undefined;
  const planning = config?.planning as Record<string, unknown> | undefined;
  const configContext = config?.context as Record<string, unknown> | undefined;
  const defContext = definition.context as Record<string, unknown> | undefined;
  const tokenBudgetCandidates: Array<unknown> = [
    plan?.tokenBudget,
    plan?.token_budget,
    planning?.tokenBudget,
    planning?.token_budget,
    configContext?.tokenBudget,
    configContext?.token_budget,
    defContext?.tokenBudget,
    defContext?.token_budget,
  ];

  const resolvedBudget =
    tokenBudgetCandidates
      .map((candidate) => {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          return candidate;
        }

        if (typeof candidate === 'string') {
          const parsed = Number(candidate);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }

        return null;
      })
      .find((value): value is number => value !== null && value > 0) ?? 8000;

  try {
    return await contextOptimization.optimizeContext({
      fullHistory: conversationHistory,
      tokenBudget: resolvedBudget,
    });
  } catch {
    return conversationHistory;
  }
}

/**
 * Calls the configured LLM provider for content generation.
 * @param llmService - LLM service dependency
 * @param llmConfig - Configuration overrides for the LLM request
 * @param systemPrompt - System prompt passed to the model
 * @param userMessage - User message prompt content
 * @param conversationHistory - Optional conversation history context
 * @returns The raw LLM response payload
 */
type LLMResponseLike = { content: string };

const isLLMResponse = (value: unknown): value is LLMResponseLike =>
  Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).content === 'string',
  );

/**
 * Normalizes the LLMServiceProvider.generateResponse() return value.
 * The interface returns `string | LLMResponse`. When the simplified provider
 * returns a plain string (no includeMetadata), wrap it into an LLMResponse shape
 * so downstream consumers always see { content, metadata }.
 */
function normalizeLLMResult(raw: string | LLMResponse): LLMResponse {
  if (typeof raw === 'string') {
    return {
      content: raw,
      metadata: {
        provider: 'unknown',
        model: 'unknown',
        requestId: '',
        timestamp: new Date().toISOString(),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        timing: { startTime: 0, endTime: 0, duration: 0 },
        status: 'completed',
      },
    };
  }
  if (isLLMResponse(raw)) {
    return raw;
  }
  throw new Error('LLM returned an unexpected response');
}

/**
 * Extracts document text from request metadata and formats it as a prompt section.
 */
export function buildDocumentContext(request: TaskRequestDto): string {
  const documents = request.metadata?.documents as
    | Array<{
        filename: string;
        mimeType: string;
        extractedText?: string;
      }>
    | undefined;

  if (!documents || documents.length === 0) return '';

  const sections = documents
    .filter((doc) => doc.extractedText)
    .map(
      (doc) => `### ${doc.filename} (${doc.mimeType})\n${doc.extractedText}`,
    );

  if (sections.length === 0) return '';
  return `\n\n## Uploaded Documents\n\n${sections.join('\n\n')}`;
}

/**
 * Extracts raw image data from request metadata for vision-capable LLMs.
 */
export function extractImages(
  request: TaskRequestDto,
): Array<{ base64: string; mimeType: string }> {
  const documents = request.metadata?.documents as
    | Array<{
        mimeType: string;
        base64Data?: string;
      }>
    | undefined;

  if (!documents) return [];

  return documents
    .filter((doc) => doc.base64Data && doc.mimeType.startsWith('image/'))
    .map((doc) => ({
      base64: doc.base64Data!.includes(',')
        ? doc.base64Data!.split(',')[1]!
        : doc.base64Data!,
      mimeType: doc.mimeType,
    }));
}

export async function callLLM(
  llmService: LLMServiceProvider,
  llmConfig: Record<string, unknown> | null | undefined,
  systemPrompt: string,
  userMessage: string,
  executionContext: ExecutionContext,
  _conversationHistory?: ConversationMessage[],
  images?: Array<{ base64: string; mimeType: string }>,
): Promise<LLMResponse> {
  if (!userMessage || !userMessage.trim()) {
    throw new Error('User message is required for LLM invocation');
  }

  // Extract LLM config overrides only - context comes from ExecutionContext
  const config = llmConfig ?? {};
  const temperature =
    typeof config.temperature === 'number' ? config.temperature : undefined;
  const maxTokens =
    typeof config.maxTokens === 'number' ? config.maxTokens : undefined;
  const stream = typeof config.stream === 'boolean' ? config.stream : undefined;
  const callerType =
    typeof config.callerType === 'string' ? config.callerType : 'agent';
  const callerName =
    typeof config.callerName === 'string'
      ? config.callerName
      : 'agent-converse-mode';

  try {
    const raw = await llmService.generateResponse(systemPrompt, userMessage, {
      // LLM config overrides (if provided in llmConfig)
      temperature,
      maxTokens,
      stream,
      // Caller tracking
      callerType,
      callerName,
      // Vision: pass raw images for multimodal LLM support
      images,
      // ExecutionContext is the single source of truth for context fields
      executionContext,
    });

    // LLMServiceProvider.generateResponse() returns string | LLMResponse.
    // Normalize so callers always get an LLMResponse shape.
    return normalizeLLMResult(raw);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Failed to generate response from LLM');
  }
}

/**
 * Resolves the user identifier from a task request.
 * @param request - Task request containing metadata
 * @returns The resolved user identifier or null
 */
export function resolveUserId(request: TaskRequestDto): string | null {
  // Primary source: ExecutionContext (Phase 3.5+)
  if (typeof request.context?.userId === 'string') {
    return request.context.userId;
  }

  const fromMetadata = request.metadata?.userId ?? request.metadata?.createdBy;
  if (fromMetadata) {
    return typeof fromMetadata === 'string'
      ? fromMetadata
      : typeof fromMetadata === 'number'
        ? String(fromMetadata)
        : null;
  }

  const payload = request.payload ?? {};
  const payloadMetadata = payload.metadata as
    | Record<string, unknown>
    | undefined;
  const fromPayload =
    payload.userId ??
    payload.createdBy ??
    payloadMetadata?.userId ??
    payloadMetadata?.createdBy;
  if (fromPayload) {
    return typeof fromPayload === 'string'
      ? fromPayload
      : typeof fromPayload === 'number'
        ? String(fromPayload)
        : null;
  }

  const fromMessages = Array.isArray(request.messages)
    ? request.messages
        .map(
          (message) =>
            (message as unknown as Record<string, unknown>)?.metadata as
              | Record<string, unknown>
              | undefined,
        )
        .map((metadata) => metadata?.userId)
        .find((value) => typeof value === 'string' && value.trim().length > 0)
    : null;

  if (fromMessages && typeof fromMessages === 'string') {
    return fromMessages;
  }

  return null;
}

/**
 * Resolves the conversation identifier from a task request.
 * @param request - Task request containing metadata
 * @returns The resolved conversation identifier or null
 */
export function resolveConversationId(request: TaskRequestDto): string | null {
  // Primary source: ExecutionContext
  if (typeof request.context?.conversationId === 'string') {
    return request.context.conversationId;
  }

  const payload = request.payload;
  const payloadMeta = payload?.metadata as Record<string, unknown> | undefined;
  const payloadConversation =
    payload?.conversationId ?? payloadMeta?.conversationId;
  if (typeof payloadConversation === 'string') {
    return payloadConversation;
  }

  const metadataConversation = request.metadata?.conversationId;
  if (typeof metadataConversation === 'string') {
    return metadataConversation;
  }

  return null;
}

/**
 * Resolves the task identifier from a task request.
 * @param request - Task request containing metadata
 * @returns The resolved task identifier or null
 */
export function resolveTaskId(request: TaskRequestDto): string | null {
  const metadataTaskId = request.metadata?.taskId;
  if (typeof metadataTaskId === 'string') {
    return metadataTaskId;
  }

  const payload = request.payload as Record<string, unknown>;
  const payloadMetadata = payload?.metadata as Record<string, unknown>;
  const payloadTaskId = payload?.taskId ?? payloadMetadata?.taskId;
  if (typeof payloadTaskId === 'string') {
    return payloadTaskId;
  }

  return null;
}

/**
 * Builds metadata for task responses.
 * @param baseMetadata - Base metadata payload
 * @param overrides - Additional overrides applied to metadata
 * @returns Merged metadata object
 */
export function buildResponseMetadata(
  baseMetadata: Record<string, unknown> | null | undefined,
  overrides: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return {
    ...(baseMetadata ?? {}),
    ...(overrides ?? {}),
  };
}

/**
 * Handles an error by converting it into a TaskResponseDto failure.
 * @param mode - Agent task mode associated with the error
 * @param error - Underlying error that occurred
 * @returns A failure task response
 */
export function handleError(
  mode: AgentTaskMode,
  error: unknown,
): TaskResponseDto {
  const reason =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';

  return TaskResponseDto.failure(mode, reason);
}

/**
 * Determines whether the request prefers streaming delivery.
 * @param request - Task request containing streaming preferences
 * @returns True when streaming is requested
 */
export function shouldStreamResponse(request: TaskRequestDto): boolean {
  const payload = request.payload;
  const options = payload?.options as Record<string, unknown> | undefined;
  const payloadStream = options?.stream ?? payload?.stream;
  if (typeof payloadStream === 'boolean') {
    return payloadStream;
  }

  if (typeof request.metadata?.stream === 'boolean') {
    return request.metadata.stream;
  }

  return false;
}
