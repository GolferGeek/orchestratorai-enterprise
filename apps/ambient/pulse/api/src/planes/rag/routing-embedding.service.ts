/**
 * Routing Embedding Service
 *
 * Implements EmbeddingServiceProvider by routing each call to the correct
 * embedding client based on the model name.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  EmbeddingServiceProvider,
  EmbeddingResult,
} from './embedding.interface';
import { EmbeddingModelRouter } from './embedding-model-router';
import { OllamaEmbeddingClient } from './embedding-clients/ollama-embedding.client';
import { OpenAIEmbeddingClient } from './embedding-clients/openai-embedding.client';
import { VertexAIEmbeddingClient } from './embedding-clients/vertex-ai-embedding.client';

@Injectable()
export class RoutingEmbeddingService implements EmbeddingServiceProvider {
  private readonly logger = new Logger(RoutingEmbeddingService.name);

  constructor(
    private readonly router: EmbeddingModelRouter,
    private readonly ollamaClient: OllamaEmbeddingClient,
    private readonly openaiClient: OpenAIEmbeddingClient,
    private readonly vertexClient: VertexAIEmbeddingClient,
  ) {}

  async embed(text: string, model: string): Promise<number[]> {
    const result = await this.embedWithTokenCount(text, model);
    return result.embedding;
  }

  async embedBatch(texts: string[], model: string): Promise<EmbeddingResult[]> {
    const provider = this.router.getProvider(model);
    this.logger.debug(
      `Embedding batch of ${texts.length} texts with model '${model}' via ${provider}`,
    );

    switch (provider) {
      case 'ollama':
        return this.ollamaClient.embedBatch(texts, model);
      case 'openai':
        return this.openaiClient.embedBatch(texts, model);
      case 'vertex_ai':
        return this.vertexClient.embedBatch(texts, model);
    }
  }

  async embedWithTokenCount(
    text: string,
    model: string,
  ): Promise<EmbeddingResult> {
    const provider = this.router.getProvider(model);
    this.logger.debug(`Embedding text with model '${model}' via ${provider}`);

    switch (provider) {
      case 'ollama':
        return this.ollamaClient.embed(text, model);
      case 'openai':
        return this.openaiClient.embed(text, model);
      case 'vertex_ai':
        return this.vertexClient.embed(text, model);
    }
  }

  getDimensions(model: string): number {
    return this.router.getDimensions(model);
  }

  getRecommendedThreshold(model: string): number {
    return this.router.getRecommendedThreshold(model);
  }

  async checkHealth(
    model: string,
  ): Promise<{ status: string; message: string }> {
    const provider = this.router.getProvider(model);

    switch (provider) {
      case 'ollama':
        return this.ollamaClient.checkHealth(model);
      case 'openai':
        return this.openaiClient.checkHealth(model);
      case 'vertex_ai':
        return this.vertexClient.checkHealth(model);
    }
  }
}
