// Storage interface + types
export { RAG_STORAGE_SERVICE } from './rag-storage.interface';
export type {
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

// Embedding interface + types
export { EMBEDDING_SERVICE } from './embedding.interface';
export type {
  EmbeddingServiceProvider,
  EmbeddingResult,
} from './embedding.interface';

// Embedding infrastructure
export { EmbeddingModelRouter } from './embedding-model-router';
export { RoutingEmbeddingService } from './routing-embedding.service';

// Module
export { RagStorageModule } from './rag-storage.module';

// Storage provider implementations
export { SupabaseRagStorageService } from './supabase-rag-storage.service';
export { SqlServerRagStorageService } from './sqlserver-rag-storage.service';

// RAG services (business logic layer above the storage plane)
export { ChunkingService } from './chunking.service';
export type { Chunk, ChunkingConfig } from './chunking.service';
export { QueryService } from './query.service';
export type {
  QueryParams,
  SearchResult,
  RelatedDocument,
  QueryResponse,
} from './query.service';
export { MetadataEnrichmentService } from './metadata-enrichment.service';
export type {
  HeadingEntry,
  CrossRef,
  DocumentContext,
} from './metadata-enrichment.service';
export { DocumentProcessorService } from './document-processor.service';
export { CollectionsService } from './collections.service';
export type {
  CreateCollectionParams,
  UpdateCollectionParams,
} from './collections.service';
export { DocumentsService } from './documents.service';
