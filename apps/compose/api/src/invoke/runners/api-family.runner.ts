/**
 * API Family Runner
 *
 * Handles agents of family type 'api':
 * - Calls an external HTTP API specified in definition.endpoint
 * - Optionally processes the API response through LLM
 * - Returns structured InvokeOutput
 *
 * Config fields used from AgentDefinition:
 *   endpoint     — the HTTP endpoint URL to call
 *   authConfig   — authentication config { type: 'bearer' | 'apikey', token: string, header?: string }
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { FamilyRunner } from '../invoke-dispatch.service';
import type { AgentDefinition } from '../agent-definition.types';
import type { LLMResponse } from '@orchestratorai/planes/llm';

@Injectable()
export class ApiFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(ApiFamilyRunner.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  async invoke(
    definition: AgentDefinition,
    context: ExecutionContext,
    data: InvokeData,
  ): Promise<InvokeOutput> {
    this.logger.debug(
      `ApiFamilyRunner.invoke — agent: ${definition.slug}, endpoint: ${definition.endpoint}`,
    );

    const endpoint = definition.endpoint;
    if (!endpoint) {
      throw new Error(
        `API agent ${definition.slug} missing endpoint in definition`,
      );
    }

    const userMessage = this.extractUserMessage(data);
    const headers = this.buildHeaders(definition);

    // Call the external API
    let apiResponse: unknown;
    try {
      const observable = this.httpService.request({
        url: endpoint,
        method: 'POST',
        headers,
        data: {
          message: userMessage,
          context: {
            orgSlug: context.orgSlug,
            agentSlug: context.agentSlug,
          },
        },
        timeout: 30_000,
        validateStatus: () => true,
      });

      const response = await firstValueFrom(observable);
      if (response.status !== 200) {
        throw new Error(
          `External API returned status ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }
      apiResponse = response.data;
    } catch (err) {
      this.logger.error(
        `API agent ${definition.slug} call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    const apiContent = this.extractApiContent(apiResponse);

    // If agent has a system prompt, process through LLM to format the response
    if (definition.context && definition.context.trim().length > 0) {
      const provider = definition.llmConfig?.provider ?? context.provider;
      const model = definition.llmConfig?.model ?? context.model;
      const systemPrompt = `${definition.context.trim()}\n\nAPI Response:\n${apiContent}`;

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
          callerName: `${definition.slug}-api`,
          executionContext: context,
        },
      });

      return {
        content: this.extractLlmContent(llmResponse),
        outputType: definition.outputType ?? 'text',
        metadata: {
          agentSlug: definition.slug,
          endpoint,
          apiResponseSummary: apiContent.substring(0, 200),
          ...this.extractLlmMeta(llmResponse),
        },
      };
    }

    // No LLM processing — return raw API result
    return {
      content: apiContent,
      outputType: definition.outputType ?? 'json',
      metadata: {
        agentSlug: definition.slug,
        endpoint,
      },
    };
  }

  private buildHeaders(definition: AgentDefinition): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OrchestratorAI-Compose/1.0',
    };

    const auth = definition.authConfig;
    if (!auth) {
      return headers;
    }

    const authType = auth.type as string | undefined;
    const token = auth.token as string | undefined;
    const header = (auth.header as string | undefined) ?? 'Authorization';

    if (authType === 'bearer' && token) {
      headers[header] = `Bearer ${token}`;
    } else if (authType === 'apikey' && token) {
      headers[header] = token;
    }

    return headers;
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

  private extractApiContent(response: unknown): string {
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      const content =
        obj.content ?? obj.message ?? obj.result ?? obj.data ?? obj.text;
      if (typeof content === 'string') {
        return content;
      }
    }
    try {
      return JSON.stringify(response, null, 2);
    } catch {
      return String(response);
    }
  }

  private extractLlmContent(response: string | LLMResponse): string {
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

  private extractLlmMeta(
    response: string | LLMResponse,
  ): Record<string, unknown> {
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
