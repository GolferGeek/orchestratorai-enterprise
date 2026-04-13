// Module
export * from './rag.module';

// Services re-exported from the shared RAG plane
export {
  CollectionsService,
  DocumentsService,
  QueryService,
  ChunkingService,
  DocumentProcessorService,
  MetadataEnrichmentService,
} from '@orchestratorai/planes/rag';

// Legacy embedding wrapper (product-local)
export * from './embedding.service';

// DTOs (product-local, with class-validator decorators)
export * from './dto';
