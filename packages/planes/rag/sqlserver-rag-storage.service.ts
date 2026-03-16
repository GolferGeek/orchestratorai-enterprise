import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mssql from 'mssql';
import { DatabaseService } from '@/database';
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
 * SQL Server RAG storage implementation.
 *
 * Uses DATABASE_SERVICE (QueryBuilder) for CRUD operations and
 * native VECTOR_DISTANCE('cosine', ...) for server-side vector search.
 *
 * Embeddings are stored as NVARCHAR(MAX) JSON and dynamically CAST to
 * VECTOR(N) at query time, where N = the collection's embeddingDimensions.
 * This allows different collections to use different embedding models/dimensions.
 */
@Injectable()
export class SqlServerRagStorageService implements RagStorageService {
  private readonly logger = new Logger(SqlServerRagStorageService.name);
  private pool: mssql.ConnectionPool | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

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
    const { data, error } = (await this.db
      .from('rag_data', 'rag_collections')
      .select('*')
      .eq('organization_slug', orgSlug)
      .order('created_at', { ascending: false })) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`getCollections: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((r) =>
      this.toCollection(r),
    );
  }

  async getCollection(
    collectionId: string,
    orgSlug: string,
  ): Promise<RagCollection | null> {
    const { data, error } = (await this.db
      .from('rag_data', 'rag_collections')
      .select('*')
      .eq('id', collectionId)
      .eq('organization_slug', orgSlug)
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`getCollection: ${error.message}`);
    }
    return data ? this.toCollection(data as Record<string, unknown>) : null;
  }

  async getCollectionBySlug(
    slug: string,
    orgSlug: string,
  ): Promise<RagCollection | null> {
    const { data, error } = (await this.db
      .from('rag_data', 'rag_collections')
      .select('*')
      .eq('slug', slug)
      .eq('organization_slug', orgSlug)
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`getCollectionBySlug: ${error.message}`);
    }
    return data ? this.toCollection(data as Record<string, unknown>) : null;
  }

  async createCollection(
    orgSlug: string,
    input: CreateCollectionInput,
  ): Promise<RagCollection> {
    const { data, error } = (await this.db
      .from('rag_data', 'rag_collections')
      .insert({
        organization_slug: orgSlug,
        name: input.name,
        slug: input.slug,
        description: input.description,
        embedding_model: input.embeddingModel,
        embedding_dimensions: input.embeddingDimensions,
        chunk_size: input.chunkSize,
        chunk_overlap: input.chunkOverlap,
        created_by: input.createdBy,
        required_role: input.requiredRole,
        allowed_users: input.allowedUsers
          ? JSON.stringify(input.allowedUsers)
          : null,
        complexity_type: input.complexityType || 'basic',
      })
      .select('*')
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`createCollection: ${error.message}`);
    if (!data) throw new Error('Failed to create collection');
    return this.toCollection(data as Record<string, unknown>);
  }

  async updateCollection(
    collectionId: string,
    orgSlug: string,
    updates: UpdateCollectionInput,
  ): Promise<RagCollection | null> {
    const updateData: Record<string, unknown> = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.description) updateData.description = updates.description;
    if (updates.requiredRole) updateData.required_role = updates.requiredRole;
    if (updates.clearAllowedUsers) {
      updateData.allowed_users = null;
    } else if (updates.allowedUsers) {
      updateData.allowed_users = JSON.stringify(updates.allowedUsers);
    }
    if (updates.complexityType)
      updateData.complexity_type = updates.complexityType;

    if (Object.keys(updateData).length === 0) {
      return this.getCollection(collectionId, orgSlug);
    }

    const { data, error } = (await this.db
      .from('rag_data', 'rag_collections')
      .update(updateData)
      .eq('id', collectionId)
      .eq('organization_slug', orgSlug)
      .select('*')
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`updateCollection: ${error.message}`);
    return data ? this.toCollection(data as Record<string, unknown>) : null;
  }

  async deleteCollection(
    collectionId: string,
    orgSlug: string,
  ): Promise<boolean> {
    const { error } = (await this.db
      .from('rag_data', 'rag_collections')
      .delete()
      .eq('id', collectionId)
      .eq('organization_slug', orgSlug)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`deleteCollection: ${error.message}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  async getDocuments(
    collectionId: string,
    orgSlug: string,
  ): Promise<RagDocument[]> {
    const { data, error } = (await this.db
      .from('rag_data', 'rag_documents')
      .select('*')
      .eq('collection_id', collectionId)
      .eq('organization_slug', orgSlug)
      .order('created_at', { ascending: false })) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`getDocuments: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((r) =>
      this.toDocument(r),
    );
  }

  async getDocument(
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocument | null> {
    const { data, error } = (await this.db
      .from('rag_data', 'rag_documents')
      .select('*')
      .eq('id', documentId)
      .eq('organization_slug', orgSlug)
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`getDocument: ${error.message}`);
    }
    return data ? this.toDocument(data as Record<string, unknown>) : null;
  }

  async getDocumentContent(
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocumentContent | null> {
    const { data, error } = (await this.db
      .from('rag_data', 'rag_documents')
      .select('id,filename,file_type,content,chunk_count')
      .eq('id', documentId)
      .eq('organization_slug', orgSlug)
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`getDocumentContent: ${error.message}`);
    }
    if (!data) return null;

    const row = data as Record<string, unknown>;
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
    const { data, error } = (await this.db
      .from('rag_data', 'rag_documents')
      .insert({
        collection_id: collectionId,
        organization_slug: orgSlug,
        filename: input.filename,
        file_type: input.fileType,
        file_size: input.fileSize,
        file_hash: input.fileHash,
        storage_path: input.storagePath,
        created_by: input.createdBy,
        content: input.content,
      })
      .select('*')
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`insertDocument: ${error.message}`);
    if (!data) throw new Error('Failed to insert document');
    return this.toDocument(data as Record<string, unknown>);
  }

  async updateDocumentContent(
    documentId: string,
    orgSlug: string,
    content: string,
  ): Promise<void> {
    const { error } = (await this.db
      .from('rag_data', 'rag_documents')
      .update({ content, updated_at: new Date() })
      .eq('id', documentId)
      .eq('organization_slug', orgSlug)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`updateDocumentContent: ${error.message}`);
  }

  async updateDocumentStatus(
    documentId: string,
    orgSlug: string,
    status: string,
    errorMessage?: string,
    chunkCount?: number,
    tokenCount?: number,
  ): Promise<RagDocument | null> {
    const updateData: Record<string, unknown> = { status };
    if (errorMessage !== undefined) updateData.error_message = errorMessage;
    if (chunkCount !== undefined) updateData.chunk_count = chunkCount;
    if (tokenCount !== undefined) updateData.token_count = tokenCount;

    const { data, error } = (await this.db
      .from('rag_data', 'rag_documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('organization_slug', orgSlug)
      .select('*')
      .single()) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`updateDocumentStatus: ${error.message}`);
    return data ? this.toDocument(data as Record<string, unknown>) : null;
  }

  async deleteDocument(documentId: string, orgSlug: string): Promise<boolean> {
    const { error } = (await this.db
      .from('rag_data', 'rag_documents')
      .delete()
      .eq('id', documentId)
      .eq('organization_slug', orgSlug)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`deleteDocument: ${error.message}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Chunks
  // ---------------------------------------------------------------------------

  async getDocumentChunks(
    documentId: string,
    orgSlug: string,
  ): Promise<RagChunk[]> {
    const { data, error } = (await this.db
      .from('rag_data', 'rag_document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .eq('organization_slug', orgSlug)
      .order('chunk_index', { ascending: true })) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`getDocumentChunks: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((r) =>
      this.toChunk(r),
    );
  }

  async insertChunks(
    documentId: string,
    orgSlug: string,
    chunks: ChunkInput[],
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    // Look up collection_id from the document
    const doc = await this.getDocument(documentId, orgSlug);
    if (!doc)
      throw new Error(`Document ${documentId} not found for chunk insertion`);
    const collectionId = doc.collectionId;

    // Store embeddings as NVARCHAR JSON only — dimension-agnostic.
    // VECTOR_DISTANCE at query time uses dynamic CAST to the collection's embeddingDimensions.
    const pool = await this.getMssqlPool();
    let inserted = 0;
    for (const chunk of chunks) {
      try {
        const embeddingJson = chunk.embedding
          ? JSON.stringify(chunk.embedding)
          : null;
        const request = pool.request();
        request.input('document_id', mssql.UniqueIdentifier, documentId);
        request.input('collection_id', mssql.UniqueIdentifier, collectionId);
        request.input('organization_slug', mssql.NVarChar(255), orgSlug);
        request.input('content', mssql.NVarChar(mssql.MAX), chunk.content);
        request.input('chunk_index', mssql.Int, chunk.chunkIndex);
        request.input('embedding', mssql.NVarChar(mssql.MAX), embeddingJson);
        request.input('token_count', mssql.Int, chunk.tokenCount ?? 0);
        request.input('page_number', mssql.Int, chunk.pageNumber ?? null);
        request.input('char_offset', mssql.Int, chunk.charOffset ?? null);
        request.input(
          'metadata',
          mssql.NVarChar(mssql.MAX),
          chunk.metadata ? JSON.stringify(chunk.metadata) : '{}',
        );

        await request.query(`
          INSERT INTO rag_data.rag_document_chunks
            (document_id, collection_id, organization_slug, content, chunk_index,
             embedding, token_count, page_number, char_offset, metadata)
          VALUES
            (@document_id, @collection_id, @organization_slug, @content, @chunk_index,
             @embedding, @token_count, @page_number, @char_offset, @metadata)
        `);
        inserted++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to insert chunk ${inserted}: ${message}`);
      }
    }

