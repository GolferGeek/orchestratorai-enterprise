import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, type LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { RunModelProfile } from './model-profile.types';

/** What a workflow step needs to call a model: its run's capsule and profile. */
export interface RunModelScope {
  executionContext: ExecutionContext;
  modelProfile: RunModelProfile;
}

export interface RoleCallRequest {
  systemPrompt: string;
  userMessage: string;
  /** Tracks the call in llm_usage (e.g. `agent:clause-reviewer`). */
  callerName: string;
  responseFormat?: 'json';
  maxTokens?: number;
  temperature?: number;
}

export interface RoleCallResult {
  content: string;
  /** The model that actually answered. */
  provider: string;
  model: string;
  /** llm_usage.run_id of this call. */
  requestId: string;
  usage: { inputTokens: number; outputTokens: number };
  thinking: string | null;
}

/**
 * The one way a workflow calls a model (Decision 1).
 *
 * The provider and model come from the run's profile snapshot for the role,
 * passed explicitly to the plane's generateUnifiedResponse; the
 * ExecutionContext rides along whole and unchanged for PII handling,
 * sovereignty checks, usage and observability. It is never rebuilt with the
 * role's model: see docs/architecture/llm-boundary.md, "Per-role models".
 */
@Injectable()
export class WorkflowLlmClient {
  constructor(@Inject(LLM_SERVICE) private readonly llm: LLMServiceProvider) {}

  async callForRole(
    scope: RunModelScope,
    role: string,
    request: RoleCallRequest,
  ): Promise<RoleCallResult> {
    const target = scope.modelProfile[role];
    if (!target) {
      throw new Error(
        `Run ${scope.executionContext.conversationId} has no model for role "${role}"; its profile covers: ${Object.keys(scope.modelProfile).join(', ') || 'no roles'}`,
      );
    }
    const response = await this.llm.generateUnifiedResponse({
      provider: target.provider,
      model: target.model,
      systemPrompt: request.systemPrompt,
      userMessage: request.userMessage,
      options: {
        executionContext: scope.executionContext,
        includeMetadata: true,
        callerType: 'workflow',
        callerName: request.callerName,
        ...(request.responseFormat ? { responseFormat: request.responseFormat } : {}),
        ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
    });
    if (typeof response === 'string') {
      throw new Error('The LLM plane returned text without metadata for a workflow call');
    }
    if (response.error) {
      throw new Error(`${target.provider}/${target.model} failed: ${response.error.message}`);
    }
    const { metadata } = response;
    return {
      content: response.content,
      provider: metadata.provider,
      model: metadata.model,
      requestId: metadata.requestId,
      usage: {
        inputTokens: metadata.usage.inputTokens,
        outputTokens: metadata.usage.outputTokens,
      },
      thinking: response.thinkingContent ?? metadata.thinking ?? null,
    };
  }
}
