import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { ExtractorsModule } from '@orchestratorai/planes/extractors';
import { RagManagementController } from './rag.controller';
import { RagManagementService } from './rag-management.service';
import { ChunkingService } from './chunking.service';
import { DocumentProcessorService } from './document-processor.service';

@Module({
  imports: [
    RagStorageModule,
    ExtractorsModule,
    MulterModule.register({ storage: undefined }),
  ],
  controllers: [RagManagementController],
  providers: [
    RagManagementService,
    ChunkingService,
    DocumentProcessorService,
  ],
})
export class RagModule {}
