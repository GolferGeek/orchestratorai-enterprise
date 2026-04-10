import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RAG_STORAGE_SERVICE, RagStorageService } from '../../../rag-storage';
import { QueryService } from '../../../rag/query.service';

export interface RagContextParams {
  collectionSlug: string;
  orgSlug: string;
  query: string;
  topK?: number;
  similarityThreshold?: number;
}

/**
 * WorkflowRagService
 *
 * Shared service for LangGraph workflow nodes to query RAG collections.
 * Uses hybrid search (vector + keyword via RRF fusion) for best results.
 *
 * Best-effort: returns empty string on any failure — never blocks a workflow.
 *
 * Usage:
 *   const ctx = await workflowRag.getContext({
 *     collectionSlug: 'law-contracts-hybrid',
 *     orgSlug: ctx.orgSlug,
 *     query: documentText,
 *   });
 */
@Injectable()
export class WorkflowRagService {
  private readonly logger = new Logger(WorkflowRagService.name);

  constructor(
    @Inject(RAG_STORAGE_SERVICE)
    @Optional()
    private readonly ragStorage?: RagStorageService,
    @Optional()
    private readonly queryService?: QueryService,
  ) {}

  async getContext(params: RagContextParams): Promise<string> {
    if (!this.ragStorage || !this.queryService) {
      return '';
    }

    try {
      const collection = await this.ragStorage.getCollectionBySlug(
        params.collectionSlug,
        params.orgSlug,
      );
      if (!collection) {
        this.logger.warn(
          `Collection not found: ${params.collectionSlug} (org: ${params.orgSlug})`,
        );
        return '';
      }

      const response = await this.queryService.queryByComplexity(
        collection.id,
        params.orgSlug,
        'hybrid',
        {
          query: params.query,
          topK: params.topK ?? 5,
          similarityThreshold: params.similarityThreshold,
        },
        collection.embeddingModel || 'nomic-embed-text',
      );

      if (!response.results || response.results.length === 0) {
        return '';
      }

      const formatted = response.results
        .map((r) => `[${r.documentFilename}] ${r.content}`)
        .join('\n\n');

      return `\n\n---\nRelevant Reference Material:\n${formatted}`;
    } catch (error) {
      this.logger.warn(
        `RAG query failed for ${params.collectionSlug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }
}
