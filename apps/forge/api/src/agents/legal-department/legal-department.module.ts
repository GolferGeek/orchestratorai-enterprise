import { Module } from '@nestjs/common';
import { LegalDepartmentController } from './legal-department.controller';
import { LegalDepartmentService } from './legal-department.service';

/**
 * LegalDepartmentModule
 *
 * Provides the Legal Department AI agent for legal document analysis,
 * compliance checking, and legal assistance.
 *
 * Phase 3 (M0): Simple echo workflow to prove LLM integration works
 *
 * Future phases will include:
 * - Legal document analysis
 * - Key terms and clause extraction
 * - Multi-document comparison
 * - Compliance requirement checking
 * - Risk assessment
 * - Legal metadata extraction
 */
@Module({
  imports: [],
  controllers: [LegalDepartmentController],
  providers: [LegalDepartmentService],
  exports: [LegalDepartmentService],
})
export class LegalDepartmentModule {}
