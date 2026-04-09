import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { RagManagementController } from './rag-management.controller';
import { RagManagementService } from './rag-management.service';
import { ChunkingService } from './chunking.service';
import { DocumentProcessorService } from './document-processor.service';

@Module({
  imports: [
    // Provides EMBEDDING_SERVICE (global plane)
    RagStorageModule,
    // Multipart file upload support
    MulterModule.register({ storage: undefined }), // memory storage (default)
  ],
  controllers: [RagManagementController],
  providers: [
    RagManagementService,
    ChunkingService,
    // PdfExtractorService, DocxExtractorService, TextExtractorService are
    // provided globally by ExtractorsModule (registered in AppModule).
    DocumentProcessorService,
  ],
})
export class RagManagementModule {}
