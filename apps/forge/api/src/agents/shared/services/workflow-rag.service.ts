import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RAG_STORAGE_SERVICE, RagStorageService } from '../../../rag-storage';
import { QueryService } from '../../../rag/query.service';
import type { LLMHttpClientService } from './llm-http-client.service';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { stripMarkdownFences } from '../../legal-department/nodes/specialist-utils';

export interface RagContextParams {
  collectionSlug: string;
  orgSlug: string;
  query: string;
  topK?: number;
  similarityThreshold?: number;
}

export interface SmartRagParams {
  orgSlug: string;
  query: string;
  context: ExecutionContext;
  topK?: number;
  maxCollections?: number;
}

/**
 * WorkflowRagService
 *
 * Shared service for LangGraph workflow nodes to query RAG collections.
 * Uses hybrid search (vector + keyword via RRF fusion) for best results.
 *
 * Best-effort: returns empty string on any failure — never blocks a workflow.
 *
 * Two modes:
 *   1. getContext() — query a specific collection by slug (original)
 *   2. smartContext() — LLM picks the best collections, queries them, merges results
 *
 * Usage:
 *   // Specific collection:
 *   const ctx = await workflowRag.getContext({ collectionSlug: '...', orgSlug, query });
 *
 *   // Smart routing across all org collections:
 *   const ctx = await workflowRag.smartContext({ orgSlug, query, context }, llmClient);
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

  /**
   * Smart RAG: use an LLM to pick the most relevant collections for a query,
   * then query each and merge the results.
   *
   * 1. List all active collections for the org
   * 2. Ask the LLM which collections are likely relevant (based on name + description)
   * 3. Query selected collections in parallel
   * 4. Merge and deduplicate results
   */
  async smartContext(
    params: SmartRagParams,
    llmClient: LLMHttpClientService,
  ): Promise<string> {
    if (!this.ragStorage || !this.queryService) {
      return '';
    }

    try {
      // 1. List all active collections for this org
      const collections = await this.ragStorage.getCollections(params.orgSlug);
      const active = collections.filter(
        (c) => c.status === 'active' && c.documentCount > 0,
      );

      if (active.length === 0) {
        this.logger.warn(
          `[smartContext] No active collections with documents for org ${params.orgSlug}`,
        );
        return '';
      }

      // If only 1 collection, skip routing and query it directly
      if (active.length === 1) {
        return this.getContext({
          collectionSlug: active[0]!.slug,
          orgSlug: params.orgSlug,
          query: params.query,
          topK: params.topK,
        });
      }

      // 2. Ask the LLM which collections are relevant
      const collectionList = active
        .map(
          (c) =>
            `- slug: "${c.slug}" | name: "${c.name}" | ${c.documentCount} docs | description: ${c.description || 'No description'}`,
        )
        .join('\n');

      const routingResponse = await llmClient.callLLM({
        context: params.context,
        systemMessage: `You are a search routing assistant. Given a user query and a list of document collections, select which collections are most likely to contain relevant information. Return ONLY a JSON array of collection slugs, ordered by relevance. Select up to ${params.maxCollections ?? 3} collections.

Example response: ["collection-a", "collection-b"]`,
        userMessage: `Query: "${params.query}"\n\nAvailable collections:\n${collectionList}`,
        temperature: 0,
        maxTokens: 200,
        callerName: 'workflow-rag:smart-routing',
      });

      let selectedSlugs: string[];
      try {
        selectedSlugs = JSON.parse(
          stripMarkdownFences(routingResponse.text),
        ) as string[];
      } catch {
        // If LLM response isn't valid JSON, fall back to all collections
        this.logger.warn(
          `[smartContext] Failed to parse routing response, querying all collections`,
        );
        selectedSlugs = active.map((c) => c.slug);
      }

      // Filter to valid slugs only
      const validSlugs = selectedSlugs.filter((s) =>
        active.some((c) => c.slug === s),
      );
      if (validSlugs.length === 0) {
        this.logger.warn(
          `[smartContext] LLM selected no valid collections, falling back to all`,
        );
        validSlugs.push(...active.map((c) => c.slug));
      }

      this.logger.log(
        `[smartContext] Routing "${params.query.substring(0, 60)}..." to ${validSlugs.length} collections: ${validSlugs.join(', ')}`,
      );

      // 3. Query selected collections in parallel
      const results = await Promise.all(
        validSlugs.map((slug) =>
          this.getContext({
            collectionSlug: slug,
            orgSlug: params.orgSlug,
            query: params.query,
            topK: params.topK ?? 5,
          }),
        ),
      );

      // 4. Merge non-empty results
      const merged = results.filter((r) => r.length > 0).join('\n');
      return merged || '';
    } catch (error) {
      this.logger.warn(
        `[smartContext] Failed: ${error instanceof Error ? error.message : String(error)}. Falling back to empty.`,
      );
      return '';
    }
  }
}
