/**
 * OpenAI Embedding Client (via OpenRouter)
 *
 * Generates embeddings via OpenRouter's OpenAI-compatible /api/v1/embeddings endpoint.
 * Supports text-embedding-3-small and text-embedding-3-large.
 *
 * Env: OPENROUTER_API_KEY (required)
 */
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingResult } from '../embedding.interface';

interface OpenRouterEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class OpenAIEmbeddingClient {
  private readonly logger = new Logger(OpenAIEmbeddingClient.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  private getApiKey(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error(
        'OPENROUTER_API_KEY is not set. Required for OpenAI embedding models.',
      );
    }
    return key;
  }

  async embed(text: string, model: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text], model);
    return results[0]!;
  }

  async embedBatch(texts: string[], model: string): Promise<EmbeddingResult[]> {
    const apiKey = this.getApiKey();

    // OpenRouter embeddings API accepts array input
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          process.env.OPENROUTER_SITE_URL || 'https://orchestratorai.io',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'Orchestrator AI',
      },
      body: JSON.stringify({
        model: `openai/${model}`,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter embedding error: ${response.status} - ${errorText}`,
      );
    }

    const data = (await response.json()) as OpenRouterEmbeddingResponse;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid embedding response from OpenRouter');
    }

    // Sort by index to maintain input order
    const sorted = [...data.data].sort((a, b) => a.index - b.index);

    // Distribute token count evenly across inputs
    const totalTokens = data.usage?.prompt_tokens || 0;
    const tokensPerInput = Math.ceil(totalTokens / texts.length);

    return sorted.map((item) => ({
      embedding: item.embedding,
      tokenCount: tokensPerInput,
    }));
  }

  checkHealth(model: string): Promise<{ status: string; message: string }> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        `OPENROUTER_API_KEY not set — cannot use OpenAI embedding model '${model}'`,
      );
    }

    return Promise.resolve({
      status: 'ok',
      message: `OpenAI embedding model '${model}' available via OpenRouter`,
    });
  }
}
