import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DATABASE_SERVICE, DatabaseService } from '../../database';
import { GcsMediaStorageService } from '../gcs-media-storage.service';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from '../media-storage-provider.interface';
import { StorageModule } from '../storage.module';

const configService = {
  get: jest.fn((key: string) =>
    key === 'STORAGE_PROVIDER' ? 'gcs' : undefined,
  ),
};
const database = {} as DatabaseService;

@Global()
@Module({
  providers: [
    { provide: ConfigService, useValue: configService },
    { provide: DATABASE_SERVICE, useValue: database },
  ],
  exports: [ConfigService, DATABASE_SERVICE],
})
class TestInfrastructureModule {}

describe('StorageModule', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves the GCS provider without a Supabase service', async () => {
    process.env.GCS_PROJECT_ID = 'test-project';
    process.env.GCS_BUCKET_MEDIA = 'test-media';
    process.env.GCS_BUCKET_LEGAL = 'test-legal';

    const module = await Test.createTestingModule({
      imports: [TestInfrastructureModule, StorageModule],
    }).compile();

    const provider = module.get<MediaStorageProvider>(MEDIA_STORAGE_PROVIDER);
    expect(provider).toBeInstanceOf(GcsMediaStorageService);
    await module.close();
  });
});
