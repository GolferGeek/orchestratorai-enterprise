import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RAG_STORAGE_SERVICE,
  RagStorageService,
  RagSearchResult,
  RagComplexityType,
} from './rag-storage.interface';
import {
  EMBEDDING_SERVICE,
  EmbeddingServiceProvider,
} from './embedding.interface';

/**
 * Query parameters for vector search.
 *
 * Product-level DTOs (with class-validator decorators) can satisfy this
 * interface — controllers pass their validated DTO directly.
 */
export interface QueryParams {
  query: string;
  topK?: number;
  similarityThreshold?: number;
  strategy?: 'basic' | 'mmr' | 'reranking';
  documentIds?: string[];
  includeMetadata?: boolean;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentFilename: string;
  content: string;
  score: number;
  pageNumber: number | null;
  chunkIndex: number;
  charOffset?: number;
  metadata?: Record<string, unknown>;
  documentIdRef?: string;
  sectionPath?: string;
  matchType?: 'keyword' | 'semantic' | 'both';
  version?: string;
}

export interface RelatedDocument {
  documentId: string;
  documentIdRef?: string;
  title: string;
  relationship: string;
}

export interface QueryResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchDurationMs: number;
  relatedDocuments?: RelatedDocument[];
  complexityType?: RagComplexityType;
}

/**
 * QueryService
 *
 * Handles vector similarity search across RAG collections. This service does NOT
 * receive ExecutionContext because it is a pure data-retrieval layer.
 */
