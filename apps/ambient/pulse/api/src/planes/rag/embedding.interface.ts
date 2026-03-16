/**
 * RAG Embedding Provider Interface
 *
 * Part of the RAG plane — routes embedding generation to the correct provider
 * based on the collection's embeddingModel field.
 *
 * Unlike other planes that route by env var at startup, embedding routing is
 * per-request by model name (each collection can use a different model).
 *
 * Supported providers:
 *   - Ollama (nomic-embed-text, mxbai-embed-large)
 *   - OpenAI via OpenRouter (text-embedding-3-small/large)
 *   - Vertex AI (text-embedding-005/004, text-multilingual-embedding-002)
 */

export const EMBEDDING_SERVICE = Symbol('EMBEDDING_SERVICE');

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface EmbeddingServiceProvider {
  embed(text: string, model: string): Promise<number[]>;

  embedBatch(texts: string[], model: string): Promise<EmbeddingResult[]>;

  embedWithTokenCount(text: string, model: string): Promise<EmbeddingResult>;

  getDimensions(model: string): number;

  getRecommendedThreshold(model: string): number;

  checkHealth(model: string): Promise<{ status: string; message: string }>;
}
