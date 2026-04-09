import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

type DbError = { message: string } | null;

export type RagComplexityType =
  | 'basic'
  | 'attributed'
  | 'hybrid'
  | 'cross-reference'
  | 'temporal';

export interface RagCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  orgSlug: string;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  complexityType: RagComplexityType;
  status: string;
  requiredRole: string | null;
  allowedUsers: string[] | null;
  documentCount: number;
  chunkCount: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface RagCollectionsResponse {
  collections: RagCollection[];
}

export interface CreateRagCollectionDto {
  name: string;
  description?: string;
  orgSlug: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  complexityType?: RagComplexityType;
  requiredRole?: string | null;
  allowedUsers?: string[] | null;
  privateToCreator?: boolean;
}

export interface UpdateRagCollectionDto {
  name?: string;
  description?: string;
  requiredRole?: string | null;
  allowedUsers?: string[] | null;
  clearAllowedUsers?: boolean;
  complexityType?: RagComplexityType;
}

export interface RagDocument {
  id: string;
  collectionId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  errorMessage: string | null;
  chunkCount: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RagDocumentsResponse {
  collectionId: string;
  documents: RagDocument[];
}

export interface RagChunk {
  id: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  pageNumber: number | null;
  metadata: Record<string, unknown> | null;
}

interface RagCollectionRow {
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
  document_count: number;
  chunk_count: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  complexity_type: string;
}

interface RagDocumentRow {
  id: string;
  collection_id: string;
  organization_slug: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  error_message: string | null;
  chunk_count: number;
  token_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  content: string;
}

interface RagChunkRow {
  id: string;
  content: string;
  chunk_index: number;
  token_count: number;
  page_number: number | null;
  metadata: Record<string, unknown> | null;
}

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  'nomic-embed-text': 768,
  'text-embedding-005': 768,
  'text-embedding-004': 768,
  'text-multilingual-embedding-002': 768,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
};

function getEmbeddingDimensions(model: string): number {
  return EMBEDDING_DIMENSIONS[model] ?? 768;
}

