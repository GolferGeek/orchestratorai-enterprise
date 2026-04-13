/**
 * RAG Storage Provider Interface
 *
 * The 6th provider plane: RAG_PROVIDER selects the implementation at deploy time.
 * Each provider handles vector storage, CRUD, and search for RAG collections.
 *
 * Env var: RAG_PROVIDER=supabase_pg | sqlserver
 * Defaults to DB_PROVIDER if not set (zero-config for existing deployments).
 */

export const RAG_STORAGE_SERVICE = Symbol('RAG_STORAGE_SERVICE');

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type RagComplexityType =
  | 'basic'
  | 'attributed'
  | 'hybrid'
  | 'cross-reference'
  | 'temporal'
  | 'comprehensive';

export interface RagCollection {
  id: string;
  organizationSlug: string;
  name: string;
  slug: string;
  description: string | null;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  status: 'active' | 'processing' | 'error';
  requiredRole: string | null;
  allowedUsers: string[] | null;
  complexityType: RagComplexityType;
  createdBy: string | null;
  documentCount: number;
  chunkCount: number;
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCollectionInput {
  name: string;
  slug: string;
  description: string | null;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  createdBy: string | null;
  requiredRole: string | null;
  allowedUsers: string[] | null;
  complexityType: RagComplexityType;
}

export interface UpdateCollectionInput {
  name: string | null;
  description: string | null;
  requiredRole: string | null;
  allowedUsers: string[] | null;
  clearAllowedUsers: boolean;
  complexityType: string | null;
}

export interface RagDocument {
  id: string;
  collectionId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  fileHash: string | null;
  storagePath: string | null;
  content: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage: string | null;
  chunkCount: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}

export interface RagDocumentContent {
  id: string;
  filename: string;
  fileType: string;
  content: string | null;
  chunkCount: number;
}

export interface InsertDocumentInput {
  filename: string;
  fileType: string;
  fileSize: number;
  fileHash: string | null;
  storagePath: string | null;
  createdBy: string | null;
  content: string | null;
}

export interface RagChunk {
  id: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  pageNumber: number | null;
  metadata: Record<string, unknown>;
}

export interface ChunkInput {
  content: string;
  chunkIndex: number;
  embedding: number[] | null;
  tokenCount: number;
  pageNumber: number | null;
  charOffset: number | null;
  metadata: Record<string, unknown>;
}

export interface RagSearchResult {
  chunkId: string;
  documentId: string;
  documentFilename: string;
  content: string;
  score: number;
  pageNumber: number | null;
  chunkIndex: number;
  charOffset: number | null;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface RagStorageService {
  // Collections
  getCollections(orgSlug: string, userId?: string): Promise<RagCollection[]>;
  getCollection(
    collectionId: string,
    orgSlug: string,
  ): Promise<RagCollection | null>;
  getCollectionBySlug(
    slug: string,
    orgSlug: string,
  ): Promise<RagCollection | null>;
  createCollection(
    orgSlug: string,
    input: CreateCollectionInput,
  ): Promise<RagCollection>;
  updateCollection(
    collectionId: string,
    orgSlug: string,
    updates: UpdateCollectionInput,
  ): Promise<RagCollection | null>;
  deleteCollection(collectionId: string, orgSlug: string): Promise<boolean>;

  // Documents
  getDocuments(collectionId: string, orgSlug: string): Promise<RagDocument[]>;
  getDocument(documentId: string, orgSlug: string): Promise<RagDocument | null>;
  getDocumentContent(
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocumentContent | null>;
  insertDocument(
    collectionId: string,
    orgSlug: string,
    input: InsertDocumentInput,
  ): Promise<RagDocument>;
  updateDocumentContent(
    documentId: string,
    orgSlug: string,
    content: string,
  ): Promise<void>;
  updateDocumentStatus(
    documentId: string,
    orgSlug: string,
    status: string,
    errorMessage?: string,
    chunkCount?: number,
    tokenCount?: number,
  ): Promise<RagDocument | null>;
  deleteDocument(documentId: string, orgSlug: string): Promise<boolean>;

  // Chunks
  getDocumentChunks(documentId: string, orgSlug: string): Promise<RagChunk[]>;
  deleteDocumentChunks(
    documentId: string,
    organizationSlug: string,
  ): Promise<number>;
  insertChunks(
    documentId: string,
    orgSlug: string,
    chunks: ChunkInput[],
  ): Promise<number>;

  // Search
  vectorSearch(
    collectionId: string,
    orgSlug: string,
    embedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<RagSearchResult[]>;
  keywordSearch(
    collectionId: string,
    orgSlug: string,
    query: string,
    topK: number,
  ): Promise<RagSearchResult[]>;

  // Global search — queries ALL chunks for an org, ignoring collection boundaries.
  // Intended for workflow agents, not interactive users.
  globalVectorSearch?(
    orgSlug: string,
    embedding: number[],
    topK: number,
    similarityThreshold: number,
  ): Promise<RagSearchResult[]>;

  // Infrastructure
  isAvailable(): boolean;
  checkHealth(): Promise<{ status: string; message: string }>;
}
