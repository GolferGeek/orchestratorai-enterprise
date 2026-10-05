/**
 * Ollama Cloud Client
 *
 * OpenAI-compatible HTTP client targeting Ollama Cloud API.
 * Supports text generation via chat completions endpoint.
 * Handles auth and token counting.
 */
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface OllamaModelEntry {
  id: string;
  name: string;
  isLocal: boolean;
}

export interface OllamaCloudRequestParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface OllamaCloudResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string; reasoning?: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OllamaCloudResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  requestId: string;
}

@Injectable()
export class OllamaCloudClient {
  private readonly logger = new Logger(OllamaCloudClient.name);

  constructor(private readonly httpService: HttpService) {}

  private getBaseUrl(): string {
    const url = process.env.OLLAMA_CLOUD_BASE_URL;
    if (!url) throw new Error('OLLAMA_CLOUD_BASE_URL is not set (for example https://ollama.com)');
    return url;
  }

  /**
   * Resolve the OpenAI-compatible base URL (ensuring /v1 suffix).
   *
   * Users may set OLLAMA_CLOUD_BASE_URL to "https://ollama.com" (no /v1).
   * The chat/completions endpoint lives at /v1/chat/completions, so we
   * must ensure the base URL ends with /v1.
   */
  private getV1Url(): string {
    const raw = this.getBaseUrl().replace(/\/+$/, '');
    return raw.endsWith('/v1') ? raw : `${raw}/v1`;
  }

  private getApiKey(): string | undefined {
    return process.env.OLLAMA_CLOUD_API_KEY;
  }

  async listModels(): Promise<OllamaModelEntry[]> {
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Ollama's documented model list is GET /api/tags (https://ollama.com/api/tags).
    // It is the endpoint that can report capabilities, so models that cannot chat
    // (e.g. decision models) stay out of chat pickers; entries without capabilities
    // are listed. Chat itself goes through the OpenAI-compatible /v1 endpoint.
    const tagsUrl = `${this.getBaseUrl().replace(/\/+$/, '').replace(/\/v1$/, '')}/api/tags`;
    this.logger.debug(`Fetching Ollama Cloud model catalog from ${tagsUrl}`);

    let models: Array<{ name: string; capabilities?: string[] }> | undefined;
    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          models?: Array<{ name: string; capabilities?: string[] }>;
        }>(tagsUrl, { headers, timeout: 10_000 }),
      );
      models = response.data?.models;
    } catch (error) {
      throw new Error(
        `Cannot list Ollama Cloud models: ${tagsUrl} did not answer ` +
          `(${error instanceof Error ? error.message : String(error)}). ` +
          `Check OLLAMA_CLOUD_BASE_URL and OLLAMA_CLOUD_API_KEY.`,
      );
    }
    if (!Array.isArray(models)) {
      throw new Error(
        `Cannot list Ollama Cloud models: ${tagsUrl} returned no "models" array.`,
      );
    }

    return models
      .filter((m) => !m.capabilities || m.capabilities.includes('completion'))
      .map((m) => ({ id: m.name, name: m.name, isLocal: true }));
  }

  async chatCompletion(
    params: OllamaCloudRequestParams,
  ): Promise<OllamaCloudResult> {
    const apiKey = this.getApiKey();

    const requestBody = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens,
      top_p: params.top_p,
    };

    this.logger.debug(
      `Ollama Cloud request: model=${params.model}, messages=${params.messages.length}`,
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const v1Url = this.getV1Url();
    const response = await firstValueFrom(
      this.httpService.post<OllamaCloudResponse>(
        `${v1Url}/chat/completions`,
        requestBody,
        {
          headers,
          timeout: 120_000,
        },
      ),
    );

    const data = response.data;

    if (!data.choices?.length) {
      throw new Error(
        `Ollama Cloud returned no choices for model ${params.model}`,
      );
    }

    const msg = data.choices[0]!.message;
    // Reasoning models (e.g. qwen3-next) may return content="" with reasoning in a separate field
    const content = msg.content || msg.reasoning || '';

    return {
      content,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      requestId: data.id ?? '',
    };
  }
}
