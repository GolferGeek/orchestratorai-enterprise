import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RAG_STORAGE_SERVICE,
  RagStorageService,
} from './rag-storage.interface';
import { EMBEDDING_SERVICE } from './embedding.interface';
import { EmbeddingModelRouter } from './embedding-model-router';
import {
  OllamaEmbeddingClient,
  OpenAIEmbeddingClient,
  VertexAIEmbeddingClient,
} from './embedding-clients';
import { RoutingEmbeddingService } from './routing-embedding.service';
import { SupabaseRagStorageService } from './supabase-rag-storage.service';
import { SqlServerRagStorageService } from './sqlserver-rag-storage.service';
import { PostgresqlRagStorageService } from './postgresql-rag-storage.service';
import { ChunkingService } from './chunking.service';
import { QueryService } from './query.service';
import { MetadataEnrichmentService } from './metadata-enrichment.service';
import { DocumentProcessorService } from './document-processor.service';
import { CollectionsService } from './collections.service';
import { DocumentsService } from './documents.service';

const logger = new Logger('RagStorageModule');

// Evaluated at module load time before NestJS DI wires anything.
// RAG_PROVIDER falls back to DB_PROVIDER, then to 'supabase_pg'.
// SupabaseRagStorageService is only registered when the resolved provider is
// supabase or supabase_pg. On Azure (sqlserver) and GCP (postgresql)
// deployments it is excluded entirely — no SupabaseModule import is needed
// since SupabaseRagStorageService only uses a direct pg Pool (ConfigService).
const ragProvider =
  process.env.RAG_PROVIDER || process.env.DB_PROVIDER || 'supabase_pg';
const needsSupabase =
  ragProvider === 'supabase' || ragProvider === 'supabase_pg';

@Global()
@Module({
  imports: [],
  providers: [
    // Embedding plane providers (model-routed, not env-var-routed)
    EmbeddingModelRouter,
    OllamaEmbeddingClient,
    OpenAIEmbeddingClient,
    VertexAIEmbeddingClient,
    RoutingEmbeddingService,
    {
      provide: EMBEDDING_SERVICE,
      useExisting: RoutingEmbeddingService,
    },
    // RAG business-logic services
    ChunkingService,
    QueryService,
    MetadataEnrichmentService,
    DocumentProcessorService,
    CollectionsService,
    DocumentsService,
    // Storage plane providers (env-var-routed)
    ...(needsSupabase ? [SupabaseRagStorageService] : []),
    {
      provide: RAG_STORAGE_SERVICE,
      useFactory: (
        configService: ConfigService,
        db: DatabaseService,
        supabaseRag?: SupabaseRagStorageService,
      ): RagStorageService => {
        const provider =
          configService.get<string>('RAG_PROVIDER') ||
          configService.get<string>('DB_PROVIDER') ||
          'supabase_pg';

        logger.log(`RAG_PROVIDER resolved to '${provider}'`);

        switch (provider) {
          case 'supabase':
          case 'supabase_pg':
            if (!supabaseRag) {
              throw new Error(
                'SupabaseRagStorageService not available — RAG_PROVIDER is not supabase/supabase_pg',
              );
            }
            return supabaseRag;
          case 'sqlserver':
            return new SqlServerRagStorageService(db, configService);
          case 'postgresql':
            return new PostgresqlRagStorageService(configService);
          default:
            throw new Error(
              `Unsupported RAG_PROVIDER '${provider}'. Expected: supabase, supabase_pg, sqlserver, postgresql`,
            );
        }
      },
      // DATABASE_SERVICE and ConfigService are always present.
      // SupabaseRagStorageService is appended only when needsSupabase, making
      // it the last positional argument (supabaseRag? in the factory).
      inject: [
        ConfigService,
        DATABASE_SERVICE,
        ...(needsSupabase ? [SupabaseRagStorageService] : []),
      ],
    },
  ],
  exports: [
    RAG_STORAGE_SERVICE,
    EMBEDDING_SERVICE,
    ChunkingService,
    QueryService,
    MetadataEnrichmentService,
    DocumentProcessorService,
    CollectionsService,
    DocumentsService,
  ],
})
export class RagStorageModule {}
