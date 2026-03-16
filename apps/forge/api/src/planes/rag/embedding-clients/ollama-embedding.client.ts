/**
 * Ollama Embedding Client
 *
 * Generates embeddings via Ollama's /api/embeddings endpoint.
 * Refactored from the original rag/embedding.service.ts.
 *
 * Env: OLLAMA_BASE_URL (default: http://localhost:11434)
 */
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingResult } from '../embedding.interface';

@Injectable()
export class OllamaEmbeddingClient {
  private readonly logger = new Logger(OllamaEmbeddingClient.name);

  private getBaseUrl(): string {
    return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }

  async embed(text: string, model: string): Promise<EmbeddingResult> {
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama embedding error: ${response.status} - ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      embedding: number[];
      prompt_eval_count?: number;
    };

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }

    return {
      embedding: data.embedding,
      tokenCount: data.prompt_eval_count || this.estimateTokenCount(text),
    };
  }

  async embedBatch(texts: string[], model: string): Promise<EmbeddingResult[]> {
    const batchSize = 10;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((text) => this.embed(text, model)),
      );
      results.push(...batchResults);

      if (texts.length > 20 && i > 0) {
        this.logger.debug(
          `Ollama embedding progress: ${Math.min(i + batchSize, texts.length)}/${texts.length}`,
        );
      }
    }

    return results;
  }

  async checkHealth(
    model: string,
  ): Promise<{ status: string; message: string }> {
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/api/tags`);

    if (!response.ok) {
      throw new Error(`Ollama not available at ${baseUrl}`);
    }

    const data = (await response.json()) as {
      models: Array<{ name: string }>;
    };

    const modelAvailable = data.models?.some(
      (m) => m.name === model || m.name.startsWith(`${model}:`),
    );

    if (!modelAvailable) {
      return {
        status: 'warning',
        message: `Embedding model '${model}' not found. Run: ollama pull ${model}`,
      };
    }

    return {
      status: 'ok',
      message: `Ollama embedding model '${model}' available`,
    };
  }

  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
