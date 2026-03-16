/**
 * Re-export shim — RAG plane now lives in planes/rag/.
 */
export { RAG_STORAGE_SERVICE } from '../planes/rag/rag-storage.interface';
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
} from '../planes/rag/rag-storage.interface';
export { EMBEDDING_SERVICE } from '../planes/rag/embedding.interface';
export type {
  EmbeddingServiceProvider,
  EmbeddingResult,
} from '../planes/rag/embedding.interface';
export { RagStorageModule } from '../planes/rag/rag-storage.module';
export { SupabaseRagStorageService } from '../planes/rag/supabase-rag-storage.service';
export { SqlServerRagStorageService } from '../planes/rag/sqlserver-rag-storage.service';
