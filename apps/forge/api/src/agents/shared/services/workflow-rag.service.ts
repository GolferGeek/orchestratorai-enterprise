import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RAG_STORAGE_SERVICE, QueryService } from '@orchestratorai/planes/rag';
import type { RagStorageService } from '@orchestratorai/planes/rag';
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
   * Global search — queries ALL chunks across the entire org's knowledge base
   * in one vector search. No collection routing, no LLM call.
   *
   * This is the fastest and simplest way for a workflow agent to search.
   * Interactive users should go through getContext() which respects
   * collection-level access control.
   */
  async globalSearch(params: {
    orgSlug: string;
    query: string;
    topK?: number;
  }): Promise<string> {
    if (!this.queryService) {
      return '';
    }

    try {
      const response = await this.queryService.globalSearch(
        params.orgSlug,
        params.query,
        params.topK ?? 8,
      );

      if (!response.results || response.results.length === 0) {
        this.logger.debug(
          `[globalSearch] No results for "${params.query.substring(0, 60)}..." in org '${params.orgSlug}'`,
        );
        return '';
      }

      const formatted = response.results
        .map((r) => `[${r.documentFilename}] ${r.content}`)
        .join('\n\n');

      this.logger.debug(
        `[globalSearch] ${response.results.length} results (${formatted.length} chars) from ${new Set(response.results.map((r) => r.documentFilename)).size} docs in ${response.searchDurationMs}ms`,
      );

      return `\n\n---\nRelevant Reference Material:\n${formatted}`;
    } catch (error) {
      this.logger.warn(
        `[globalSearch] Failed: ${error instanceof Error ? error.message : String(error)}`,
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
      this.logger.debug(
        `[smartContext] Found ${collections.length} collections for org '${params.orgSlug}': ${collections.map((c) => `${c.slug}(status=${c.status},docs=${c.documentCount})`).join(', ')}`,
      );
      const active = collections.filter(
        (c) => c.status === 'active' && c.documentCount > 0,
      );
      this.logger.debug(`[smartContext] Active with docs: ${active.length}`);

      if (active.length === 0) {
        this.logger.debug(
          `[smartContext] No active collections with documents for org ${params.orgSlug} — returning empty`,
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

      // 2. Select relevant collections.
      // For single-stream providers (Ollama), skip the LLM routing call to
      // avoid GPU contention — just query all collections. For cloud
      // providers, use an LLM call to pick the best ones.
      const isSingleStream = params.context.provider === 'ollama';
      let validSlugs: string[];

      if (isSingleStream || active.length <= (params.maxCollections ?? 3)) {
        // Query all — either single-stream or few enough to just query them all
        validSlugs = active.map((c) => c.slug);
        this.logger.debug(
          `[smartContext] ${isSingleStream ? 'Ollama (skip LLM routing)' : 'Few collections'} — querying all ${validSlugs.length}: ${validSlugs.join(', ')}`,
        );
      } else {
        // Cloud provider with many collections — use LLM to pick the best ones
        const collectionList = active
          .map(
            (c) =>
              `- slug: "${c.slug}" | name: "${c.name}" | ${c.documentCount} docs | description: ${c.description || 'No description'}`,
          )
          .join('\n');

        this.logger.debug(`[smartContext] Calling LLM for routing...`);
        const routingResponse = await llmClient.callLLM({
          context: params.context,
          systemMessage: `You are a search routing assistant. Given a user query and a list of document collections, select which collections are most likely to contain relevant information. Return ONLY a JSON array of collection slugs, ordered by relevance. Select up to ${params.maxCollections ?? 3} collections.\n\nExample response: ["collection-a", "collection-b"]`,
          userMessage: `Query: "${params.query}"\n\nAvailable collections:\n${collectionList}`,
          temperature: 0,
          maxTokens: 200,
          callerName: 'workflow-rag:smart-routing',
        });

        try {
          const selectedSlugs = JSON.parse(
            stripMarkdownFences(routingResponse.text),
          ) as string[];
          validSlugs = selectedSlugs.filter((s) =>
            active.some((c) => c.slug === s),
          );
          if (validSlugs.length === 0) {
            validSlugs = active.map((c) => c.slug);
          }
        } catch {
          validSlugs = active.map((c) => c.slug);
        }
        this.logger.debug(
          `[smartContext] LLM routed to ${validSlugs.length} collections: ${validSlugs.join(', ')}`,
        );
      }

      // 3. Query selected collections sequentially with logging
      const results: string[] = [];
      for (const slug of validSlugs) {
        const result = await this.getContext({
          collectionSlug: slug,
          orgSlug: params.orgSlug,
          query: params.query,
          topK: params.topK ?? 5,
        });
        this.logger.debug(
          `[smartContext]   ${slug}: ${result.length > 0 ? result.length + ' chars returned' : 'empty'}`,
        );
        results.push(result);
      }

      // 4. Merge non-empty results
      const nonEmpty = results.filter((r) => r.length > 0);
      this.logger.debug(
        `[smartContext] Got ${nonEmpty.length}/${results.length} non-empty results (total ${nonEmpty.reduce((a, r) => a + r.length, 0)} chars)`,
      );
      const merged = nonEmpty.join('\n');
      return merged || '';
    } catch (error) {
      this.logger.debug(
        `[smartContext] FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }
}
