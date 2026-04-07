import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

// Auth
import { AuthModule } from '../auth/auth.module';

// Services
import { CollectionsService } from './collections.service';
import { DocumentsService } from './documents.service';
import { QueryService } from './query.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { DocumentProcessorService } from './document-processor.service';

// Extractors live in the global @orchestratorai/planes/extractors plane and
// are injected directly into DocumentProcessorService — RagModule does not
// need to import or re-export them.

// Controllers
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
 * Storage is provided by RagStorageModule (6th provider plane).
 * All operations are organization-scoped for multi-tenant isolation.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    // RAG_STORAGE_SERVICE + EMBEDDING_SERVICE provided by @Global RagStorageModule plane
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
    // Core Services
    CollectionsService,
    DocumentsService,
    QueryService,

    // Processing Pipeline
    ChunkingService,
    EmbeddingService, // Legacy wrapper — delegates to EMBEDDING_SERVICE
    DocumentProcessorService,
    // Extractors come from the @Global ExtractorsModule registered in AppModule.
  ],
  exports: [
    CollectionsService,
    DocumentsService,
    QueryService,
    EmbeddingService,
    // Extractors come from the global ExtractorsModule, no need to re-export.
  ],
})
export class RagModule {}
