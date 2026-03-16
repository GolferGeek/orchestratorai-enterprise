import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import type { ConversationMessage } from '../../context-optimization/context-optimization.service';
import { LLMServiceProvider } from '@/planes/llm/llm.interface';
import type { ConverseModePayload } from '@orchestrator-ai/transport-types';
import { Agent2AgentConversationsService } from '../agent-conversations.service';
import {
  fetchConversationHistory,
  callLLM,
  resolveUserId,
  resolveConversationId,
  handleError,
  buildResponseMetadata,
  shouldStreamResponse,
  buildDocumentContext,
  extractImages,
} from './shared.helpers';
import { TaskRequestDto, AgentTaskMode } from '../../dto/task-request.dto';
import { TaskResponseDto } from '../../dto/task-response.dto';

export interface ConverseHandlerDependencies {
  llmService: LLMServiceProvider;
  conversationsService: Agent2AgentConversationsService;
}

/**
 * Validate Converse payload structure against transport-types
 * Converse mode has no required action field - payload is entirely optional
 */
function validateConversePayload(
  payload: unknown,
): payload is ConverseModePayload {
  if (!payload) {
    // Payload is optional for converse mode
    return true;
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Converse payload must be an object if provided');
  }

  const payloadObj = payload as Record<string, unknown>;

  // Validate optional fields if present
  if ('temperature' in payloadObj && payloadObj.temperature !== undefined) {
    if (typeof payloadObj.temperature !== 'number') {
      throw new Error('temperature must be a number');
    }
  }

  if ('maxTokens' in payloadObj && payloadObj.maxTokens !== undefined) {
    if (typeof payloadObj.maxTokens !== 'number') {
      throw new Error('maxTokens must be a number');
    }
  }

  if ('stop' in payloadObj && payloadObj.stop !== undefined) {
    if (!Array.isArray(payloadObj.stop)) {
      throw new Error('stop must be an array');
    }
  }

  return true;
}

/**
 * Executes conversational mode for an agent.
 * @param definition - Agent runtime definition configuration
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Required service dependencies for execution
 * @returns A task response containing conversation results
 */
