import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
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

/**
 * PostgreSQL RAG storage implementation using pgvector.
 *
 * Uses a raw pg Pool for direct SQL queries. Vector search
 * leverages the pgvector <=> cosine distance operator.
 *
 * Connection via RAG_POSTGRESQL_URL or falls back to POSTGRESQL_URL.
 */
@Injectable()
export class PostgresqlRagStorageService implements RagStorageService {
  private readonly logger = new Logger(PostgresqlRagStorageService.name);
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {}

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private toCollection(row: Record<string, unknown>): RagCollection {
    return {
      id: row.id as string,
      organizationSlug: row.organization_slug as string,
      name: row.name as string,
      slug: row.slug as string,
      description: (row.description as string) ?? null,
      embeddingModel: row.embedding_model as string,
      embeddingDimensions: row.embedding_dimensions as number,
      chunkSize: row.chunk_size as number,
      chunkOverlap: row.chunk_overlap as number,
      status: (row.status as RagCollection['status']) ?? 'active',
      requiredRole: (row.required_role as string) ?? null,
      allowedUsers: row.allowed_users
        ? typeof row.allowed_users === 'string'
          ? (JSON.parse(row.allowed_users) as string[])
          : (row.allowed_users as string[])
        : null,
      complexityType: ((row.complexity_type as string) ||
        'basic') as RagComplexityType,
      createdBy: (row.created_by as string) ?? null,
      documentCount: (row.document_count as number) ?? 0,
      chunkCount: (row.chunk_count as number) ?? 0,
      totalTokens: (row.total_tokens as number) ?? 0,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  private toDocument(row: Record<string, unknown>): RagDocument {
    return {
      id: row.id as string,
      collectionId: row.collection_id as string,
      filename: row.filename as string,
      fileType: row.file_type as string,
      fileSize: row.file_size as number,
      fileHash: (row.file_hash as string) ?? null,
      storagePath: (row.storage_path as string) ?? null,
      content: (row.content as string) ?? null,
      status: (row.status as RagDocument['status']) ?? 'pending',
      errorMessage: (row.error_message as string) ?? null,
      chunkCount: (row.chunk_count as number) ?? 0,
      tokenCount: (row.token_count as number) ?? 0,
      metadata: row.metadata
        ? typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : (row.metadata as Record<string, unknown>)
        : {},
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
      processedAt: (row.processed_at as Date) ?? null,
    };
  }

  private toChunk(row: Record<string, unknown>): RagChunk {
    return {
      id: row.id as string,
      content: row.content as string,
      chunkIndex: row.chunk_index as number,
      tokenCount: (row.token_count as number) ?? 0,
      pageNumber: (row.page_number as number) ?? null,
      metadata: row.metadata
        ? typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : (row.metadata as Record<string, unknown>)
        : {},
    };
  }

  // ---------------------------------------------------------------------------
  // Collections
  // ---------------------------------------------------------------------------

  async getCollections(
    orgSlug: string,
    _userId?: string,
  ): Promise<RagCollection[]> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM rag_data.rag_collections
       WHERE organization_slug = $1
       ORDER BY created_at DESC`,
      [orgSlug],
    );
    return result.rows.map((r) => this.toCollection(r));
  }

  async getCollection(
    collectionId: string,
    orgSlug: string,
  ): Promise<RagCollection | null> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM rag_data.rag_collections
       WHERE id = $1 AND organization_slug = $2`,
      [collectionId, orgSlug],
    );
    if (result.rows.length === 0) return null;
    return this.toCollection(result.rows[0]!);
  }

