/**
 * Embedding Model Router
 *
 * Centralizes model -> provider routing, model -> dimensions mapping,
 * and model -> recommended similarity threshold.
 *
 * Different embedding models produce different cosine similarity score
 * distributions. A threshold that works for one model (e.g., 0.6 for
 * nomic-embed-text) will filter out all results for another (e.g.,
 * text-embedding-3-small peaks around 0.5). The recommendedThreshold
 * is calibrated per model so consumers don't need to guess.
 */
import { Injectable } from '@nestjs/common';

export type EmbeddingProvider = 'ollama' | 'openai' | 'vertex_ai';

interface ModelConfig {
  provider: EmbeddingProvider;
  dimensions: number;
  /** Calibrated similarity threshold — scores below this are noise */
  recommendedThreshold: number;
}

const MODEL_REGISTRY: Record<string, ModelConfig> = {
  // Ollama models — higher cosine similarity scores
  'nomic-embed-text': {
    provider: 'ollama',
    dimensions: 768,
    recommendedThreshold: 0.6,
  },
  'mxbai-embed-large': {
    provider: 'ollama',
    dimensions: 1024,
    recommendedThreshold: 0.55,
  },

  // OpenAI models (via OpenRouter) — lower cosine similarity scores
  'text-embedding-3-small': {
    provider: 'openai',
    dimensions: 1536,
    recommendedThreshold: 0.3,
  },
  'text-embedding-3-large': {
    provider: 'openai',
    dimensions: 3072,
    recommendedThreshold: 0.3,
  },

  // Vertex AI models
  'text-embedding-005': {
    provider: 'vertex_ai',
    dimensions: 768,
    recommendedThreshold: 0.5,
  },
  'text-embedding-004': {
    provider: 'vertex_ai',
    dimensions: 768,
    recommendedThreshold: 0.5,
  },
  'text-multilingual-embedding-002': {
    provider: 'vertex_ai',
    dimensions: 768,
    recommendedThreshold: 0.5,
  },
};

@Injectable()
export class EmbeddingModelRouter {
  getProvider(model: string): EmbeddingProvider {
    const config = MODEL_REGISTRY[model];
    if (!config) {
      throw new Error(
        `Unknown embedding model '${model}'. Supported: ${Object.keys(MODEL_REGISTRY).join(', ')}`,
      );
    }
    return config.provider;
  }

  getDimensions(model: string): number {
    const config = MODEL_REGISTRY[model];
    if (!config) {
      throw new Error(
        `Unknown embedding model '${model}'. Supported: ${Object.keys(MODEL_REGISTRY).join(', ')}`,
      );
    }
    return config.dimensions;
  }

  getRecommendedThreshold(model: string): number {
    const config = MODEL_REGISTRY[model];
    if (!config) {
      throw new Error(
        `Unknown embedding model '${model}'. Supported: ${Object.keys(MODEL_REGISTRY).join(', ')}`,
      );
    }
    return config.recommendedThreshold;
  }

  getSupportedModels(): string[] {
    return Object.keys(MODEL_REGISTRY);
  }

  getModelsForProvider(provider: EmbeddingProvider): string[] {
    return Object.entries(MODEL_REGISTRY)
      .filter(([, config]) => config.provider === provider)
      .map(([model]) => model);
  }
}
