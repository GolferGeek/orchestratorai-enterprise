import { Module } from '@nestjs/common';
import { RagManagementController } from './rag-management.controller';
import { RagManagementService } from './rag-management.service';

@Module({
  controllers: [RagManagementController],
  providers: [RagManagementService],
})
export class RagManagementModule {}