  async getCollectionBySlug(
    slug: string,
    orgSlug: string,
  ): Promise<RagCollection | null> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM rag_data.rag_collections
       WHERE slug = $1 AND organization_slug = $2`,
      [slug, orgSlug],
    );
    if (result.rows.length === 0) return null;
    return this.toCollection(result.rows[0]!);
  }

  async createCollection(
    orgSlug: string,
    input: CreateCollectionInput,
  ): Promise<RagCollection> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `INSERT INTO rag_data.rag_collections
         (organization_slug, name, slug, description, embedding_model, embedding_dimensions,
          chunk_size, chunk_overlap, created_by, required_role, allowed_users, complexity_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
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
        input.allowedUsers ? JSON.stringify(input.allowedUsers) : null,
        input.complexityType || 'basic',
      ],
    );
    if (result.rows.length === 0)
      throw new Error('Failed to create collection');
    return this.toCollection(result.rows[0]!);
  }

  async updateCollection(
    collectionId: string,
    orgSlug: string,
    updates: UpdateCollectionInput,
  ): Promise<RagCollection | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.name !== null) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(updates.name);
    }
    if (updates.description !== null) {
      setClauses.push(`description = $${paramIdx++}`);
      params.push(updates.description);
    }
    if (updates.requiredRole !== null) {
      setClauses.push(`required_role = $${paramIdx++}`);
      params.push(updates.requiredRole);
    }
    if (updates.clearAllowedUsers) {
      setClauses.push(`allowed_users = NULL`);
    } else if (updates.allowedUsers !== null) {
      setClauses.push(`allowed_users = $${paramIdx++}`);
      params.push(JSON.stringify(updates.allowedUsers));
    }
    if (updates.complexityType !== null) {
      setClauses.push(`complexity_type = $${paramIdx++}`);
      params.push(updates.complexityType);
    }

    if (setClauses.length === 0) {
      return this.getCollection(collectionId, orgSlug);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(collectionId, orgSlug);

    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `UPDATE rag_data.rag_collections
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIdx++} AND organization_slug = $${paramIdx}
       RETURNING *`,
      params,
    );
    if (result.rows.length === 0) return null;
    return this.toCollection(result.rows[0]!);
  }

  async deleteCollection(
    collectionId: string,
    orgSlug: string,
  ): Promise<boolean> {
    const pool = this.getPool();
    await pool.query(
      `DELETE FROM rag_data.rag_collections
       WHERE id = $1 AND organization_slug = $2`,
      [collectionId, orgSlug],
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  async getDocuments(
    collectionId: string,
    orgSlug: string,
  ): Promise<RagDocument[]> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM rag_data.rag_documents
       WHERE collection_id = $1 AND organization_slug = $2
       ORDER BY created_at DESC`,
      [collectionId, orgSlug],
    );
    return result.rows.map((r) => this.toDocument(r));
  }

  async getDocument(
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocument | null> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM rag_data.rag_documents
       WHERE id = $1 AND organization_slug = $2`,
      [documentId, orgSlug],
    );
    if (result.rows.length === 0) return null;
    return this.toDocument(result.rows[0]!);
  }

  async getDocumentContent(
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocumentContent | null> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT id, filename, file_type, content, chunk_count
       FROM rag_data.rag_documents
       WHERE id = $1 AND organization_slug = $2`,
      [documentId, orgSlug],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0]!;
    return {
      id: row.id as string,
      filename: row.filename as string,
      fileType: row.file_type as string,
      content: (row.content as string) ?? null,
      chunkCount: (row.chunk_count as number) ?? 0,
    };
  }

  async insertDocument(
    collectionId: string,
    orgSlug: string,
    input: InsertDocumentInput,
  ): Promise<RagDocument> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `INSERT INTO rag_data.rag_documents
         (collection_id, organization_slug, filename, file_type, file_size,
          file_hash, storage_path, created_by, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
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
    if (result.rows.length === 0) throw new Error('Failed to insert document');
    return this.toDocument(result.rows[0]!);
  }

  async updateDocumentContent(
    documentId: string,
    orgSlug: string,
    content: string,
  ): Promise<void> {
    const pool = this.getPool();
    await pool.query(
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
    const setClauses = ['status = $1', 'updated_at = NOW()'];
    const params: unknown[] = [status];
    let paramIdx = 2;

    if (errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIdx++}`);
      params.push(errorMessage);
    }
    if (chunkCount !== undefined) {
      setClauses.push(`chunk_count = $${paramIdx++}`);
      params.push(chunkCount);
    }
    if (tokenCount !== undefined) {
      setClauses.push(`token_count = $${paramIdx++}`);
      params.push(tokenCount);
    }

    params.push(documentId, orgSlug);

    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `UPDATE rag_data.rag_documents
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIdx++} AND organization_slug = $${paramIdx}
       RETURNING *`,
      params,
    );
    if (result.rows.length === 0) return null;
    return this.toDocument(result.rows[0]!);
  }

  async deleteDocument(documentId: string, orgSlug: string): Promise<boolean> {
    const pool = this.getPool();
    await pool.query(
      `DELETE FROM rag_data.rag_documents
       WHERE id = $1 AND organization_slug = $2`,
      [documentId, orgSlug],
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Chunks
  // ---------------------------------------------------------------------------

  async getDocumentChunks(
    documentId: string,
    orgSlug: string,
  ): Promise<RagChunk[]> {
    const pool = this.getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT id, content, chunk_index, token_count, page_number, metadata
       FROM rag_data.rag_document_chunks
       WHERE document_id = $1 AND organization_slug = $2
       ORDER BY chunk_index ASC`,
      [documentId, orgSlug],
    );
    return result.rows.map((r) => this.toChunk(r));
  }

  async deleteDocumentChunks(
    documentId: string,
    organizationSlug: string,
  ): Promise<number> {
    const pool = this.getPool();
    const result = await pool.query<{ id: string }>(
      `DELETE FROM rag_data.rag_document_chunks
       WHERE document_id = $1 AND organization_slug = $2
       RETURNING id`,
      [documentId, organizationSlug],
    );
    return result.rows.length;
  }

  async insertChunks(
    documentId: string,
    orgSlug: string,
    chunks: ChunkInput[],
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    const doc = await this.getDocument(documentId, orgSlug);
    if (!doc)
      throw new Error(`Document ${documentId} not found for chunk insertion`);
    const collectionId = doc.collectionId;

    const pool = this.getPool();
    let inserted = 0;

    for (const chunk of chunks) {
      try {
        const embeddingLiteral = chunk.embedding
          ? `'[${chunk.embedding.join(',')}]'::vector`
          : 'NULL';

        await pool.query(
          `INSERT INTO rag_data.rag_document_chunks
             (document_id, collection_id, organization_slug, content, chunk_index,
              embedding, token_count, page_number, char_offset, metadata)
           VALUES ($1, $2, $3, $4, $5, ${embeddingLiteral}, $6, $7, $8, $9)`,
          [
            documentId,
            collectionId,
            orgSlug,
            chunk.content,
            chunk.chunkIndex,
            chunk.tokenCount ?? 0,
            chunk.pageNumber ?? null,
            chunk.charOffset ?? null,
            chunk.metadata ? JSON.stringify(chunk.metadata) : '{}',
          ],
        );
        inserted++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to insert chunk ${inserted}: ${message}`);
      }
    }

    return inserted;
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
    const pool = this.getPool();
    const embeddingLiteral = `'[${embedding.join(',')}]'::vector`;

    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         c.id,
         c.document_id,
         c.content,
         c.chunk_index,
         c.page_number,
         c.char_offset,
         c.metadata,
         d.filename,
         1 - (c.embedding <=> ${embeddingLiteral}) AS score
       FROM rag_data.rag_document_chunks c
       JOIN rag_data.rag_documents d ON d.id = c.document_id
       WHERE c.collection_id = $1
         AND c.organization_slug = $2
         AND c.embedding IS NOT NULL
         AND 1 - (c.embedding <=> ${embeddingLiteral}) >= $3
       ORDER BY score DESC
       LIMIT $4`,
      [collectionId, orgSlug, similarityThreshold, topK],
    );

    return result.rows.map((row) => ({
      chunkId: row.id as string,
      documentId: row.document_id as string,
      documentFilename: (row.filename as string) ?? 'unknown',
      content: row.content as string,
      score: parseFloat(String(row.score)),
      pageNumber: (row.page_number as number) ?? null,
      chunkIndex: row.chunk_index as number,
      charOffset: (row.char_offset as number) ?? null,
      metadata: row.metadata
        ? typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : (row.metadata as Record<string, unknown>)
        : {},
    }));
  }

  async keywordSearch(
    collectionId: string,
    orgSlug: string,
    query: string,
    topK: number,
  ): Promise<RagSearchResult[]> {
    const terms = query
      .split(/\s+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 2);

    if (terms.length === 0) return [];

    const pool = this.getPool();

    // Use PostgreSQL full text search
    const tsQuery = terms.map((t) => `${t}:*`).join(' | ');

    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         c.id,
         c.document_id,
         c.content,
         c.chunk_index,
         c.page_number,
         c.char_offset,
         c.metadata,
         d.filename,
         ts_rank(to_tsvector('english', c.content), to_tsquery('english', $3)) AS score
       FROM rag_data.rag_document_chunks c
       JOIN rag_data.rag_documents d ON d.id = c.document_id
       WHERE c.collection_id = $1
         AND c.organization_slug = $2
         AND to_tsvector('english', c.content) @@ to_tsquery('english', $3)
       ORDER BY score DESC
       LIMIT $4`,
      [collectionId, orgSlug, tsQuery, topK],
    );

    return result.rows.map((row) => ({
      chunkId: row.id as string,
      documentId: row.document_id as string,
      documentFilename: (row.filename as string) ?? 'unknown',
      content: row.content as string,
      score: parseFloat(String(row.score)),
      pageNumber: (row.page_number as number) ?? null,
      chunkIndex: row.chunk_index as number,
      charOffset: (row.char_offset as number) ?? null,
      metadata: row.metadata
        ? typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : (row.metadata as Record<string, unknown>)
        : {},
    }));
  }

  // ---------------------------------------------------------------------------
  // Infrastructure
  // ---------------------------------------------------------------------------

  isAvailable(): boolean {
    return true;
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const pool = this.getPool();
      await pool.query('SELECT 1 AS ok');
      return { status: 'ok', message: 'PostgreSQL RAG storage healthy' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', message };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolveConnectionString(): string {
    const ragUrl = this.configService.get<string>('RAG_POSTGRESQL_URL');
    if (ragUrl) return ragUrl;
    const pgUrl = this.configService.get<string>('POSTGRESQL_URL');
    if (pgUrl) return pgUrl;
    throw new Error(
      'PostgreSQL RAG storage requires RAG_POSTGRESQL_URL or POSTGRESQL_URL environment variable',
    );
  }

  private getPool(): Pool {
    if (this.pool) return this.pool;

    const connectionString = this.resolveConnectionString();
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    return this.pool;
  }
}
