import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { IsString, IsInt, IsNumber, IsOptional } from 'class-validator';
import { CollectionsService } from './collections.service';
import { QueryService, SearchResult } from './query.service';

/**
 * Request DTO for the internal RAG query endpoint
 */
export class InternalRagQueryDto {
  @IsString()
  collectionSlug!: string;

  @IsString()
  orgSlug!: string;

  @IsString()
  query!: string;

  @IsInt()
  @IsOptional()
  topK?: number;

  @IsNumber()
  @IsOptional()
  similarityThreshold?: number;
}

/**
 * A single result returned by the internal RAG query endpoint
 */
export interface InternalRagResult {
  documentId: string;
  content: string;
  score: number;
  section?: string;
  pageNumber?: number | null;
}

/**
 * InternalQueryController
 *
 * Internal service-to-service endpoint — NO JWT guard.
 * Allows LangGraph (and other internal services) to query RAG collections
 * without requiring user authentication.
 *
 * POST /rag/internal/query
 */
@Controller('rag/internal')
export class InternalQueryController {
  constructor(
    private readonly collectionsService: CollectionsService,
    private readonly queryService: QueryService,
  ) {}

  /**
   * Query a RAG collection by slug
   *
   * 1. Look up the collection by orgSlug + collectionSlug
   * 2. Throw NotFoundException if not found
   * 3. Run vector similarity search
   * 4. Map SearchResult[] to InternalRagResult[]
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  async query(
    @Body() dto: InternalRagQueryDto,
  ): Promise<{ results: InternalRagResult[] }> {
    // Resolve collection by slug
    const collections = await this.collectionsService.getCollections(
      dto.orgSlug,
    );

    const collection = collections.find((c) => c.slug === dto.collectionSlug);

    if (!collection) {
      throw new NotFoundException(
        `RAG collection '${dto.collectionSlug}' not found for organization '${dto.orgSlug}'`,
      );
    }

    // Execute vector similarity search
    const queryResponse = await this.queryService.queryCollection(
      collection.id,
      dto.orgSlug,
      {
        query: dto.query,
        topK: dto.topK ?? 5,
        similarityThreshold: dto.similarityThreshold ?? 0.5,
      },
      collection.embeddingModel,
    );

    // Map SearchResult[] to InternalRagResult[]
    const results: InternalRagResult[] = queryResponse.results.map(
      (r: SearchResult) => ({
        documentId: r.documentId,
        content: r.content,
        score: r.score,
        section: r.sectionPath,
        pageNumber: r.pageNumber,
      }),
    );

    return { results };
  }
}
