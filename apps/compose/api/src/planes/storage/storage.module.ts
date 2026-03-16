import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseModule } from '../supabase-core/supabase.module';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from './media-storage-provider.interface';
import { MediaStorageHelper } from './supabase-media-storage.service';
import { AzureBlobMediaStorageService } from './azure-blob-media-storage.service';
import { GcsMediaStorageService } from './gcs-media-storage.service';
import { DATABASE_SERVICE, DatabaseService } from '../database';

// Evaluated at module load time before NestJS DI wires anything.
// SupabaseModule and MediaStorageHelper are only registered when
// STORAGE_PROVIDER is supabase_storage. On Azure (azure_blob) and GCP (gcs)
// deployments they are excluded entirely to prevent SupabaseService from
// initialising without its required env vars.
const storageProvider = process.env.STORAGE_PROVIDER;
const needsSupabase = storageProvider === 'supabase_storage';

@Global()
@Module({
  imports: needsSupabase ? [SupabaseModule] : [],
  providers: [
    ...(needsSupabase ? [MediaStorageHelper] : []),
    {
      provide: MEDIA_STORAGE_PROVIDER,
      useFactory: (
        configService: ConfigService,
        db: DatabaseService,
        mediaStorageHelper?: MediaStorageHelper,
      ): MediaStorageProvider => {
        const provider = configService.get<string>('STORAGE_PROVIDER');
        switch (provider) {
          case 'supabase_storage':
            if (!mediaStorageHelper) {
              throw new Error(
                'MediaStorageHelper not available — STORAGE_PROVIDER is not supabase_storage',
              );
            }
            return mediaStorageHelper;
          case 'azure_blob':
            return new AzureBlobMediaStorageService(db);
          case 'gcs':
            return new GcsMediaStorageService(db);
          default:
            throw new Error(
              `Unsupported STORAGE_PROVIDER '${provider}'. Expected: supabase_storage, azure_blob, gcs`,
            );
        }
      },
      // DATABASE_SERVICE and ConfigService are always present.
      // MediaStorageHelper is appended only when needsSupabase, making it the
      // last positional argument (mediaStorageHelper? in the factory).
      inject: [
        ConfigService,
        DATABASE_SERVICE,
        ...(needsSupabase ? [MediaStorageHelper] : []),
      ],
    },
  ],
  exports: [MEDIA_STORAGE_PROVIDER],
})
export class StorageModule {}
