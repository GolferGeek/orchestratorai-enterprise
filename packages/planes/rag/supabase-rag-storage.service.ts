import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';
import {
  RagStorageService,
  RagComplexityType,
  RagCollection,
  CreateCollectionInput,
  UpdateCollectionInput,
  RagDocument,
  RagDocumentContent,
  InsertDocumentInput,
  RagChunk,
  ChunkInput,
  RagSearchResult,
} from './rag-storage.interface';

// ---------------------------------------------------------------------------
// DB row shapes (snake_case from PostgreSQL)
// ---------------------------------------------------------------------------

interface DbCollection {
  id: string;
  organization_slug: string;
  name: string;
  slug: string;
  description: string | null;
  embedding_model: string;
  embedding_dimensions: number;
  chunk_size: number;
  chunk_overlap: number;
  status: string;
  required_role: string | null;
  allowed_users: string[] | null;
  complexity_type: string;
  document_count: number;
  chunk_count: number;
  total_tokens: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

interface DbDocument {
  id: string;
  collection_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  file_hash: string | null;
  storage_path: string | null;
  content: string | null;
  status: string;
  error_message: string | null;
  chunk_count: number;
  token_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  processed_at: Date | null;
}

interface DbChunk {
  id: string;
  content: string;
  chunk_index: number;
  token_count: number;
  page_number: number | null;
  metadata: Record<string, unknown>;
}

interface DbSearchResult {
  chunk_id: string;
  document_id: string;
  document_filename: string;
  content: string;
  score: number;
  page_number: number | null;
  chunk_index: number;
  char_offset: number | null;
  metadata: Record<string, unknown>;
}

/**
 * Supabase/pgvector RAG storage implementation.
 *
 * Uses a direct pg Pool pointed at the rag_data schema, calling
 * stored functions (rag_get_collections, rag_search, etc.).
 */
@Injectable()
export class SupabaseRagStorageService
  implements RagStorageService, OnModuleInit, OnModuleDestroy
{
  private pool: Pool | null = null;
  private readonly logger = new Logger(SupabaseRagStorageService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initializePool();
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('RAG database pool closed');
    }
  }

