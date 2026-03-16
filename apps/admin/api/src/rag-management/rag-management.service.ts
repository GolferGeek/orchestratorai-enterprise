import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

export interface RagCollection {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
  orgSlug: string;
}

export interface RagCollectionsResponse {
  collections: RagCollection[];
}

export interface CreateRagCollectionDto {
  name: string;
  description: string;
  orgSlug: string;
}

export interface RagDocument {
  id: string;
  collectionId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RagDocumentsResponse {
  collectionId: string;
  documents: RagDocument[];
}

interface RagCollectionRow {
  id: string;
  organization_slug: string;
  name: string;
  slug: string;
  description: string;
  embedding_model: string;
  embedding_dimensions: number;
  chunk_size: number;
  chunk_overlap: number;
  status: string;
  document_count: number;
  chunk_count: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
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

function mapRowToCollection(row: RagCollectionRow): RagCollection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    documentCount: row.document_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orgSlug: row.organization_slug,
  };
}

function mapRowToDocument(row: RagDocumentRow): RagDocument {
  return {
    id: row.id,
    collectionId: row.collection_id,
    filename: row.filename,
    contentType: row.file_type,
    sizeBytes: row.file_size ?? 0,
    createdAt: row.created_at,
  };
}

/**
 * RagManagementService — queries RAG collections and documents directly from the database.
 *
 * No fallbacks: database errors are propagated.
 */
@Injectable()
export class RagManagementService {
  private readonly logger = new Logger(RagManagementService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async listCollections(): Promise<RagCollectionsResponse> {
    this.logger.log('[RagManagement] Fetching RAG collections from database');

    const { data, error } = await this.db
      .from('rag_data', 'rag_collections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch RAG collections: ${error.message}`);
    }

    const rows = (data ?? []) as RagCollectionRow[];
    return { collections: rows.map(mapRowToCollection) };
  }

  async createCollection(dto: CreateRagCollectionDto): Promise<RagCollection> {
    this.logger.log(
      `[RagManagement] Creating RAG collection "${dto.name}" in database`,
    );

    const slug = dto.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const { data, error } = await this.db
      .from('rag_data', 'rag_collections')
      .insert({
        name: dto.name,
        description: dto.description,
        organization_slug: dto.orgSlug,
        slug,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create RAG collection: ${error.message}`);
    }

    return mapRowToCollection(data as RagCollectionRow);
  }

  async deleteCollection(id: string): Promise<void> {
    this.logger.log(
      `[RagManagement] Deleting RAG collection ${id} from database`,
    );

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
      `[RagManagement] Fetching documents for collection ${collectionId} from database`,
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
}