export async function executeConverse(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: ConverseHandlerDependencies,
): Promise<TaskResponseDto> {
  try {
    // Validate payload structure
    validateConversePayload(request.payload);

    const userId = resolveUserId(request);
    if (!userId) {
      throw new Error('Unable to determine user identity for conversation');
    }

    const existingConversationId = resolveConversationId(request) ?? undefined;
    const orgSlug = organizationSlug ?? definition.organizationSlug ?? 'global';

    const firstOrgSlug: string =
      Array.isArray(orgSlug) && orgSlug.length > 0
        ? (orgSlug[0] ?? 'global')
        : typeof orgSlug === 'string'
          ? orgSlug
          : 'global';

    const conversation =
      await services.conversationsService.getOrCreateConversation(
        {
          userId,
          orgSlug: firstOrgSlug,
          conversationId: existingConversationId || undefined,
        },
        definition.slug,
      );

    // MUTATION: Update conversationId in context if this is a new conversation
    if (request.context && request.context.conversationId !== conversation.id) {
      request.context.conversationId = conversation.id;
    }

    const history = await fetchConversationHistory(
      services.conversationsService,
      request,
    );

    const systemPrompt = buildConversationalPrompt(
      definition,
      history,
      request,
    );
    const payload = (request.payload ?? {}) as ConverseModePayload;
    const userMessage = request.userMessage?.trim() ?? '';
    const images = extractImages(request);

    if (!userMessage) {
      throw new Error('User message is required to execute Converse mode');
    }

    // Extract LLM configuration - primary source is ExecutionContext (Phase 3.5+)
    // Fallback to legacy payload.config for backwards compatibility
    const payloadRec = payload as Record<string, unknown>;
    const llmSelection = payloadRec.llmSelection as
      | Record<string, unknown>
      | undefined;
    const config = payloadRec.config as
      | {
          provider?: string;
          model?: string;
          temperature?: number;
          maxTokens?: number;
        }
      | undefined;

    // Primary: context.provider/model (Phase 3.5+), Fallback: payload.config (legacy)
    const providerName =
      request.context?.provider ??
      config?.provider ??
      llmSelection?.providerName;
    const modelName =
      request.context?.model ?? config?.model ?? llmSelection?.modelName;

    // Validate LLM configuration (no fallbacks - frontend must provide)
    if (!providerName || !modelName) {
      throw new Error(
        'LLM provider and model must be specified. ' +
          'Send context.provider/model (Phase 3.5+) or payload.config.provider/model.',
      );
    }

    const llmConfig = {
      providerName,
      modelName,
      temperature:
        config?.temperature ?? llmSelection?.temperature ?? payload.temperature,
      maxTokens:
        config?.maxTokens ?? llmSelection?.maxTokens ?? payload.maxTokens,
      conversationId: conversation.id,
      sessionId: request.context?.taskId, // Use taskId for session correlation
      userId,
      organizationSlug: orgSlug,
      agentSlug: definition.slug,
      stream: shouldStreamResponse(request),
      callerType: 'agent',
      callerName: `${definition.slug}-converse`,
    };

    const llmResponse = await callLLM(
      services.llmService,
      llmConfig,
      systemPrompt,
      userMessage,
      request.context,
      history,
      images,
    );

    const timestamp = new Date().toISOString();
    const updatedHistory: ConversationMessage[] = [...history];

    if (userMessage.length > 0) {
      updatedHistory.push({
        role: 'user',
        content: userMessage,
        timestamp,
      });
    }

    updatedHistory.push({
      role: 'assistant',
      content: llmResponse.content,
      timestamp,
      metadata: {
        provider: llmResponse.metadata?.provider,
        model: llmResponse.metadata?.model,
      },
    });

    const maxHistoryEntries = 50;
    const trimmedHistory =
      updatedHistory.length > maxHistoryEntries
        ? updatedHistory.slice(updatedHistory.length - maxHistoryEntries)
        : updatedHistory;

    await services.conversationsService.updateConversation(
      {
        conversationId: conversation.id,
        userId,
      },
      {
        metadata: {
          history: trimmedHistory,
          lastAssistantMessageAt: timestamp,
        },
      },
    );

    const usage = llmResponse.metadata?.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
    };

    const normalizedUsage = {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens:
        usage.totalTokens ??
        (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      cost: usage.cost ?? 0,
    };

    const responseMetadata = buildResponseMetadata(
      {
        provider: llmResponse.metadata?.provider ?? 'unknown',
        model: llmResponse.metadata?.model ?? 'unknown',
        usage: normalizedUsage,
        thinking: llmResponse.metadata?.thinking,
      },
      undefined,
    );

    return TaskResponseDto.success(AgentTaskMode.CONVERSE, {
      content: {
        message: llmResponse.content,
      },
      metadata: responseMetadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.CONVERSE, error);
  }
}

/**
 * Builds the system prompt used for conversational interactions.
 * @param definition - Agent runtime definition containing prompt templates
 * @param conversationHistory - Ordered list of prior conversation messages
 * @returns A formatted system prompt string
 */
export function buildConversationalPrompt(
  definition: AgentRuntimeDefinition,
  conversationHistory: ConversationMessage[],
  request?: TaskRequestDto,
): string {
  const promptCandidate =
    definition.prompts?.system ??
    definition.llm?.systemPrompt ??
    definition.context?.system_prompt ??
    definition.context?.systemPrompt ??
    definition.description;

  const fallbackName = definition.name ?? definition.slug;
  let prompt =
    typeof promptCandidate === 'string' && promptCandidate.trim().length > 0
      ? promptCandidate.trim()
      : [
          `You are ${fallbackName}.`,
          'Respond helpfully and concisely.',
          'Ask a clarifying question when it helps progress the conversation.',
          'Follow organizational policies and agent guidelines.',
        ].join(' ');

  const additionalGuidance =
    typeof definition.context?.conversation_guidelines === 'string'
      ? definition.context?.conversation_guidelines
      : typeof definition.context?.conversationGuidelines === 'string'
        ? definition.context?.conversationGuidelines
        : typeof definition.context?.instructions === 'string'
          ? definition.context?.instructions
          : null;

  if (additionalGuidance && additionalGuidance.trim().length > 0) {
    prompt += `\n\nAgent guidance:\n${additionalGuidance.trim()}`;
  }

  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const formattedHistory = conversationHistory
      .slice(-10)
      .map((message) =>
        `${message.role ?? 'unknown'}: ${message.content ?? ''}`.trim(),
      )
      .filter((line) => line.length > 0)
      .join('\n');

    if (formattedHistory.length > 0) {
      prompt += `\n\nRecent conversation history:\n${formattedHistory}`;
    }
  }

  // Append extracted document text from uploaded files
  if (request) {
    prompt += buildDocumentContext(request);
  }

  return prompt;
}
