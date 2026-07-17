import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from './media-storage-provider.interface';
import { MediaStorageHelper } from './supabase-media-storage.service';
import { AzureBlobMediaStorageService } from './azure-blob-media-storage.service';
import { GcsMediaStorageService } from './gcs-media-storage.service';
import { DATABASE_SERVICE, DatabaseService } from '../database';

@Global()
@Module({
  providers: [
    MediaStorageHelper,
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
      inject: [ConfigService, DATABASE_SERVICE, MediaStorageHelper],
    },
  ],
  exports: [MEDIA_STORAGE_PROVIDER],
})
export class StorageModule {}
