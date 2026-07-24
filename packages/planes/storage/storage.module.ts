import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from './media-storage-provider.interface';
import {
  MediaStorageHelper,
  SupabaseStorageClient,
} from './supabase-media-storage.service';
import { AzureBlobMediaStorageService } from './azure-blob-media-storage.service';
import { GcsMediaStorageService } from './gcs-media-storage.service';
import { DATABASE_SERVICE, DatabaseService } from '../database';
import { createClient } from '@supabase/supabase-js';

@Global()
@Module({
  providers: [
    {
      provide: MEDIA_STORAGE_PROVIDER,
      useFactory: (
        configService: ConfigService,
        db: DatabaseService,
      ): MediaStorageProvider => {
        const provider = configService.get<string>('STORAGE_PROVIDER');
        switch (provider) {
          case 'supabase_storage': {
            const url = configService.getOrThrow<string>('SUPABASE_URL');
            const serviceKey = configService.getOrThrow<string>(
              'SUPABASE_SERVICE_ROLE_KEY',
            );
            const client = createClient(url, serviceKey);
            const storageClient: SupabaseStorageClient = {
              getServiceClient: () => client,
            };
            return new MediaStorageHelper(db, storageClient);
          }
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
      inject: [ConfigService, DATABASE_SERVICE],
    },
  ],
  exports: [MEDIA_STORAGE_PROVIDER],
})
export class StorageModule {}