function mapRowToCollection(row: RagCollectionRow): RagCollection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    orgSlug: row.organization_slug,
    embeddingModel: row.embedding_model,
    embeddingDimensions: row.embedding_dimensions,
    chunkSize: row.chunk_size,
    chunkOverlap: row.chunk_overlap,
    complexityType: (row.complexity_type as RagComplexityType) ?? 'basic',
    status: row.status,
    requiredRole: row.required_role,
    allowedUsers: row.allowed_users,
    documentCount: row.document_count ?? 0,
    chunkCount: row.chunk_count ?? 0,
    totalTokens: row.total_tokens ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function mapRowToDocument(row: RagDocumentRow): RagDocument {
  return {
    id: row.id,
    collectionId: row.collection_id,
    filename: row.filename,
    contentType: row.file_type,
    sizeBytes: row.file_size ?? 0,
    status: row.status,
    errorMessage: row.error_message,
    chunkCount: row.chunk_count ?? 0,
    tokenCount: row.token_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * RagManagementService — full CRUD for RAG collections and documents.
 *
 * No fallbacks: database errors are propagated as thrown exceptions.
 */
@Injectable()
export class RagManagementService {
  private readonly logger = new Logger(RagManagementService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async listCollections(orgSlug?: string): Promise<RagCollectionsResponse> {
    this.logger.log(
      `[RagManagement] Fetching RAG collections${orgSlug ? ` for org: ${orgSlug}` : ''}`,
    );

    let query = this.db.from('rag_data', 'rag_collections').select('*');

    if (orgSlug) {
      query = query.eq('organization_slug', orgSlug);
    }

    const listResult: { data: RagCollectionRow[] | null; error: DbError } =
      await query.order('created_at', { ascending: false });

    if (listResult.error) {
      throw new Error(
        `Failed to fetch RAG collections: ${listResult.error.message}`,
      );
    }

    const rows = listResult.data ?? [];
    return { collections: rows.map(mapRowToCollection) };
  }

  async getCollection(
    collectionId: string,
    orgSlug?: string,
  ): Promise<RagCollection> {
    this.logger.log(
      `[RagManagement] Fetching RAG collection ${collectionId}${orgSlug ? ` for org: ${orgSlug}` : ''}`,
    );

    let query = this.db
      .from('rag_data', 'rag_collections')
      .select('*')
      .eq('id', collectionId);

    if (orgSlug) {
      query = query.eq('organization_slug', orgSlug);
    }

    const getResult: { data: RagCollectionRow | null; error: DbError } =
      await query.single();

    if (getResult.error) {
      throw new Error(
        `Failed to fetch RAG collection: ${getResult.error.message}`,
      );
    }

    return mapRowToCollection(getResult.data as RagCollectionRow);
  }

  async createCollection(dto: CreateRagCollectionDto): Promise<RagCollection> {
    this.logger.log(
      `[RagManagement] Creating RAG collection "${dto.name}" for org: ${dto.orgSlug}`,
    );

    const slug = dto.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const embeddingModel = dto.embeddingModel ?? 'nomic-embed-text';
    const embeddingDimensions = getEmbeddingDimensions(embeddingModel);

    const createResult: { data: RagCollectionRow | null; error: DbError } =
      await this.db
        .from('rag_data', 'rag_collections')
        .insert({
          name: dto.name,
          slug,
          description: dto.description ?? null,
          organization_slug: dto.orgSlug,
          embedding_model: embeddingModel,
          embedding_dimensions: embeddingDimensions,
          chunk_size: dto.chunkSize ?? 1000,
          chunk_overlap: dto.chunkOverlap ?? 200,
          complexity_type: dto.complexityType ?? 'basic',
          required_role: dto.requiredRole ?? null,
          allowed_users: dto.allowedUsers ?? null,
        })
        .select('*')
        .single();

    if (createResult.error) {
      throw new Error(
        `Failed to create RAG collection: ${createResult.error.message}`,
      );
    }

    return mapRowToCollection(createResult.data as RagCollectionRow);
  }

  async updateCollection(
    id: string,
    dto: UpdateRagCollectionDto,
  ): Promise<RagCollection> {
    this.logger.log(`[RagManagement] Updating RAG collection ${id}`);

    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      updates['name'] = dto.name;
    }
    if (dto.description !== undefined) {
      updates['description'] = dto.description;
    }
    if (dto.requiredRole !== undefined) {
      updates['required_role'] = dto.requiredRole;
    }
    if (dto.clearAllowedUsers === true) {
      updates['allowed_users'] = null;
    } else if (dto.allowedUsers !== undefined) {
      updates['allowed_users'] = dto.allowedUsers;
    }
    if (dto.complexityType !== undefined) {
      updates['complexity_type'] = dto.complexityType;
    }

    const updateResult: { data: RagCollectionRow | null; error: DbError } =
      await this.db
        .from('rag_data', 'rag_collections')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

    if (updateResult.error) {
      throw new Error(
        `Failed to update RAG collection: ${updateResult.error.message}`,
      );
    }

    return mapRowToCollection(updateResult.data as RagCollectionRow);
  }

  async deleteCollection(id: string): Promise<void> {
    this.logger.log(`[RagManagement] Deleting RAG collection ${id}`);

    const deleteResult: { data: null; error: DbError } = await this.db
      .from('rag_data', 'rag_collections')
      .delete()
      .eq('id', id);

    if (deleteResult.error) {
      throw new Error(
        `Failed to delete RAG collection: ${deleteResult.error.message}`,
      );
    }
  }

  async listDocuments(collectionId: string): Promise<RagDocumentsResponse> {
    this.logger.log(
      `[RagManagement] Fetching documents for collection ${collectionId}`,
    );

    const listResult: { data: RagDocumentRow[] | null; error: DbError } =
      await this.db
        .from('rag_data', 'rag_documents')
        .select('*')
        .eq('collection_id', collectionId)
        .order('created_at', { ascending: false });

    if (listResult.error) {
      throw new Error(
        `Failed to fetch RAG documents: ${listResult.error.message}`,
      );
    }

    const rows = listResult.data ?? [];
    return {
      collectionId,
      documents: rows.map(mapRowToDocument),
    };
  }

  async uploadDocument(
    collectionId: string,
    orgSlug: string,
    filename: string,
    fileType: string,
    fileSize: number,
  ): Promise<RagDocument> {
    this.logger.log(
      `[RagManagement] Creating document record for "${filename}" in collection ${collectionId}`,
    );

    const uploadResult: { data: RagDocumentRow | null; error: DbError } =
      await this.db
        .from('rag_data', 'rag_documents')
        .insert({
          collection_id: collectionId,
          organization_slug: orgSlug,
          filename,
          file_type: fileType,
          file_size: fileSize,
          status: 'pending',
        })
        .select('*')
        .single();

    if (uploadResult.error) {
      throw new Error(
        `Failed to create document record: ${uploadResult.error.message}`,
      );
    }

    return mapRowToDocument(uploadResult.data as RagDocumentRow);
  }

  async deleteDocument(
    collectionId: string,
    documentId: string,
  ): Promise<void> {
    this.logger.log(
      `[RagManagement] Deleting document ${documentId} from collection ${collectionId}`,
    );

    const deleteDocResult: { data: null; error: DbError } = await this.db
      .from('rag_data', 'rag_documents')
      .delete()
      .eq('id', documentId)
      .eq('collection_id', collectionId);

    if (deleteDocResult.error) {
      throw new Error(
        `Failed to delete document: ${deleteDocResult.error.message}`,
      );
    }
  }

  async updateDocumentStatus(
    documentId: string,
    orgSlug: string,
    status: string,
    errorMessage?: string,
    chunkCount?: number,
    tokenCount?: number,
  ): Promise<void> {
    this.logger.log(
      `[RagManagement] Updating document ${documentId} status to "${status}"`,
    );

    const updates: Record<string, unknown> = { status };

    if (errorMessage !== undefined) {
      updates['error_message'] = errorMessage;
    }
    if (chunkCount !== undefined) {
      updates['chunk_count'] = chunkCount;
    }
    if (tokenCount !== undefined) {
      updates['token_count'] = tokenCount;
    }

    const updateStatusResult: { data: null; error: DbError } = await this.db
      .from('rag_data', 'rag_documents')
      .update(updates)
      .eq('id', documentId)
      .eq('organization_slug', orgSlug);

    if (updateStatusResult.error) {
      throw new Error(
        `Failed to update document status: ${updateStatusResult.error.message}`,
      );
    }
  }

  async updateDocumentContent(
    documentId: string,
    orgSlug: string,
    content: string,
  ): Promise<void> {
    this.logger.log(
      `[RagManagement] Storing extracted content for document ${documentId}`,
    );

    const updateContentResult: { data: null; error: DbError } = await this.db
      .from('rag_data', 'rag_documents')
      .update({ content })
      .eq('id', documentId)
      .eq('organization_slug', orgSlug);

    if (updateContentResult.error) {
      throw new Error(
        `Failed to update document content: ${updateContentResult.error.message}`,
      );
    }
  }

  async insertChunks(
    documentId: string,
    orgSlug: string,
    chunks: Array<{
      content: string;
      chunkIndex: number;
      embedding: number[];
      tokenCount: number;
      pageNumber?: number;
      charOffset?: number;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<number> {
    this.logger.log(
      `[RagManagement] Inserting ${chunks.length} chunks for document ${documentId}`,
    );

    // Look up the collection_id from the document
    const docLookupResult: {
      data: { collection_id: string } | null;
      error: DbError;
    } = await this.db
      .from('rag_data', 'rag_documents')
      .select('collection_id')
      .eq('id', documentId)
      .single();

    if (docLookupResult.error) {
      throw new Error(
        `Failed to look up document for chunk insertion: ${docLookupResult.error.message}`,
      );
    }

    const collectionId = (docLookupResult.data as { collection_id: string })
      .collection_id;

    const rows = chunks.map((chunk) => ({
      document_id: documentId,
      collection_id: collectionId,
      organization_slug: orgSlug,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      embedding: chunk.embedding,
      token_count: chunk.tokenCount,
      page_number: chunk.pageNumber ?? null,
      char_offset: chunk.charOffset ?? null,
      metadata: chunk.metadata ?? null,
    }));

    const insertChunksResult: {
      data: Array<{ id: string }> | null;
      error: DbError;
    } = await this.db
      .from('rag_data', 'rag_document_chunks')
      .insert(rows)
      .select('id');

    if (insertChunksResult.error) {
      throw new Error(
        `Failed to insert chunks: ${insertChunksResult.error.message}`,
      );
    }

    return (insertChunksResult.data ?? []).length;
  }

  async getDocumentChunks(
    collectionId: string,
    documentId: string,
  ): Promise<RagChunk[]> {
    this.logger.log(
      `[RagManagement] Fetching chunks for document ${documentId} in collection ${collectionId}`,
    );

    const chunksResult: { data: RagChunkRow[] | null; error: DbError } =
      await this.db
        .from('rag_data', 'rag_document_chunks')
        .select('id, content, chunk_index, token_count, page_number, metadata')
        .eq('document_id', documentId)
        .eq('collection_id', collectionId)
        .order('chunk_index', { ascending: true });

    if (chunksResult.error) {
      throw new Error(
        `Failed to fetch document chunks: ${chunksResult.error.message}`,
      );
    }

    const rows = chunksResult.data ?? [];
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      chunkIndex: row.chunk_index,
      tokenCount: row.token_count,
      pageNumber: row.page_number,
      metadata: row.metadata,
    }));
  }
}