@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    @Inject(RAG_STORAGE_SERVICE)
    private ragStorage: RagStorageService,
    @Inject(EMBEDDING_SERVICE)
    private embeddingService: EmbeddingServiceProvider,
  ) {}

  /**
   * Convert storage result to API response format
   */
  private toSearchResult(
    row: RagSearchResult,
    includeMetadata: boolean,
  ): SearchResult {
    const result: SearchResult = {
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentFilename: row.documentFilename,
      content: row.content,
      score: parseFloat(row.score.toFixed(4)),
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      charOffset: row.charOffset ?? undefined,
    };

    if (includeMetadata) {
      result.metadata = row.metadata || {};
    }

    return result;
  }

  /**
   * Search a collection using vector similarity
   */
  async queryCollection(
    collectionId: string,
    organizationSlug: string,
    dto: QueryParams,
    embeddingModel?: string,
  ): Promise<QueryResponse> {
    const startTime = Date.now();

    const model = embeddingModel || 'nomic-embed-text';
    const queryEmbedding = await this.embeddingService.embed(dto.query, model);

    // Use model-calibrated threshold from the embedding plane.
    // The caller may pass a threshold, but if it exceeds the model's
    // recommended value it would silently filter out all results.
    const modelThreshold = this.embeddingService.getRecommendedThreshold(model);
    const callerThreshold = dto.similarityThreshold || modelThreshold;
    const threshold = Math.min(callerThreshold, modelThreshold);

    if (callerThreshold > modelThreshold) {
      this.logger.warn(
        `Caller threshold ${callerThreshold} exceeds model '${model}' recommended ${modelThreshold} — capping to ${modelThreshold}`,
      );
    }

    let results: SearchResult[];

    switch (dto.strategy) {
      case 'mmr':
        results = await this.mmrSearch(
          collectionId,
          organizationSlug,
          queryEmbedding,
          dto.topK || 5,
          threshold,
          dto.includeMetadata || false,
        );
        break;

      case 'reranking':
        this.logger.warn(
          'Reranking strategy not yet implemented, using basic search',
        );
        results = await this.basicSearch(
          collectionId,
          organizationSlug,
          queryEmbedding,
          dto.topK || 5,
          threshold,
          dto.includeMetadata || false,
        );
        break;

      case 'basic':
      default:
        results = await this.basicSearch(
          collectionId,
          organizationSlug,
          queryEmbedding,
          dto.topK || 5,
          threshold,
          dto.includeMetadata || false,
        );
    }

    const searchDurationMs = Date.now() - startTime;

    this.logger.debug(
      `Query '${dto.query.substring(0, 50)}...' returned ${results.length} results in ${searchDurationMs}ms`,
    );

    return {
      query: dto.query,
      results,
      totalResults: results.length,
      searchDurationMs,
    };
  }

  /**
   * Basic vector similarity search
   */
  private async basicSearch(
    collectionId: string,
    organizationSlug: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold: number,
    includeMetadata: boolean,
  ): Promise<SearchResult[]> {
    const rows = await this.ragStorage.vectorSearch(
      collectionId,
      organizationSlug,
      queryEmbedding,
      topK,
      similarityThreshold,
    );

    return rows.map((row) => this.toSearchResult(row, includeMetadata));
  }

  /**
   * MMR (Maximal Marginal Relevance) search
   */
  private async mmrSearch(
    collectionId: string,
    organizationSlug: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold: number,
    includeMetadata: boolean,
    lambda: number = 0.5,
  ): Promise<SearchResult[]> {
    const candidates = await this.basicSearch(
      collectionId,
      organizationSlug,
      queryEmbedding,
      topK * 3,
      similarityThreshold,
      includeMetadata,
    );

    if (candidates.length <= topK) {
      return candidates;
    }

    const selected: SearchResult[] = [];
    const remaining = [...candidates];

    while (selected.length < topK && remaining.length > 0) {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const current = remaining[i];
        if (!current) continue;

        const relevance = current.score;
        const maxSimilarity =
          selected.length > 0
            ? Math.max(
                ...selected.map((s) =>
                  this.contentSimilarity(current.content, s.content),
                ),
              )
            : 0;

        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      const best = remaining[bestIdx];
      if (best) {
        selected.push(best);
        remaining.splice(bestIdx, 1);
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Simple content similarity based on Jaccard coefficient
   */
  private contentSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  // ==========================================================================
  // GLOBAL SEARCH
  // ==========================================================================

  /**
   * Global search — queries ALL chunks for an org, ignoring collection
   * boundaries. Intended for workflow agents that need to search across
   * the entire org's knowledge base in one shot.
   *
   * Interactive users should use queryCollection() which respects
   * collection-level access control.
   */
  async globalSearch(
    orgSlug: string,
    query: string,
    topK: number = 8,
    embeddingModel?: string,
  ): Promise<QueryResponse> {
    const startTime = Date.now();

    if (!this.ragStorage.globalVectorSearch) {
      this.logger.warn(
        'globalVectorSearch not supported by this RAG provider — falling back to empty',
      );
      return { query, results: [], totalResults: 0, searchDurationMs: 0 };
    }

    const model = embeddingModel || 'nomic-embed-text';
    const queryEmbedding = await this.embeddingService.embed(query, model);
    const threshold = this.embeddingService.getRecommendedThreshold(model);

    const rows = await this.ragStorage.globalVectorSearch(
      orgSlug,
      queryEmbedding,
      topK,
      threshold,
    );

    const results = rows.map((row) => this.toSearchResult(row, false));
    const searchDurationMs = Date.now() - startTime;

    return { query, results, totalResults: results.length, searchDurationMs };
  }

  // ==========================================================================
  // COMPLEXITY-BASED QUERY METHODS
  // ==========================================================================

  async queryByComplexity(
    collectionId: string,
    organizationSlug: string,
    complexityType: RagComplexityType,
    dto: QueryParams,
    embeddingModel?: string,
  ): Promise<QueryResponse> {
    const startTime = Date.now();
    const model = embeddingModel || 'nomic-embed-text';
    const queryEmbedding = await this.embeddingService.embed(dto.query, model);

    // Use model-calibrated threshold (same logic as queryCollection)
    const modelThreshold = this.embeddingService.getRecommendedThreshold(model);
    const callerThreshold = dto.similarityThreshold || modelThreshold;
    const threshold = Math.min(callerThreshold, modelThreshold);

    let results: SearchResult[];
    let relatedDocuments: RelatedDocument[] | undefined;

    switch (complexityType) {
      case 'attributed':
        results = await this.attributedSearch(
          collectionId,
          organizationSlug,
          queryEmbedding,
          dto.topK || 5,
          threshold,
        );
        break;

      case 'hybrid':
        results = await this.hybridSearch(
          collectionId,
          organizationSlug,
          dto.query,
          queryEmbedding,
          dto.topK || 5,
          threshold,
        );
        break;

      case 'cross-reference': {
        const crossRefResult = await this.crossReferenceSearch(
          collectionId,
          organizationSlug,
          queryEmbedding,
          dto.topK || 5,
          threshold,
        );
        results = crossRefResult.results;
        relatedDocuments = crossRefResult.relatedDocuments;
        break;
      }

      case 'temporal':
        results = await this.temporalSearch(
          collectionId,
          organizationSlug,
          queryEmbedding,
          dto.topK || 5,
          threshold,
        );
        break;

      case 'comprehensive': {
        const compResult = await this.comprehensiveSearch(
          collectionId,
          organizationSlug,
          dto.query,
          queryEmbedding,
          dto.topK || 5,
          threshold,
        );
        results = compResult.results;
        relatedDocuments = compResult.relatedDocuments;
        break;
      }

      case 'basic':
      default:
        results = await this.basicSearch(
          collectionId,
          organizationSlug,
          queryEmbedding,
          dto.topK || 5,
          threshold,
          dto.includeMetadata || false,
        );
    }

    const searchDurationMs = Date.now() - startTime;

    this.logger.debug(
      `Complexity query (${complexityType}) '${dto.query.substring(0, 50)}...' returned ${results.length} results in ${searchDurationMs}ms`,
    );

    return {
      query: dto.query,
      results,
      totalResults: results.length,
      searchDurationMs,
      complexityType,
      relatedDocuments,
    };
  }

  private async attributedSearch(
    collectionId: string,
    organizationSlug: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<SearchResult[]> {
    const baseResults = await this.basicSearch(
      collectionId,
      organizationSlug,
      queryEmbedding,
      topK,
      similarityThreshold,
      true,
    );

    return baseResults.map((result) => ({
      ...result,
      documentIdRef: this.extractDocumentId(result.metadata),
      sectionPath: this.extractSectionPath(result.metadata, result.content),
    }));
  }

  private async hybridSearch(
    collectionId: string,
    organizationSlug: string,
    query: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<SearchResult[]> {
    // Fetch a larger candidate pool for fusion — 3x topK for each strategy.
    // Lower the semantic threshold to 60% of base so more diverse results
    // participate in the fusion, letting keyword matches compensate.
    const candidateMultiplier = 3;
    const semanticResults = await this.basicSearch(
      collectionId,
      organizationSlug,
      queryEmbedding,
      topK * candidateMultiplier,
      similarityThreshold * 0.6,
      true,
    );

    const keywordRows = await this.ragStorage.keywordSearch(
      collectionId,
      organizationSlug,
      query,
      topK * candidateMultiplier,
    );
    const keywordResults: SearchResult[] = keywordRows.map((row) => ({
      ...this.toSearchResult(row, true),
      matchType: 'keyword' as const,
    }));

    return this.reciprocalRankFusion(semanticResults, keywordResults, topK);
  }

  private reciprocalRankFusion(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    topK: number,
    k: number = 60,
  ): SearchResult[] {
    const scores = new Map<
      string,
      { score: number; result: SearchResult; sources: Set<string> }
    >();

    semanticResults.forEach((result, idx) => {
      const existing = scores.get(result.chunkId);
      const rrfScore = 1 / (k + idx + 1);
      if (existing) {
        existing.score += rrfScore;
        existing.sources.add('semantic');
      } else {
        scores.set(result.chunkId, {
          score: rrfScore,
          result: { ...result, matchType: 'semantic' },
          sources: new Set(['semantic']),
        });
      }
    });

    keywordResults.forEach((result, idx) => {
      const existing = scores.get(result.chunkId);
      const rrfScore = 1 / (k + idx + 1);
      if (existing) {
        existing.score += rrfScore;
        existing.sources.add('keyword');
        if (existing.sources.size === 2) {
          existing.result.matchType = 'both';
        }
      } else {
        scores.set(result.chunkId, {
          score: rrfScore,
          result: { ...result, matchType: 'keyword' },
          sources: new Set(['keyword']),
        });
      }
    });

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((item) => ({
        ...item.result,
        score: item.score,
      }));
  }

  private async crossReferenceSearch(
    collectionId: string,
    organizationSlug: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<{ results: SearchResult[]; relatedDocuments: RelatedDocument[] }> {
    const baseResults = await this.basicSearch(
      collectionId,
      organizationSlug,
      queryEmbedding,
      topK,
      similarityThreshold,
      true,
    );

    const relatedDocIds = new Set<string>();
    const relatedDocuments: RelatedDocument[] = [];

    for (const result of baseResults) {
      result.documentIdRef = this.extractDocumentId(result.metadata);
      result.sectionPath = this.extractSectionPath(
        result.metadata,
        result.content,
      );

      const refs = this.extractCrossReferences(result.metadata, result.content);
      for (const ref of refs) {
        const refId = ref.documentIdRef || ref.documentId;
        if (refId && !relatedDocIds.has(refId)) {
          relatedDocIds.add(refId);
          relatedDocuments.push(ref);
        }
      }
    }

    return { results: baseResults, relatedDocuments };
  }

  private async temporalSearch(
    collectionId: string,
    organizationSlug: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<SearchResult[]> {
    const baseResults = await this.basicSearch(
      collectionId,
      organizationSlug,
      queryEmbedding,
      topK * 2,
      similarityThreshold,
      true,
    );

    const enriched = baseResults.map((result) => ({
      ...result,
      documentIdRef: this.extractDocumentId(result.metadata),
      version: this.extractVersion(result.metadata, result.documentFilename),
    }));

    const byDocument = new Map<string, SearchResult[]>();
    for (const result of enriched) {
      const key = result.documentIdRef || result.documentFilename;
      if (!byDocument.has(key)) {
        byDocument.set(key, []);
      }
      byDocument.get(key)!.push(result);
    }

    const sorted: SearchResult[] = [];
    for (const [, versions] of byDocument) {
      versions.sort((a, b) => {
        const vA = a.version || '0';
        const vB = b.version || '0';
        return vB.localeCompare(vA, undefined, { numeric: true });
      });
      sorted.push(...versions);
    }

    return sorted.slice(0, topK);
  }

  /**
   * Comprehensive search — combines all RAG strategies for maximum quality.
   *
   * 1. Hybrid search (keyword + semantic via RRF) for best recall
   * 2. Attribution (document IDs + section paths) for citations
   * 3. Cross-reference extraction for related documents
   * 4. Temporal/version grouping where document versions exist
   *
   * Designed for high-stakes domains (legal, compliance) where every
   * relevant document and relationship matters.
   */
  private async comprehensiveSearch(
    collectionId: string,
    organizationSlug: string,
    query: string,
    queryEmbedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<{ results: SearchResult[]; relatedDocuments: RelatedDocument[] }> {
    // Step 1: Hybrid search (keyword + semantic) for best recall
    const hybridResults = await this.hybridSearch(
      collectionId,
      organizationSlug,
      query,
      queryEmbedding,
      topK * 2, // fetch more candidates — we'll filter down
      similarityThreshold,
    );

    // Step 2: Enrich with attribution (document IDs, section paths)
    const attributed = hybridResults.map((result) => ({
      ...result,
      documentIdRef: this.extractDocumentId(result.metadata),
      sectionPath: this.extractSectionPath(result.metadata, result.content),
    }));

    // Step 3: Extract cross-references from all results
    const relatedDocIds = new Set<string>();
    const relatedDocuments: RelatedDocument[] = [];

    for (const result of attributed) {
      const refs = this.extractCrossReferences(result.metadata, result.content);
      for (const ref of refs) {
        const refId = ref.documentIdRef || ref.documentId;
        if (refId && !relatedDocIds.has(refId)) {
          relatedDocIds.add(refId);
          relatedDocuments.push(ref);
        }
      }
    }

    // Step 4: Temporal grouping — group by document and sort versions
    const byDocument = new Map<string, SearchResult[]>();
    for (const result of attributed) {
      result.version = this.extractVersion(result.metadata, result.documentFilename);
      const key = result.documentIdRef || result.documentFilename;
      if (!byDocument.has(key)) {
        byDocument.set(key, []);
      }
      byDocument.get(key)!.push(result);
    }

    // Within each document group, newest version first
    const sorted: SearchResult[] = [];
    for (const [, versions] of byDocument) {
      versions.sort((a, b) => {
        const vA = a.version || '0';
        const vB = b.version || '0';
        return vB.localeCompare(vA, undefined, { numeric: true });
      });
      sorted.push(...versions);
    }

    return {
      results: sorted.slice(0, topK),
      relatedDocuments,
    };
  }

  // ==========================================================================
  // HELPER METHODS FOR METADATA EXTRACTION
  // ==========================================================================

  private extractDocumentId(
    metadata?: Record<string, unknown>,
  ): string | undefined {
    if (!metadata) return undefined;
    if (typeof metadata.document_id === 'string') return metadata.document_id;
    if (typeof metadata.documentId === 'string') return metadata.documentId;
    if (typeof metadata.doc_id === 'string') return metadata.doc_id;
    return undefined;
  }

  private extractSectionPath(
    metadata?: Record<string, unknown>,
    content?: string,
  ): string | undefined {
    if (metadata) {
      if (typeof metadata.section_path === 'string')
        return metadata.section_path;
      if (typeof metadata.sectionPath === 'string') return metadata.sectionPath;
      if (typeof metadata.section === 'string') return metadata.section;
    }
    if (content) {
      const headerMatch = content.match(/^#+\s+(.+?)$/m);
      if (headerMatch) return headerMatch[1];
    }
    return undefined;
  }

  private extractCrossReferences(
    metadata?: Record<string, unknown>,
    content?: string,
  ): RelatedDocument[] {
    const refs: RelatedDocument[] = [];

    if (
      metadata?.cross_references &&
      Array.isArray(metadata.cross_references)
    ) {
      for (const ref of metadata.cross_references) {
        if (typeof ref === 'string') {
          refs.push({
            documentId: ref,
            documentIdRef: ref,
            title: ref,
            relationship: 'referenced',
          });
        } else if (typeof ref === 'object' && ref !== null) {
          const refObj = ref as Record<string, unknown>;
          const getId = (): string => {
            if (typeof refObj.id === 'string') return refObj.id;
            if (typeof refObj.document_id === 'string')
              return refObj.document_id;
            return '';
          };
          const getTitle = (): string => {
            if (typeof refObj.title === 'string') return refObj.title;
            if (typeof refObj.name === 'string') return refObj.name;
            return '';
          };
          const getRelationship = (): string => {
            if (typeof refObj.relationship === 'string')
              return refObj.relationship;
            return 'referenced';
          };
          refs.push({
            documentId: getId(),
            documentIdRef: getId(),
            title: getTitle(),
            relationship: getRelationship(),
          });
        }
      }
    }

    if (content) {
      const linkPattern = /\[([^\]]+)\]\(([A-Z]{2,4}-\d{3})\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const docId = match[2] || '';
        refs.push({
          documentId: docId,
          documentIdRef: docId,
          title: match[1] || docId,
          relationship: 'see also',
        });
      }
    }

    return refs;
  }

  private extractVersion(
    metadata?: Record<string, unknown>,
    filename?: string,
  ): string | undefined {
    if (metadata) {
      if (typeof metadata.version === 'string') return metadata.version;
      if (typeof metadata.doc_version === 'string') return metadata.doc_version;
    }
    if (filename) {
      const versionMatch = filename.match(/-v(\d+(?:\.\d+)?)/i);
      if (versionMatch) return versionMatch[1];
    }
    return undefined;
  }
}
