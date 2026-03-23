import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

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

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      throw new Error(`Failed to fetch RAG collections: ${error.message}`);
    }

    const rows = (data ?? []) as RagCollectionRow[];
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

    const { data, error } = await query.single();

    if (error) {
      throw new Error(`Failed to fetch RAG collection: ${error.message}`);
    }

    return mapRowToCollection(data as RagCollectionRow);
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

    const { data, error } = await this.db
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

    if (error) {
      throw new Error(`Failed to create RAG collection: ${error.message}`);
    }

    return mapRowToCollection(data as RagCollectionRow);
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

    const { data, error } = await this.db
      .from('rag_data', 'rag_collections')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update RAG collection: ${error.message}`);
    }

    return mapRowToCollection(data as RagCollectionRow);
  }

  async deleteCollection(id: string): Promise<void> {
    this.logger.log(`[RagManagement] Deleting RAG collection ${id}`);

    const { error } = await this.db
      .from('rag_data', 'rag_collections')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete RAG collection: ${error.message}`);
    }
  }

  async listDocuments(collectionId: string): Promise<RagDocumentsResponse> {
    this.logger.log(
      `[RagManagement] Fetching documents for collection ${collectionId}`,
    );

    const { data, error } = await this.db
      .from('rag_data', 'rag_documents')
      .select('*')
      .eq('collection_id', collectionId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch RAG documents: ${error.message}`);
    }

    const rows = (data ?? []) as RagDocumentRow[];
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

    const { data, error } = await this.db
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

    if (error) {
      throw new Error(`Failed to create document record: ${error.message}`);
    }

    return mapRowToDocument(data as RagDocumentRow);
  }

  async deleteDocument(
    collectionId: string,
    documentId: string,
  ): Promise<void> {
    this.logger.log(
      `[RagManagement] Deleting document ${documentId} from collection ${collectionId}`,
    );

    const { error } = await this.db
      .from('rag_data', 'rag_documents')
      .delete()
      .eq('id', documentId)
      .eq('collection_id', collectionId);

    if (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
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

    const { error } = await this.db
      .from('rag_data', 'rag_documents')
      .update(updates)
      .eq('id', documentId)
      .eq('organization_slug', orgSlug);

    if (error) {
      throw new Error(`Failed to update document status: ${error.message}`);
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

    const { error } = await this.db
      .from('rag_data', 'rag_documents')
      .update({ content })
      .eq('id', documentId)
      .eq('organization_slug', orgSlug);

    if (error) {
      throw new Error(`Failed to update document content: ${error.message}`);
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
    const { data: docData, error: docError } = await this.db
      .from('rag_data', 'rag_documents')
      .select('collection_id')
      .eq('id', documentId)
      .single();

    if (docError) {
      throw new Error(
        `Failed to look up document for chunk insertion: ${docError.message}`,
      );
    }

    const collectionId = (docData as { collection_id: string }).collection_id;

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

    const { data, error } = await this.db
      .from('rag_data', 'rag_document_chunks')
      .insert(rows)
      .select('id');

    if (error) {
      throw new Error(`Failed to insert chunks: ${error.message}`);
    }

    return (data as Array<{ id: string }>).length;
  }

  async getDocumentChunks(
    collectionId: string,
    documentId: string,
  ): Promise<RagChunk[]> {
    this.logger.log(
      `[RagManagement] Fetching chunks for document ${documentId} in collection ${collectionId}`,
    );

    const { data, error } = await this.db
      .from('rag_data', 'rag_document_chunks')
      .select('id, content, chunk_index, token_count, page_number, metadata')
      .eq('document_id', documentId)
      .eq('collection_id', collectionId)
      .order('chunk_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch document chunks: ${error.message}`);
    }

    const rows = (data ?? []) as RagChunkRow[];
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
