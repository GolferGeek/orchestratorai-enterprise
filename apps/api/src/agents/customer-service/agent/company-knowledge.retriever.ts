import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  CollectionsService,
  QueryService,
  type QueryResponse,
} from '@orchestratorai/planes/rag';

/** The collection the company-knowledge agent answers from, per organization. */
export const COMPANY_KNOWLEDGE_COLLECTION_SLUG = 'company-knowledge';

// Same retrieval settings as the company-knowledge agent's rag_config.
const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;

export interface CompanyKnowledgeExcerpt {
  documentName: string;
  section?: string;
  content: string;
}

/**
 * Retrieves excerpts from the organization's `company-knowledge` collection.
 * The organization is the invocation's `context.orgSlug`. A missing collection
 * is a configuration problem and throws; an empty result is a real answer
 * ("not in the documents") and returns [].
 */
@Injectable()
export class CompanyKnowledgeRetriever {
  constructor(
    private readonly collectionsService: CollectionsService,
    private readonly queryService: QueryService,
  ) {}

  async retrieve(
    context: ExecutionContext,
    question: string,
  ): Promise<CompanyKnowledgeExcerpt[]> {
    const collections = await this.collectionsService.getCollections(
      context.orgSlug,
      context.userId,
    );
    const collection = collections.find(
      (c) => c.slug === COMPANY_KNOWLEDGE_COLLECTION_SLUG,
    );
    if (!collection) {
      throw new Error(
        `Organization '${context.orgSlug}' has no '${COMPANY_KNOWLEDGE_COLLECTION_SLUG}' RAG collection visible to customer service. ` +
          'Create it and load the company documents (scripts/seed-org-rag.mjs or the RAG admin).',
      );
    }

    const params = {
      query: question,
      topK: TOP_K,
      similarityThreshold: SIMILARITY_THRESHOLD,
      includeMetadata: true,
    };
    const response: QueryResponse =
      collection.complexityType === 'basic'
        ? await this.queryService.queryCollection(
            collection.id,
            context.orgSlug,
            { ...params, strategy: 'basic' },
            collection.embeddingModel,
          )
        : await this.queryService.queryByComplexity(
            collection.id,
            context.orgSlug,
            collection.complexityType,
            params,
            collection.embeddingModel,
          );

    return response.results.map((result) => {
      const excerpt: CompanyKnowledgeExcerpt = {
        documentName: result.documentFilename,
        content: result.content,
      };
      if (result.sectionPath) {
        excerpt.section = result.sectionPath;
      }
      return excerpt;
    });
  }
}
