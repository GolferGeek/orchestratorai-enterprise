/**
 * Ollama Local Adapter
 *
 * Connects to a local Ollama instance (http://localhost:11434).
 * Used as the opensource tier backend when OPENSOURCE_LLM_PROVIDER=ollama_local.
 *
 * Env vars:
 *   OLLAMA_LOCAL_URL — base URL for local Ollama (default: http://localhost:11434)
 */
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  LLMClient,
  LLMClientModelEntry,
  LLMClientChatParams,
  LLMClientChatResult,
} from '../llm-client.interface';

export class OllamaLocalAdapter implements LLMClient {
  readonly tier = 'opensource' as const;

  constructor(private readonly httpService: HttpService) {}

  private getBaseUrl(): string {
    return (
      process.env.OLLAMA_LOCAL_URL?.replace(/\/+$/, '') ||
      'http://localhost:11434'
    );
  }

  async listModels(): Promise<LLMClientModelEntry[]> {
    const baseUrl = this.getBaseUrl();

    // Ollama's /api/tags reports capabilities, so decision models (clef, clef-flash),
    // which only answer /v1/systemone, stay out of chat pickers. (/v1/models lists them
    // with no way to tell.) Hosts too old to report capabilities list every model.
    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          models: Array<{ name: string; capabilities?: string[] }>;
        }>(`${baseUrl}/api/tags`, { timeout: 5_000 }),
      );
      return (response.data?.models ?? [])
        .filter((m) => !m.capabilities || m.capabilities.includes('completion'))
        .map((m) => ({
          id: m.name,
          name: m.name,
          providerName: 'ollama',
          modelType: 'text-generation',
          isLocal: true,
        }));
    } catch {
      // Local Ollama not running — return empty list
      return [];
    }
  }

  async chatCompletion(
    params: LLMClientChatParams,
  ): Promise<LLMClientChatResult> {
    const baseUrl = this.getBaseUrl();

    const response = await firstValueFrom(
      this.httpService.post<{
        id?: string;
        model: string;
        choices: Array<{
          message: { content: string; reasoning?: string };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      }>(
        `${baseUrl}/v1/chat/completions`,
        {
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.max_tokens,
          top_p: params.top_p,
        },
        { timeout: 120_000 },
      ),
    );

    const data = response.data;
    if (!data.choices?.length) {
      throw new Error(
        `Local Ollama returned no choices for model ${params.model}`,
      );
    }

    const msg = data.choices[0]!.message;
    const content = msg.content || msg.reasoning || '';

    return {
      content,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      cost: null,
      requestId: data.id ?? '',
    };
  }
}
