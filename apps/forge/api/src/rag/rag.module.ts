import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

// Auth
import { AuthModule } from '../auth/auth.module';

// RAG services are provided globally by @Global RagStorageModule plane.
// No import needed here — controllers inject them directly.

// Legacy wrapper stays local — delegates to EMBEDDING_SERVICE
import { EmbeddingService } from './embedding.service';

// Extractors live in the global @orchestratorai/planes/extractors plane and
// are injected directly into DocumentProcessorService — RagModule does not
// need to import or re-export them.

// Controllers (product-specific HTTP endpoints)
import { CollectionsController } from './collections.controller';
import { DocumentsController } from './documents.controller';
import { QueryController } from './query.controller';
import { QAController } from './qa.controller';
import { InternalQueryController } from './internal-query.controller';

/**
 * RAG Module
 *
 * Provides Retrieval-Augmented Generation infrastructure:
 * - Collections: Knowledge base containers
 * - Documents: Source files (PDF, TXT, MD, DOCX)
 * - Chunks: Embedded document segments
 * - Query: Vector similarity search
 *
 * Storage and RAG services are provided by the @Global RagStorageModule plane.
 * All operations are organization-scoped for multi-tenant isolation.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    // RAG_STORAGE_SERVICE + EMBEDDING_SERVICE + RAG services provided by @Global RagStorageModule plane
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  ],
  controllers: [
    CollectionsController,
    DocumentsController,
    QueryController,
    QAController,
    InternalQueryController,
  ],
  providers: [
    // EmbeddingService is a legacy wrapper — delegates to EMBEDDING_SERVICE
    EmbeddingService,
    // Extractors come from the @Global ExtractorsModule registered in AppModule.
    // CollectionsService, DocumentsService, QueryService, ChunkingService,
    // DocumentProcessorService are provided globally by RagStorageModule.
  ],
  // CollectionsService, DocumentsService, QueryService, DocumentProcessorService
  // are provided globally by the @Global RagStorageModule plane — no re-export needed.
  exports: [EmbeddingService],
})
export class RagModule {}
