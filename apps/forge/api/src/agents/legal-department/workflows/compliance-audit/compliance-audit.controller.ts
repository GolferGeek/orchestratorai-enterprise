/**
 * ComplianceAuditController — read endpoints for the Compliance Audit workflow.
 *
 * Routes:
 *   GET /legal-department/frameworks                           — available framework collections
 *   GET /legal-department/compliance-audit/:jobId/scorecard    — compliance scorecard
 *   GET /legal-department/compliance-audit/:jobId/findings     — findings with filtering
 *   GET /legal-department/compliance-audit/:jobId/remediation  — priority-sorted remediation
 *
 * Upload and review use the shared LegalJobsController endpoints.
 */
import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import { RAG_STORAGE_SERVICE } from '@orchestratorai/planes/rag';
import type { RagStorageService } from '@orchestratorai/planes/rag';
import { listFrameworkThemes } from './nodes/theme-config-parser';
import { LegalJobsRepository } from '../../jobs/legal-jobs.repository';

const FRAMEWORK_COLLECTION_PREFIX = 'framework-';

interface FrameworkInfo {
  slug: string;
  name: string;
  description: string;
  hasThemeConfig: boolean;
  themes?: Array<{ themeId: string; themeName: string; questionCount: number }>;
}

@Controller('legal-department')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class ComplianceAuditController {
  private readonly logger = new Logger(ComplianceAuditController.name);

  constructor(
    private readonly repository: LegalJobsRepository,
    @Inject(RAG_STORAGE_SERVICE)
    @Optional()
    private readonly ragStorage?: RagStorageService,
  ) {}

  /**
   * GET /legal-department/frameworks
   *
   * Returns available regulatory framework collections for the org.
   * Each entry includes slug, name, description, and whether a theme config exists.
   */
  @Get('frameworks')
  async listFrameworks(
    @Query('orgSlug') orgSlug: string | undefined,
  ): Promise<FrameworkInfo[]> {
    const org = orgSlug ?? 'big-ideas';

    if (!this.ragStorage) {
      this.logger.warn('RAG storage not available, returning empty frameworks');
      return [];
    }

    const collections = await this.ragStorage.getCollections(org);

    const frameworks: FrameworkInfo[] = [];
    for (const col of collections) {
      if (!col.slug.startsWith(FRAMEWORK_COLLECTION_PREFIX)) continue;

      const frameworkSlug = col.slug.replace(FRAMEWORK_COLLECTION_PREFIX, '');
      const themes = listFrameworkThemes(frameworkSlug);

      frameworks.push({
        slug: frameworkSlug,
        name: col.name,
        description: col.description ?? '',
        hasThemeConfig: themes.length > 0,
        themes: themes.length > 0 ? themes : undefined,
      });
    }

    return frameworks;
  }

  /**
   * GET /legal-department/compliance-audit/:jobId/scorecard
   *
   * Returns the ComplianceScorecard from the job result.
   */
  @Get('compliance-audit/:jobId/scorecard')
  async getScorecard(
    @Param('jobId') jobId: string,
    @Query('orgSlug') orgSlug: string | undefined,
  ) {
    const org = orgSlug ?? 'big-ideas';
    const job = await this.repository.findByIdForOrg(jobId, org);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (!job.result?.scorecard) {
      throw new NotFoundException(
        `Scorecard not available for job ${jobId} (status: ${job.status})`,
      );
    }

    return job.result.scorecard;
  }

  /**
   * GET /legal-department/compliance-audit/:jobId/findings
   *
   * Returns findings array from the job result, with optional filtering
   * by framework, status, severity, and theme. Supports pagination.
   */
  @Get('compliance-audit/:jobId/findings')
  async getFindings(
    @Param('jobId') jobId: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('framework') framework: string | undefined,
    @Query('status') status: string | undefined,
    @Query('severity') severity: string | undefined,
    @Query('theme') theme: string | undefined,
    @Query('offset') offsetStr: string | undefined,
    @Query('limit') limitStr: string | undefined,
  ) {
    const org = orgSlug ?? 'big-ideas';
    const job = await this.repository.findByIdForOrg(jobId, org);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    let findings: Array<Record<string, unknown>> = Array.isArray(
      job.result?.findings,
    )
      ? (job.result.findings as Array<Record<string, unknown>>)
      : [];

    // Apply filters
    if (framework) {
      findings = findings.filter((f) => f.frameworkSlug === framework);
    }
    if (status) {
      const statuses = status.split(',');
      findings = findings.filter((f) => statuses.includes(f.status as string));
    }
    if (severity) {
      const severities = severity.split(',');
      findings = findings.filter((f) =>
        severities.includes(f.severity as string),
      );
    }
    if (theme) {
      findings = findings.filter((f) => f.themeId === theme);
    }

    // Pagination
    const total = findings.length;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    findings = findings.slice(offset, offset + limit);

    return {
      total,
      offset,
      limit,
      findings,
    };
  }

  /**
   * GET /legal-department/compliance-audit/:jobId/remediation
   *
   * Returns the remediation plan sorted by priority from the job result.
   */
  @Get('compliance-audit/:jobId/remediation')
  async getRemediation(
    @Param('jobId') jobId: string,
    @Query('orgSlug') orgSlug: string | undefined,
  ) {
    const org = orgSlug ?? 'big-ideas';
    const job = await this.repository.findByIdForOrg(jobId, org);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const remediationPlan: Array<Record<string, unknown>> = Array.isArray(
      job.result?.remediationPlan,
    )
      ? (job.result.remediationPlan as Array<Record<string, unknown>>)
      : [];

    // Already sorted by priority in report-generation.node.ts
    return remediationPlan;
  }
}
