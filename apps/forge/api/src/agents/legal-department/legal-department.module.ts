import { Module } from '@nestjs/common';
import { LegalDepartmentController } from './legal-department.controller';
import { LegalDepartmentService } from './legal-department.service';
import { LegalIntelligenceService } from './services/legal-intelligence.service';
import { RagStorageModule } from '@orchestratorai/planes/rag';

/**
 * LegalDepartmentModule
 *
 * Provides the Legal Department AI agent for legal document analysis,
 * compliance checking, and legal assistance.
 */
@Module({
  imports: [RagStorageModule],
  controllers: [LegalDepartmentController],
  providers: [LegalDepartmentService, LegalIntelligenceService],
  exports: [LegalDepartmentService, LegalIntelligenceService],
})
export class LegalDepartmentModule {}
