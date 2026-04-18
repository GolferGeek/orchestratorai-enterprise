import { Module } from '@nestjs/common';
import { LegalDepartmentService } from './legal-department.service';
import { LegalIntelligenceService } from './services/legal-intelligence.service';
import { LegalJobsController } from './jobs/legal-jobs.controller';
import { ComplianceAuditController } from './workflows/compliance-audit/compliance-audit.controller';
import { LegalJobsRepository } from './jobs/legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './jobs/legal-capability-config.repository';
import { LegalJobsWorkerService } from './jobs/legal-jobs-worker.service';
import { LegalJobsCleanupService } from './jobs/legal-jobs-cleanup.service';
import { LegalDocumentsStorageService } from './jobs/legal-documents-storage.service';
import { ProviderConcurrencyRegistry } from './jobs/provider-concurrency';
import { AdminLookupService } from './jobs/admin-lookup.service';
import { DealMemoArtifactService } from './workflows/deal-memo/artifacts/deal-memo-artifact.service';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { SentinelModule } from './sentinel/sentinel.module';
import { DepositionPrepService } from './workflows/deposition-prep/deposition-prep.service';
import { CrossExamSimulationService } from './workflows/cross-exam-simulation/cross-exam-simulation.service';

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
  imports: [RagStorageModule, SentinelModule],
  controllers: [LegalJobsController, ComplianceAuditController],
  providers: [
    LegalDepartmentService,
    LegalIntelligenceService,
    LegalJobsRepository,
    LegalCapabilityConfigRepository,
    LegalDocumentsStorageService,
    DealMemoArtifactService,
    ProviderConcurrencyRegistry,
    AdminLookupService,
    LegalJobsWorkerService,
    LegalJobsCleanupService,
    DepositionPrepService,
    CrossExamSimulationService,
  ],
  exports: [
    LegalDepartmentService,
    LegalIntelligenceService,
    LegalJobsRepository,
    LegalCapabilityConfigRepository,
    DealMemoArtifactService,
    DepositionPrepService,
    CrossExamSimulationService,
  ],
})
export class LegalDepartmentModule {}
