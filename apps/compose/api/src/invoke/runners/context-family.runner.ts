/**
 * Context Family Runner
 *
 * Handles agents of family type 'context':
 * - Single LLM call with a markdown system prompt
 * - Conversation-aware (appends to conversation history in data.content)
 * - Returns text/markdown InvokeOutput
 *
 * No LangGraph, no mode routing, no deliverables — just LLM + system prompt.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { FamilyRunner } from '../invoke-dispatch.service';
import type { AgentDefinitionV2 } from '../agent-definition.types';
import type { LLMResponse } from '@orchestratorai/planes/llm';

@Injectable()
export class ContextFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(ContextFamilyRunner.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  async invoke(
    definition: AgentDefinitionV2,
    context: ExecutionContext,
    data: InvokeData,
  ): Promise<InvokeOutput> {
    this.logger.debug(
      `ContextFamilyRunner.invoke — agent: ${definition.slug}, org: ${context.orgSlug}`,
    );

    const systemPrompt = this.buildSystemPrompt(definition);
    const userMessage = this.extractUserMessage(data);

    const provider = definition.llmConfig?.provider ?? context.provider;
    const model = definition.llmConfig?.model ?? context.model;

    const llmResponse = await this.llmService.generateUnifiedResponse({
      provider,
      model,
      systemPrompt,
      userMessage,
      options: {
        temperature: definition.llmConfig?.temperature,
        maxTokens: definition.llmConfig?.maxTokens,
        conversationId: context.conversationId,
        userId: context.userId,
        organizationSlug: context.orgSlug,
        agentSlug: definition.slug,
        callerType: 'agent' as const,
        callerName: `${definition.slug}-context`,
        executionContext: context,
      },
    });

    const content = this.extractContent(llmResponse);
    const llmMeta = this.extractMeta(llmResponse);

    return {
      content,
      outputType: definition.outputType ?? 'text',
      metadata: {
        agentSlug: definition.slug,
        provider,
        model,
        ...llmMeta,
      },
    };
  }

  private buildSystemPrompt(definition: AgentDefinitionV2): string {
    if (definition.context && definition.context.trim().length > 0) {
      return definition.context.trim();
    }
    return `You are ${definition.name ?? definition.slug}, a helpful AI assistant.`;
  }

  private extractUserMessage(data: InvokeData): string {
    if (typeof data.content === 'string') {
      return data.content;
    }
    if (data.content && typeof data.content === 'object') {
      const obj = data.content as Record<string, unknown>;
      const msg = obj.message ?? obj.userMessage ?? obj.text ?? obj.content;
      if (typeof msg === 'string') {
        return msg;
      }
      return JSON.stringify(data.content);
    }
    return '';
  }

  private extractContent(response: string | LLMResponse): string {
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      const r = response;
      if (typeof r.content === 'string') {
        return r.content;
      }
    }
    return '';
  }

  private extractMeta(response: string | LLMResponse): Record<string, unknown> {
    if (typeof response === 'string') {
      return {};
    }
    if (response && typeof response === 'object') {
      const r = response;
      return (r.metadata as unknown as Record<string, unknown>) ?? {};
    }
    return {};
  }
}