    // Update collection stats (document_count, chunk_count, total_tokens)
    if (inserted > 0) {
      const totalTokens = chunks.reduce(
        (sum, c) => sum + (c.tokenCount ?? 0),
        0,
      );
      try {
        const statsRequest = pool.request();
        statsRequest.input(
          'collectionId',
          mssql.UniqueIdentifier,
          collectionId,
        );
        statsRequest.input('chunkCount', mssql.Int, inserted);
        statsRequest.input('totalTokens', mssql.Int, totalTokens);
        await statsRequest.query(`
          UPDATE rag_data.rag_collections
          SET chunk_count = chunk_count + @chunkCount,
              document_count = document_count + 1,
              total_tokens = total_tokens + @totalTokens,
              updated_at = GETDATE()
          WHERE id = @collectionId
        `);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to update collection stats for ${collectionId}: ${message}`,
        );
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
    const embeddingDim = embedding.length;
    this.logger.log(
      `vectorSearch: collectionId=${collectionId}, org=${orgSlug}, topK=${topK}, threshold=${similarityThreshold}, embeddingDim=${embeddingDim}`,
    );

    // Use NVARCHAR embedding column with dynamic CAST to VECTOR(N).
    // The dimension N comes from the actual query embedding length, which
    // must match the stored embeddings (both determined by the collection's model).
    const pool = await this.getMssqlPool();
    const queryVecJson = JSON.stringify(embedding);

    const request = pool.request();
    request.input('collectionId', mssql.UniqueIdentifier, collectionId);
    request.input('orgSlug', mssql.NVarChar(255), orgSlug);
    request.input('queryVec', mssql.NVarChar(mssql.MAX), queryVecJson);
    request.input('topK', mssql.Int, topK);
    request.input('threshold', mssql.Float, similarityThreshold);

    // Dynamic CAST — both stored embedding (NVARCHAR JSON) and query vector
    // are cast to VECTOR(N) where N = the query embedding's actual dimension.
    const result = await request.query(`
      SELECT TOP(@topK)
        c.id, c.document_id, c.content, c.chunk_index,
        c.page_number, c.char_offset, c.metadata, d.filename,
        1 - VECTOR_DISTANCE('cosine', CAST(c.embedding AS VECTOR(${embeddingDim})), CAST(@queryVec AS VECTOR(${embeddingDim}))) AS score
      FROM rag_data.rag_document_chunks c
      JOIN rag_data.rag_documents d ON d.id = c.document_id
      WHERE c.collection_id = @collectionId
        AND c.organization_slug = @orgSlug
        AND c.embedding IS NOT NULL
        AND (1 - VECTOR_DISTANCE('cosine', CAST(c.embedding AS VECTOR(${embeddingDim})), CAST(@queryVec AS VECTOR(${embeddingDim})))) >= @threshold
      ORDER BY score DESC
    `);

    const rows = result.recordset as Record<string, unknown>[];
    this.logger.log(`vectorSearch returned ${rows.length} results`);

    return rows.map((row) => ({
      chunkId: row.id as string,
      documentId: row.document_id as string,
      documentFilename: (row.filename as string) ?? 'unknown',
      content: row.content as string,
      score: row.score as number,
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

    // Fetch chunks for this collection
    const { data, error } = (await this.db
      .from('rag_data', 'rag_document_chunks')
      .select(
        'id,document_id,content,chunk_index,page_number,char_offset,metadata',
      )
      .eq('collection_id', collectionId)
      .eq('organization_slug', orgSlug)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) throw new Error(`keywordSearch: ${error.message}`);

    const chunks = (data ?? []) as Record<string, unknown>[];

    // Fetch document filenames
    const { data: docs } = (await this.db
      .from('rag_data', 'rag_documents')
      .select('id,filename')
      .eq('collection_id', collectionId)
      .eq('organization_slug', orgSlug)) as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    };
    const docMap = new Map<string, string>();
    for (const d of (docs ?? []) as Array<{ id: string; filename: string }>) {
      docMap.set(d.id, d.filename);
    }

    // Score each chunk by term matching
    const scored: Array<{ chunk: Record<string, unknown>; score: number }> = [];
    for (const chunk of chunks) {
      const content = ((chunk.content as string) ?? '').toLowerCase();
      let matchCount = 0;
      for (const term of terms) {
        if (content.includes(term)) matchCount++;
      }
      if (matchCount > 0) {
        scored.push({ chunk, score: matchCount / terms.length });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);

    return topResults.map(({ chunk, score }) => ({
      chunkId: chunk.id as string,
      documentId: chunk.document_id as string,
      documentFilename: docMap.get(chunk.document_id as string) ?? 'unknown',
      content: chunk.content as string,
      score,
      pageNumber: (chunk.page_number as number) ?? null,
      chunkIndex: chunk.chunk_index as number,
      charOffset: (chunk.char_offset as number) ?? null,
      metadata: chunk.metadata
        ? typeof chunk.metadata === 'string'
          ? (JSON.parse(chunk.metadata) as Record<string, unknown>)
          : (chunk.metadata as Record<string, unknown>)
        : {},
    }));
  }

  // ---------------------------------------------------------------------------
  // Infrastructure
  // ---------------------------------------------------------------------------

  isAvailable(): boolean {
    return !!this.db;
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    return this.db.checkConnection();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lazily creates a raw mssql ConnectionPool for queries that need
   * native SQL features (VECTOR_DISTANCE, CAST to VECTOR) not supported
   * by the QueryBuilder abstraction.
   */
  private async getMssqlPool(): Promise<mssql.ConnectionPool> {
    if (this.pool?.connected) {
      return this.pool;
    }

    const host = this.configService.getOrThrow<string>('SQLSERVER_HOST');
    const port = parseInt(
      this.configService.getOrThrow<string>('SQLSERVER_PORT'),
      10,
    );
    const database =
      this.configService.getOrThrow<string>('SQLSERVER_DATABASE');
    const user = this.configService.getOrThrow<string>('SQLSERVER_USER');
    const password =
      this.configService.getOrThrow<string>('SQLSERVER_PASSWORD');
    const encrypt =
      this.configService.get<string>('SQLSERVER_ENCRYPT', 'true') === 'true';
    const trustServerCertificate =
      this.configService.get<string>('SQLSERVER_TRUST_SERVER_CERT', 'false') ===
      'true';

    this.pool = await new mssql.ConnectionPool({
      server: host,
      port,
      database,
      user,
      password,
      options: { encrypt, trustServerCertificate },
    }).connect();

    return this.pool;
  }
}
