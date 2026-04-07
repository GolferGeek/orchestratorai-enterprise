import { Module } from '@nestjs/common';
import { LegalDepartmentService } from './legal-department.service';
import { LegalIntelligenceService } from './services/legal-intelligence.service';
import { LegalJobsController } from './jobs/legal-jobs.controller';
import { LegalJobsRepository } from './jobs/legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './jobs/legal-capability-config.repository';
import { LegalJobsWorkerService } from './jobs/legal-jobs-worker.service';
import { ProviderConcurrencyRegistry } from './jobs/provider-concurrency';
import { RagStorageModule } from '@orchestratorai/planes/rag';

/**
 * LegalDepartmentModule
 *
 * Provides the Legal Department AI agent for legal document analysis,
 * compliance checking, and legal assistance.
 *
 * Phase 1 of the async-workspace effort adds LegalJobsController +
 * LegalJobsRepository (law.agent_jobs). The worker service lands in Phase 2.
 */
@Module({
  imports: [RagStorageModule],
  controllers: [LegalJobsController],
  providers: [
    LegalDepartmentService,
    LegalIntelligenceService,
    LegalJobsRepository,
    LegalCapabilityConfigRepository,
    ProviderConcurrencyRegistry,
    LegalJobsWorkerService,
  ],
  exports: [
    LegalDepartmentService,
    LegalIntelligenceService,
    LegalJobsRepository,
    LegalCapabilityConfigRepository,
  ],
})
export class LegalDepartmentModule {}
