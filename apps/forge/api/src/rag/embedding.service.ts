import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMBEDDING_SERVICE,
  EmbeddingServiceProvider,
  EmbeddingResult,
} from '../rag-storage';

export { EmbeddingResult };

/**
 * EmbeddingService — backward-compatible wrapper
 *
 * Delegates all calls to EMBEDDING_SERVICE (the RAG plane's routing service).
 * Uses env var EMBEDDING_MODEL as the default model for callers that don't
 * specify a model (legacy API).
 *
 * New code should inject EMBEDDING_SERVICE directly and pass the model
 * from the collection.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly defaultModel: string;

  constructor(
    private configService: ConfigService,
    @Inject(EMBEDDING_SERVICE)
    private embeddingProvider: EmbeddingServiceProvider,
  ) {
    this.defaultModel =
      this.configService.get<string>('EMBEDDING_MODEL') || 'nomic-embed-text';
    this.logger.log(
      `EmbeddingService wrapper initialized (default model: ${this.defaultModel})`,
    );
  }

  getModel(): string {
    return this.defaultModel;
  }

  getDimensions(): number {
    return this.embeddingProvider.getDimensions(this.defaultModel);
  }

  async embed(text: string): Promise<number[]> {
    return this.embeddingProvider.embed(text, this.defaultModel);
  }

  async embedWithTokenCount(text: string): Promise<EmbeddingResult> {
    return this.embeddingProvider.embedWithTokenCount(text, this.defaultModel);
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return this.embeddingProvider.embedBatch(texts, this.defaultModel);
  }

  async checkHealth(): Promise<{
    status: string;
    message: string;
    model: string;
  }> {
    const result = await this.embeddingProvider.checkHealth(this.defaultModel);
    return { ...result, model: this.defaultModel };
  }
}
