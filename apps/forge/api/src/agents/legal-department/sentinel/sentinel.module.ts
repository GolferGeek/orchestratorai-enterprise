import { Module } from '@nestjs/common';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { SentinelController } from './sentinel.controller';
import { SentinelRepository } from './sentinel.repository';

@Module({
  imports: [RagStorageModule],
  controllers: [SentinelController],
  providers: [SentinelRepository],
  exports: [SentinelRepository],
})
export class SentinelModule {}
