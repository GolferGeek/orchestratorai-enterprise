import { Injectable, Inject, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  LLM_SERVICE,
  type LLMServiceProvider,
} from '@orchestratorai/planes/llm';
import { resolveModelForNode } from '../../legal-department/config/legal-model-config';

export interface LLMCallRequest {
  /** ExecutionContext - the core context that flows through the system */
  context: ExecutionContext;
  /** System message/prompt for the LLM */
  systemMessage?: string;
  /** User message to send to the LLM */
  userMessage: string;
  /** Temperature for response generation */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Name of the calling agent/service */
  callerName?: string;
}

export interface LLMCallResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  };
  /**
   * Reasoning/thinking content captured when the call was routed through
   * `callLLMWithReasoning`. Undefined for standard `callLLM` callers and for
   * non-reasoning models.
   */
  thinkingContent?: string;
  /** Wall-clock duration of the thinking phase in milliseconds. */
  thinkingDurationMs?: number;
  /** Token count of the thinking phase when available from the upstream API. */
  thinkingTokenCount?: number;
}

@Injectable()
export class LLMHttpClientService {
  private readonly logger = new Logger(LLMHttpClientService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {
    this.logger.log('LLM client configured: using LLM_SERVICE provider plane');
  }

  /**
   * Make a non-streaming LLM call via the LLM provider plane.
   *
   * This method is byte-for-byte unchanged by Phase 4. Every existing caller
   * in the system continues to use this method with no behavior change.
   */
  async callLLM(request: LLMCallRequest): Promise<LLMCallResponse> {
    if (!request.context.userId) {
      throw new Error('userId is required in ExecutionContext for LLM calls');
    }

    // If the caller is a legal-department node (callerName follows the
    // `agent-slug:node-name` convention) resolve the per-node model from the
    // capability config and pin it on a per-call clone of the context. The
    // node code does not need to know about model resolution; this happens
    // transparently here at the boundary.
    const context = this.applyNodeModelOverride(
      request.context,
      request.callerName,
    );

    this.logger.debug('Calling LLM via provider plane', {
      provider: context.provider,
      model: context.model,
      caller: request.callerName,
      conversationId: context.conversationId,
    });

    const result = await this.llmService.generateResponse(
      request.systemMessage || '',
      request.userMessage,
      {
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? 3500,
        callerType: 'langgraph',
        callerName: request.callerName || 'workflow',
        executionContext: context,
      },
    );

    // generateResponse returns string | LLMResponse
    if (typeof result === 'string') {
      return { text: result };
    }

    const usage = result.metadata?.usage;
    return {
      text: result.content,
      usage: usage
        ? {
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            cost: usage.cost,
          }
        : undefined,
    };
  }

  /**
   * Optional — captures reasoning/thinking tokens from Ollama reasoning models.
   *
   * This method is a NEW SIBLING to `callLLM` (Phase 4 invariant: `callLLM`
   * is unchanged). Callers that want reasoning capture call this method
   * directly, or use `callLLMMaybeWithReasoning` which does a `typeof` check
   * and routes accordingly.
   *
   * Delegates to `LLMServiceProvider.callLLMWithReasoning` when the provider
   * implements it. Only Ollama is wired in Phase 4; other providers fall
   * through to the standard buffered path and return `thinkingContent: undefined`.
   */
  async callLLMWithReasoning(
    request: LLMCallRequest,
  ): Promise<LLMCallResponse> {
    if (!request.context.userId) {
      throw new Error('userId is required in ExecutionContext for LLM calls');
    }

    const context = this.applyNodeModelOverride(
      request.context,
      request.callerName,
    );

    this.logger.debug('Calling LLM with reasoning capture via provider plane', {
      provider: context.provider,
      model: context.model,
      caller: request.callerName,
      conversationId: context.conversationId,
    });

    const options = {
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 3500,
      callerType: 'langgraph',
      callerName: request.callerName || 'workflow',
      executionContext: context,
    };

    // Route through the provider's callLLMWithReasoning if available,
    // otherwise fall back to the standard buffered path.
    let result;
    if (typeof this.llmService.callLLMWithReasoning === 'function') {
      result = await this.llmService.callLLMWithReasoning(
        request.systemMessage || '',
        request.userMessage,
        options,
      );
    } else {
      const raw = await this.llmService.generateResponse(
        request.systemMessage || '',
        request.userMessage,
        options,
      );
      if (typeof raw === 'string') {
        return { text: raw };
      }
      result = raw;
    }

    const usage = result.metadata?.usage;
    return {
      text: result.content,
      usage: usage
        ? {
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            cost: usage.cost,
          }
        : undefined,
      thinkingContent: result.thinkingContent,
      thinkingDurationMs: result.thinkingDurationMs,
      thinkingTokenCount: result.thinkingTokenCount,
    };
  }

  /**
   * Extract the node name from a `{agent-slug}:{node-name}` callerName and
   * resolve the per-capability, per-role model via the legal-model-config
   * cache. If the caller isn't a legal-department node (or no override is
   * configured), the original context is returned unchanged.
   *
   * Capability slug defaults to 'document-onboarding' — the only capability
   * in this effort. When more capabilities land, we'll thread the slug
   * through on the request (e.g., as a new optional field on the state).
   */
  private applyNodeModelOverride(
    context: ExecutionContext,
    callerName: string | undefined,
  ): ExecutionContext {
    if (!callerName || !callerName.startsWith('legal-department:')) {
      return context;
    }
    const nodeName = callerName.slice('legal-department:'.length);
    const resolved = resolveModelForNode(
      context,
      nodeName,
      'document-onboarding',
    );
    if (
      resolved.provider === context.provider &&
      resolved.model === context.model
    ) {
      return context;
    }
    return { ...context, provider: resolved.provider, model: resolved.model };
  }
}