  private async initializePool() {
    const connectionString = this.configService.get<string>('DATABASE_URL');

    if (!connectionString) {
      this.logger.warn('DATABASE_URL not configured - RAG features disabled');
      return;
    }

    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO rag_data, public');
      await client.query('SELECT 1');
      this.logger.log('RAG database pool initialized (rag_data schema)');
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async queryAll<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    if (!this.pool) throw new Error('RAG database not available');
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO rag_data, public');
      const result = await client.query<T>(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  private async queryOne<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T | null> {
    const rows = await this.queryAll<T>(text, params);
    return rows[0] || null;
  }

  private async execute(text: string, params?: unknown[]): Promise<void> {
    await this.queryAll(text, params);
  }

  private toCollection(row: DbCollection): RagCollection {
    return {
      id: row.id,
      organizationSlug: row.organization_slug,
      name: row.name,
      slug: row.slug,
      description: row.description,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      chunkSize: row.chunk_size,
      chunkOverlap: row.chunk_overlap,
      status: row.status as RagCollection['status'],
      requiredRole: row.required_role,
      allowedUsers: row.allowed_users,
      complexityType: (row.complexity_type || 'basic') as RagComplexityType,
      createdBy: row.created_by,
      documentCount: row.document_count,
      chunkCount: row.chunk_count,
      totalTokens: row.total_tokens,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toDocument(row: DbDocument): RagDocument {
    return {
      id: row.id,
      collectionId: row.collection_id,
      filename: row.filename,
      fileType: row.file_type,
      fileSize: row.file_size,
      fileHash: row.file_hash,
      storagePath: row.storage_path,
      content: row.content,
      status: row.status as RagDocument['status'],
      errorMessage: row.error_message,
      chunkCount: row.chunk_count,
      tokenCount: row.token_count,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      processedAt: row.processed_at,
    };
  }

  private toChunk(row: DbChunk): RagChunk {
    return {
      id: row.id,
      content: row.content,
      chunkIndex: row.chunk_index,
      tokenCount: row.token_count,
      pageNumber: row.page_number,
      metadata: row.metadata || {},
    };
  }

  private toSearchResult(row: DbSearchResult): RagSearchResult {
    return {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentFilename: row.document_filename,
      content: row.content,
      score: row.score,
      pageNumber: row.page_number,
      chunkIndex: row.chunk_index,
      charOffset: row.char_offset,
      metadata: row.metadata || {},
    };
  }

  // ---------------------------------------------------------------------------
  // Collections
  // ---------------------------------------------------------------------------

  async getCollections(
    orgSlug: string,
    userId?: string,
  ): Promise<RagCollection[]> {
    const rows = await this.queryAll<DbCollection>(
      'SELECT * FROM rag_get_collections($1, $2)',
      [orgSlug, userId || null],
    );
    return rows.map((r) => this.toCollection(r));
  }

  async getCollection(
    collectionId: string,
    orgSlug: string,
  ): Promise<RagCollection | null> {
    const row = await this.queryOne<DbCollection>(
      'SELECT * FROM rag_get_collection($1, $2)',
      [collectionId, orgSlug],
    );
    return row ? this.toCollection(row) : null;
  }

  async getCollectionBySlug(
    slug: string,
    orgSlug: string,
  ): Promise<RagCollection | null> {
    const row = await this.queryOne<DbCollection>(
      'SELECT * FROM rag_get_collection_by_slug($1, $2)',
      [slug, orgSlug],
    );
    return row ? this.toCollection(row) : null;
  }

  async createCollection(
    orgSlug: string,
    input: CreateCollectionInput,
  ): Promise<RagCollection> {
    const row = await this.queryOne<DbCollection>(
      `SELECT * FROM rag_create_collection($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        orgSlug,
        input.name,
        input.slug,
        input.description,
        input.embeddingModel,
        input.embeddingDimensions,
        input.chunkSize,
        input.chunkOverlap,
        input.createdBy,
        input.requiredRole,
        input.allowedUsers,
        input.complexityType,
      ],
    );
    if (!row) throw new Error('Failed to create collection');
    return this.toCollection(row);
  }

  async updateCollection(
    collectionId: string,
    orgSlug: string,
    updates: UpdateCollectionInput,
  ): Promise<RagCollection | null> {
    const row = await this.queryOne<DbCollection>(
      `SELECT * FROM rag_update_collection($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        collectionId,
        orgSlug,
        updates.name,
        updates.description,
        updates.requiredRole,
        updates.allowedUsers,
        updates.clearAllowedUsers,
        updates.complexityType,
      ],
    );
    return row ? this.toCollection(row) : null;
  }

  async deleteCollection(
    collectionId: string,
    orgSlug: string,
  ): Promise<boolean> {
    const result = await this.queryOne<{ rag_delete_collection: boolean }>(
      'SELECT rag_delete_collection($1, $2)',
      [collectionId, orgSlug],
    );
    return result?.rag_delete_collection ?? false;
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  async getDocuments(
    collectionId: string,
    orgSlug: string,
  ): Promise<RagDocument[]> {
    const rows = await this.queryAll<DbDocument>(
      'SELECT * FROM rag_get_documents($1, $2)',
      [collectionId, orgSlug],
    );
    return rows.map((r) => this.toDocument(r));
  }

  async getDocument(
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocument | null> {
    const row = await this.queryOne<DbDocument>(
      'SELECT * FROM rag_get_document($1, $2)',
      [documentId, orgSlug],
    );
    return row ? this.toDocument(row) : null;
  }

  async getDocumentContent(
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocumentContent | null> {
    const row = await this.queryOne<{
      id: string;
      filename: string;
      file_type: string;
      content: string | null;
      chunk_count: number;
    }>('SELECT * FROM rag_get_document_content($1, $2)', [documentId, orgSlug]);

    if (!row) return null;
    return {
      id: row.id,
      filename: row.filename,
      fileType: row.file_type,
      content: row.content,
      chunkCount: row.chunk_count,
    };
  }

  async insertDocument(
    collectionId: string,
    orgSlug: string,
    input: InsertDocumentInput,
  ): Promise<RagDocument> {
    const row = await this.queryOne<DbDocument>(
      'SELECT * FROM rag_insert_document($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        collectionId,
        orgSlug,
        input.filename,
        input.fileType,
        input.fileSize,
        input.fileHash,
        input.storagePath,
        input.createdBy,
        input.content,
      ],
    );
    if (!row) throw new Error('Failed to insert document');
    return this.toDocument(row);
  }

  async updateDocumentContent(
    documentId: string,
    orgSlug: string,
    content: string,
  ): Promise<void> {
    await this.execute(
      `UPDATE rag_data.rag_documents
       SET content = $1, updated_at = NOW()
       WHERE id = $2 AND organization_slug = $3`,
      [content, documentId, orgSlug],
    );
  }

  async updateDocumentStatus(
    documentId: string,
    orgSlug: string,
    status: string,
    errorMessage?: string,
    chunkCount?: number,
    tokenCount?: number,
  ): Promise<RagDocument | null> {
    const row = await this.queryOne<DbDocument>(
      'SELECT * FROM rag_update_document_status($1, $2, $3, $4, $5, $6)',
      [
        documentId,
        orgSlug,
        status,
        errorMessage || null,
        chunkCount ?? null,
        tokenCount ?? null,
      ],
    );
    return row ? this.toDocument(row) : null;
  }

  async deleteDocument(documentId: string, orgSlug: string): Promise<boolean> {
    const result = await this.queryOne<{ rag_delete_document: boolean }>(
      'SELECT rag_delete_document($1, $2)',
      [documentId, orgSlug],
    );
    return result?.rag_delete_document ?? false;
  }

  // ---------------------------------------------------------------------------
  // Chunks
  // ---------------------------------------------------------------------------

  async getDocumentChunks(
    documentId: string,
    orgSlug: string,
  ): Promise<RagChunk[]> {
    const rows = await this.queryAll<DbChunk>(
      'SELECT * FROM rag_get_document_chunks($1, $2)',
      [documentId, orgSlug],
    );
    return rows.map((r) => this.toChunk(r));
  }

  async deleteDocumentChunks(
    documentId: string,
    organizationSlug: string,
  ): Promise<number> {
    const rows = await this.queryAll<{ id: string }>(
      `DELETE FROM rag_data.rag_document_chunks
       WHERE document_id = $1 AND organization_slug = $2
       RETURNING id`,
      [documentId, organizationSlug],
    );
    return rows.length;
  }

  async insertChunks(
    documentId: string,
    orgSlug: string,
    chunks: ChunkInput[],
  ): Promise<number> {
    const chunksJsonb = chunks.map((chunk) => ({
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      embedding: chunk.embedding ? `[${chunk.embedding.join(',')}]` : null,
      token_count: chunk.tokenCount,
      page_number: chunk.pageNumber,
      char_offset: chunk.charOffset,
      metadata: chunk.metadata || {},
    }));

    const result = await this.queryOne<{ rag_insert_chunks: number }>(
      'SELECT rag_insert_chunks($1, $2, $3::jsonb)',
      [documentId, orgSlug, JSON.stringify(chunksJsonb)],
    );
    return result?.rag_insert_chunks || 0;
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  async vectorSearch(
    collectionId: string,
    orgSlug: string,
    embedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<RagSearchResult[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const rows = await this.queryAll<DbSearchResult>(
      `SELECT * FROM rag_search($1, $2, $3::vector, $4, $5)`,
      [collectionId, orgSlug, embeddingStr, topK, similarityThreshold],
    );
    return rows.map((r) => this.toSearchResult(r));
  }

  async globalVectorSearch(
    orgSlug: string,
    embedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<RagSearchResult[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const rows = await this.queryAll<DbSearchResult>(
      `SELECT
        c.id AS chunk_id,
        c.document_id,
        d.filename AS document_filename,
        c.content,
        1 - (c.embedding <=> $1::vector) AS score,
        c.page_number,
        c.chunk_index,
        c.char_offset,
        c.metadata
      FROM rag_data.rag_document_chunks c
      JOIN rag_data.rag_documents d ON c.document_id = d.id
      WHERE c.organization_slug = $2
        AND 1 - (c.embedding <=> $1::vector) >= $4
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3`,
      [embeddingStr, orgSlug, topK, similarityThreshold],
    );
    return rows.map((r) => this.toSearchResult(r));
  }

  async keywordSearch(
    collectionId: string,
    orgSlug: string,
    query: string,
    topK: number,
  ): Promise<RagSearchResult[]> {
    // Build tsquery with OR operator. Filter stop words so keyword search
    // focuses on meaningful terms. PostgreSQL's to_tsquery handles stemming.
    const stopWords = new Set([
      'the','and','for','are','but','not','you','all','can','had','her','was',
      'one','our','out','are','has','his','how','its','may','new','now','old',
      'see','way','who','did','get','let','say','she','too','use','what','when',
      'where','which','while','with','this','that','from','have','been','will',
      'they','their','there','about','would','could','should','between','through',
      'being','before','after','during','each','into','some','than','them','then',
      'these','those','under','very','just','also','over','such','only','other',
      'tell','does','much','many','most','more','made','make','like','well','back',
    ]);
    const tsQuery = query
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, ''))
      .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
      .join(' | ');

    if (!tsQuery) return [];

    const rows = await this.queryAll<DbSearchResult>(
      `SELECT
        c.id AS chunk_id,
        c.document_id,
        d.filename AS document_filename,
        c.content,
        ts_rank(to_tsvector('english', c.content), to_tsquery('english', $4)) AS score,
        c.page_number,
        c.chunk_index,
        c.char_offset,
        c.metadata
      FROM rag_data.rag_document_chunks c
      JOIN rag_data.rag_documents d ON c.document_id = d.id
      JOIN rag_data.rag_collections col ON c.collection_id = col.id
      WHERE col.id = $1
        AND col.organization_slug = $2
        AND to_tsvector('english', c.content) @@ to_tsquery('english', $4)
      ORDER BY score DESC
      LIMIT $3`,
      [collectionId, orgSlug, topK, tsQuery],
    );

    return rows.map((r) => this.toSearchResult(r));
  }

  // ---------------------------------------------------------------------------
  // Infrastructure
  // ---------------------------------------------------------------------------

  isAvailable(): boolean {
    return this.pool !== null;
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    if (!this.pool) {
      return { status: 'disabled', message: 'RAG database not configured' };
    }
    const result = await this.pool.query<{ time: Date }>(
      'SELECT NOW() as time',
    );
    return {
      status: 'ok',
      message: `Connected at ${String(result.rows[0]?.time ?? 'unknown')}`,
    };
  }
}
