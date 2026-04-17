/**
 * LegalJobsController — async job + capability config endpoints for the
 * Legal Department workspace.
 *
 * Protected by JwtAuthGuard + RbacGuard + @RequirePermission('agents:execute').
 * ExecutionContext arrives in the request body; org scoping is enforced by the
 * repository (every read filters by ctx.orgSlug).
 *
 * Routes:
 *   POST   /legal-department/jobs                       — enqueue a new job (JSON)
 *   POST   /legal-department/jobs/upload                — enqueue from a file upload
 *   GET    /legal-department/jobs                       — list jobs for caller's org
 *   GET    /legal-department/jobs/:id                   — fetch one job
 *   GET    /legal-department/jobs/:id/events            — durable event history
 *   GET    /legal-department/capabilities/:slug/models  — read per-role model config
 *   PUT    /legal-department/capabilities/:slug/models  — update one role
 *
 * See: docs/efforts/current/prd.md
 */
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import { countTokens, MAX_INPUT_TOKENS } from '../services/token-count.util';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';

/** Maximum number of files accepted per upload request (non-DD jobs). */
const MAX_FILES = 10;
/** Maximum number of files accepted for Due Diligence room uploads. */
const MAX_DD_FILES = 500;
/** Per-file size limit for DD rooms (50 MB). */
const DD_FILE_SIZE_LIMIT = 50 * 1024 * 1024;
/** Total room size limit for DD rooms (1 GB). */
const DD_TOTAL_SIZE_LIMIT = 1024 * 1024 * 1024;
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';
import { LegalJobsRepository, isAccessAllowed } from './legal-jobs.repository';
import { AdminLookupService } from './admin-lookup.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import {
  LegalCapabilityConfigRepository,
  type CapabilityRole,
} from './legal-capability-config.repository';
import { LegalDocumentsStorageService } from './legal-documents-storage.service';
import {
  DealMemoArtifactService,
  MEMO_ARTIFACT_CONTENT_TYPES,
} from '../workflows/deal-memo/artifacts/deal-memo-artifact.service';
import { setCapabilityModelConfig } from '../config/legal-model-config';
import { LegalDepartmentService } from '../legal-department.service';
import type { LegalDepartmentState } from '../legal-department.state';
import {
  type AccessControl,
  DD_JOB_TYPE,
  DEAL_MEMO_JOB_TYPE,
  DOCUMENT_ANALYSIS_JOB_TYPE,
  EnqueueJobRequest,
  EnqueueJobResponse,
  JobStatus,
  LEGAL_AGENT_SLUG,
  ListJobsResponse,
  ReviewDecisionPayload,
  ReviewJobRequest,
  ReviewJobResponse,
  type UpdateAccessControlRequest,
  type UpdateAccessControlResponse,
} from './legal-jobs.types';
import { COMPLIANCE_AUDIT_JOB_TYPE } from '../workflows/compliance-audit/compliance-audit.types';
import type { DealStructure } from '../workflows/deal-memo/deal-memo.types';

const VALID_DEAL_STRUCTURES: ReadonlyArray<DealStructure> = [
  'stock-purchase',
  'asset-purchase',
  'merger',
];

const VALID_ROLES: ReadonlyArray<CapabilityRole> = [
  'workhorse',
  'thinking',
  'image',
];

const VALID_STATUSES: ReadonlyArray<JobStatus> = [
  'queued',
  'processing',
  'completed',
  'failed',
  'cancel_requested',
  'canceled',
];

@Controller('legal-department')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class LegalJobsController {
  private readonly logger = new Logger(LegalJobsController.name);

  constructor(
    private readonly repository: LegalJobsRepository,
    private readonly capabilityConfig: LegalCapabilityConfigRepository,
    private readonly extractor: DocumentExtractionRouter,
    private readonly documentsStorage: LegalDocumentsStorageService,
    private readonly legalDepartmentService: LegalDepartmentService,
    private readonly dealMemoArtifactService: DealMemoArtifactService,
    private readonly adminLookup: AdminLookupService,
    private readonly observability: ObservabilityService,
  ) {}

  private async resolveAccess(
    userId: string,
    orgSlug: string,
  ): Promise<{ allowedForUserId: string; isAdmin: boolean }> {
    const isAdmin = await this.adminLookup.isOrgAdmin(userId, orgSlug);
    return { allowedForUserId: userId, isAdmin };
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }
    return userId;
  }

  @Post('jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueue(@Body() body: EnqueueJobRequest): Promise<EnqueueJobResponse> {
    if (!body || !body.context) {
      throw new BadRequestException(
        'ExecutionContext (body.context) is required',
      );
    }
    const ctx = body.context;
    if (!ctx.orgSlug || !ctx.userId || !ctx.provider || !ctx.model) {
      throw new BadRequestException(
        'ExecutionContext must include orgSlug, userId, provider, and model',
      );
    }
    if (ctx.orgSlug === '*') {
      throw new BadRequestException(
        'ExecutionContext.orgSlug cannot be the wildcard "*". Select a specific organization before enqueuing a job.',
      );
    }
    if (!body.data || typeof body.data.content !== 'string') {
      throw new BadRequestException('body.data.content (string) is required');
    }

    // Reject oversized payloads at the edge so the worker never picks
    // up a job that is guaranteed to bust an LLM context window. The
    // worker (and the chunked specialist helper) still does its own
    // budgeting per call — this is the hard outer ceiling.
    this.assertWithinInputBudget(body.data.content, ctx.model);

    // Normalize single-doc JSON body to the multi-doc documents[] shape so
    // the worker and graph always see a uniform documents array.
    if (!Array.isArray(body.data.documents)) {
      (body.data as Record<string, unknown>).documents = [
        {
          content: body.data.content,
          contentType: body.data.contentType,
          filename: body.data.filename as string | undefined,
        },
      ];
    }

    const conversationId = randomUUID();
    const row = await this.repository.insertQueued(body, conversationId);

    this.logger.log(
      `Enqueued job ${row.id} for org=${ctx.orgSlug} user=${ctx.userId} conv=${conversationId}`,
    );

    return {
      jobId: row.id,
      conversationId: row.conversation_id,
      status: row.status,
    };
  }

  @Get('jobs')
  async list(
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('status') status: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('jobType') jobType?: string,
    @Query('parentJobId') parentJobId?: string,
  ): Promise<ListJobsResponse> {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    let parsedStatus: JobStatus | undefined;
    if (status) {
      if (!VALID_STATUSES.includes(status as JobStatus)) {
        throw new BadRequestException(
          `status must be one of: ${VALID_STATUSES.join(', ')}`,
        );
      }
      parsedStatus = status as JobStatus;
    }
    let jobs = await this.repository.listForOrg(orgSlug, {
      status: parsedStatus,
      userId: userId || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      jobType: jobType || undefined,
      parentJobId: parentJobId || undefined,
      ...access,
    });
    // Deal memos inherit access from their parent DD room. Filter out any
    // memo whose parent is inaccessible to the caller.
    const memoJobs = jobs.filter((j) => {
      const md = j.input?.metadata as Record<string, unknown> | undefined;
      return md?.jobType === DEAL_MEMO_JOB_TYPE;
    });
    if (memoJobs.length > 0) {
      const parentIds = [
        ...new Set(
          memoJobs
            .map(
              (j) =>
                (j.input?.data as Record<string, unknown> | undefined)
                  ?.parentJobId as string | undefined,
            )
            .filter(Boolean) as string[],
        ),
      ];
      const parentAccess = new Map<string, boolean>();
      await Promise.all(
        parentIds.map(async (pid) => {
          const parent = await this.repository.findByIdForOrg(
            pid,
            orgSlug,
            access,
          );
          parentAccess.set(pid, parent !== null);
        }),
      );
      jobs = jobs.filter((j) => {
        const md = j.input?.metadata as Record<string, unknown> | undefined;
        if (md?.jobType !== DEAL_MEMO_JOB_TYPE) return true;
        const pid = (j.input?.data as Record<string, unknown> | undefined)
          ?.parentJobId as string | undefined;
        return !pid || parentAccess.get(pid) !== false;
      });
    }
    return { jobs };
  }

  @Get('jobs/:id')
  async get(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    // Augment with a tenant-scoped proxy URL for the original file when
    // present. We don't return a Supabase storage URL directly because:
    //   - the dev container's public URLs are unreliable, and
    //   - the production buckets are private and signing is per-provider.
    // The proxy endpoint below (GET .../jobs/:id/file) re-uses the same
    // org-scoped repository read so authz is enforced consistently.
    // Pre-existing jobs (and JSON-body enqueues) have null
    // original_file_path and the modal renders the extracted-text fallback.
    let originalFileUrl: string | undefined;
    if (row.original_file_path) {
      originalFileUrl = `/legal-department/jobs/${encodeURIComponent(id)}/file?orgSlug=${encodeURIComponent(orgSlug)}`;
    }

    // When a job is paused at HITL, surface the review payload (specialist
    // outputs, synthesis, documents summary) straight from the LangGraph
    // checkpointer so the Forge web review modal can render without a
    // separate fetch. Non-awaiting rows don't carry this.
    let reviewPayload:
      | {
          specialistOutputs: LegalDepartmentState['specialistOutputs'];
          synthesis: LegalDepartmentState['orchestration']['synthesis'];
          documentsSummary: Array<{
            name: string;
            type?: string;
            length: number;
          }>;
          redlineOutput?: LegalDepartmentState['redlineOutput'];
          clauseMap?: LegalDepartmentState['clauseMap'];
        }
      | undefined;
    if (row.status === 'awaiting_review') {
      // Determine which graph to read state from based on capabilitySlug or jobType
      const inputData = row.input?.data as Record<string, unknown> | undefined;
      const inputMetadata = row.input?.metadata as
        | Record<string, unknown>
        | undefined;
      const jobType = inputMetadata?.jobType as string | undefined;
      const capabilitySlug =
        jobType === 'legal-research'
          ? 'legal-research'
          : jobType === 'adversarial-brief'
            ? 'adversarial-brief'
            : jobType === DD_JOB_TYPE
              ? DD_JOB_TYPE
              : jobType === COMPLIANCE_AUDIT_JOB_TYPE
                ? COMPLIANCE_AUDIT_JOB_TYPE
                : jobType === DEAL_MEMO_JOB_TYPE
                  ? DEAL_MEMO_JOB_TYPE
                  : (inputData?.capabilitySlug as string | undefined);
      const graph = this.legalDepartmentService.getGraph(capabilitySlug);
      const snapshot = await graph.getState({
        configurable: { thread_id: row.conversation_id },
      });
      const values = (snapshot?.values ?? {}) as Record<string, unknown>;

      if (capabilitySlug === 'adversarial-brief') {
        // Adversarial brief state: surface stress-test report + debate rounds
        reviewPayload = {
          specialistOutputs: {},
          synthesis: undefined,
          documentsSummary: [],
          stressTestReport: values.stressTestReport,
          debateTranscript: values.rounds,
          convergenceReason: values.convergenceReason,
          tokenUsage: values.tokenUsage,
        } as typeof reviewPayload;
      } else if (capabilitySlug === 'legal-research') {
        // Legal research state has different shape
        reviewPayload = {
          specialistOutputs: {},
          synthesis: undefined,
          documentsSummary: [],
          memo: values.memo as string | undefined,
          researchTree: values.researchTree,
          tokenUsage: values.tokenUsage,
        } as typeof reviewPayload;
      } else if (capabilitySlug === DD_JOB_TYPE) {
        // DD room state: surface document index, running findings, risk matrix
        reviewPayload = {
          specialistOutputs: {},
          synthesis: undefined,
          documentsSummary: [],
          documentIndex: values.documentIndex,
          runningFindings: values.runningFindings,
          riskMatrix: values.riskMatrix,
          dealBreakerFlags: values.dealBreakerFlags,
          dealContext: values.dealContext,
        } as typeof reviewPayload;
      } else if (capabilitySlug === COMPLIANCE_AUDIT_JOB_TYPE) {
        // Compliance audit state: surface findings, scorecard, audit context
        reviewPayload = {
          specialistOutputs: {},
          synthesis: undefined,
          documentsSummary: [],
          findings: values.findings,
          scorecard: values.scorecard,
          auditContext: values.auditContext,
          policySections: values.policySections,
        } as typeof reviewPayload;
      } else if (capabilitySlug === DEAL_MEMO_JOB_TYPE) {
        // Deal-memo state: surface the synthesized memo, per-section drafts,
        // per-section citations, and dealStructure so the review modal can
        // render approve / reject / modify against the draft prose.
        const sectionDrafts = (values.sectionDrafts ?? {}) as Record<
          string,
          { citations: unknown[] }
        >;
        const sectionCitations = Object.fromEntries(
          Object.entries(sectionDrafts).map(([sectionId, draft]) => [
            sectionId,
            draft.citations,
          ]),
        );
        reviewPayload = {
          specialistOutputs: {},
          synthesis: undefined,
          documentsSummary: [],
          gate: 'deal-memo',
          dealStructure: values.dealStructure,
          memoMarkdown: values.memoMarkdown,
          sectionDrafts,
          sectionCitations,
        } as typeof reviewPayload;
      } else {
        const ldValues = values as unknown as LegalDepartmentState;
        reviewPayload = {
          specialistOutputs: ldValues.specialistOutputs ?? {},
          synthesis: ldValues.orchestration?.synthesis,
          documentsSummary: (ldValues.documents ?? []).map((d, i) => ({
            name: d.name,
            type: ldValues.documentsMetadata?.[i]?.documentType?.type ?? d.type,
            length: d.content?.length ?? 0,
          })),
          redlineOutput: ldValues.redlineOutput,
          clauseMap: ldValues.clauseMap,
        };
      }
    }

    return { ...row, originalFileUrl, reviewPayload };
  }

  /**
   * POST /legal-department/jobs/:id/review — record an attorney's review
   * decision and re-queue the job for the worker to resume.
   *
   * The entire state transition happens in a single guarded UPDATE
   * (`WHERE status='awaiting_review'`), so two concurrent reviewers can't
   * both succeed — the second one gets a 409. No graph work runs on the
   * HTTP thread; the worker picks the re-queued row up on its next tick.
   */
  @Post('jobs/:id/review')
  @HttpCode(HttpStatus.ACCEPTED)
  async review(
    @Param('id') id: string,
    @Body() body: ReviewJobRequest,
  ): Promise<ReviewJobResponse> {
    if (!body || !body.context) {
      throw new BadRequestException(
        'ExecutionContext (body.context) is required',
      );
    }
    const ctx = body.context;
    if (!ctx.orgSlug || !ctx.userId) {
      throw new BadRequestException(
        'ExecutionContext must include orgSlug and userId',
      );
    }
    if (ctx.orgSlug === '*') {
      throw new BadRequestException(
        'ExecutionContext.orgSlug cannot be the wildcard "*". Select a specific organization before reviewing a job.',
      );
    }
    // Support both standard ReviewDecisionPayload (body.decision) and
    // per-clause ClauseReviewPayload (body.clauseDecisions). The HITL
    // checkpoint node handles both shapes.
    let decision: ReviewDecisionPayload;

    if (
      Array.isArray(body.clauseDecisions) &&
      body.clauseDecisions.length > 0
    ) {
      // Per-clause review: wrap as a ClauseReviewPayload and store as
      // the review decision. The contract-review HITL node will unwrap it.
      // For the review_decision column (typed as ReviewDecisionPayload),
      // we store it as a 'modify' decision with the clause decisions in
      // editedOutputs so the existing column type is satisfied.
      decision = {
        decision: 'modify',
        editedOutputs: { clauseDecisions: body.clauseDecisions },
      };
    } else {
      decision = body.decision;
      if (!decision || typeof decision !== 'object' || !decision.decision) {
        throw new BadRequestException(
          'body.decision must include a decision field, or body.clauseDecisions must be a non-empty array',
        );
      }
      if (
        !['approve', 'reject', 'modify', 'deepen', 'redirect'].includes(
          decision.decision,
        )
      ) {
        throw new BadRequestException(
          'decision.decision must be one of: approve, reject, modify, deepen, redirect',
        );
      }
      if (
        decision.decision === 'reject' &&
        (!('feedback' in decision) || !decision.feedback)
      ) {
        throw new BadRequestException(
          'decision.feedback is required when decision=reject',
        );
      }
      if (
        decision.decision === 'modify' &&
        (!('editedOutputs' in decision) ||
          !decision.editedOutputs ||
          typeof decision.editedOutputs !== 'object')
      ) {
        throw new BadRequestException(
          'decision.editedOutputs (object) is required when decision=modify',
        );
      }
      if (
        decision.decision === 'deepen' &&
        (!('targetNodeIds' in decision) ||
          !Array.isArray(decision.targetNodeIds) ||
          decision.targetNodeIds.length === 0)
      ) {
        throw new BadRequestException(
          'decision.targetNodeIds (non-empty array) is required when decision=deepen',
        );
      }
      if (decision.decision === 'redirect') {
        if (!('targetNodeId' in decision) || !decision.targetNodeId) {
          throw new BadRequestException(
            'decision.targetNodeId (string) is required when decision=redirect',
          );
        }
        if (
          !('replacementQuestions' in decision) ||
          !Array.isArray(decision.replacementQuestions) ||
          decision.replacementQuestions.length === 0
        ) {
          throw new BadRequestException(
            'decision.replacementQuestions (non-empty array) is required when decision=redirect',
          );
        }
      }
    }

    const access = await this.resolveAccess(ctx.userId, ctx.orgSlug);
    const row = await this.repository.findByIdForOrg(id, ctx.orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${ctx.orgSlug}`);
    }
    if (row.status !== 'awaiting_review') {
      throw new ConflictException(
        `Job ${id} is ${row.status}, not awaiting_review; cannot record a review decision`,
      );
    }

    const updated = await this.repository.recordReviewAndRequeue(
      id,
      ctx.orgSlug,
      decision,
    );
    if (!updated) {
      // Lost the race: another request (or the worker) moved the row
      // between the findByIdForOrg read and the guarded UPDATE.
      throw new ConflictException(
        `Job ${id} is no longer awaiting review; decision rejected`,
      );
    }

    this.logger.log(
      `Job ${id} review recorded (decision=${decision.decision}, org=${ctx.orgSlug}, user=${ctx.userId})`,
    );

    return { jobId: updated.id, status: updated.status };
  }

  /**
   * Cancel a job.
   * - queued / awaiting_review / review_rejected → immediate cancel
   * - processing → deferred cancel (worker checks between node transitions)
   * - completed / failed / canceled → 409
   */
  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelJob(
    @Param('id') id: string,
    @Query('orgSlug') orgSlugQuery: string | undefined,
    @Body() body: { context?: { orgSlug?: string; userId?: string } },
  ): Promise<{ success: true; status: string }> {
    const orgSlug = body?.context?.orgSlug ?? orgSlugQuery;
    if (!orgSlug) {
      throw new BadRequestException(
        'orgSlug is required (body.context.orgSlug or query param)',
      );
    }
    const callerUserId = body?.context?.userId;
    if (callerUserId) {
      const access = await this.resolveAccess(callerUserId, orgSlug);
      const row = await this.repository.findByIdForOrg(id, orgSlug, access);
      if (!row) {
        throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
      }
    }
    const result = await this.repository.cancelJob(id, orgSlug);
    return { success: true, status: result };
  }

  /**
   * Add documents to a completed DD room for incremental analysis.
   * Extracts text, stores originals, injects into the LangGraph thread,
   * and re-queues the job for incremental processing.
   */
  @Post('jobs/:id/add-documents')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('files', MAX_DD_FILES))
  async addDocuments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('orgSlug') orgSlug: string | undefined,
    @Body('callerUserId') callerUserId: string | undefined,
  ): Promise<{
    jobId: string;
    conversationId: string;
    status: string;
    newDocumentCount: number;
    totalDocumentCount: number;
  }> {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug is required');
    }
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'files (multipart field) is required — send one or more files',
      );
    }

    // Validate file limits (same as DD room creation)
    if (files.length > MAX_DD_FILES) {
      throw new BadRequestException(
        `Too many files: ${files.length} exceeds the maximum of ${MAX_DD_FILES}`,
      );
    }
    let totalSize = 0;
    for (const file of files) {
      if (file.size > DD_FILE_SIZE_LIMIT) {
        throw new PayloadTooLargeException(
          `File "${file.originalname}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — exceeds the 50MB per-file limit.`,
        );
      }
      totalSize += file.size;
    }
    if (totalSize > DD_TOTAL_SIZE_LIMIT) {
      throw new PayloadTooLargeException(
        `Total upload size is ${(totalSize / 1024 / 1024).toFixed(0)}MB — exceeds the 1GB limit.`,
      );
    }

    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const job = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!job) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    const inputMetadata = job.input?.metadata as
      | Record<string, unknown>
      | undefined;
    if (inputMetadata?.jobType !== DD_JOB_TYPE) {
      throw new BadRequestException(
        `Job ${id} is not a due-diligence room — add-documents is only supported for DD rooms`,
      );
    }
    if (job.status !== 'completed') {
      throw new ConflictException(
        `Job ${id} is not completed (current status: ${job.status}) — add-documents requires a completed DD room`,
      );
    }

    // Extract text from files
    const visionCtx = {
      orgSlug,
      userId: job.user_id,
      conversationId: job.conversation_id,
      agentSlug: LEGAL_AGENT_SLUG,
      agentType: 'langgraph',
      provider: job.provider,
      model: job.model,
    };

    const extracted = await Promise.all(
      files.map(async (file) => {
        try {
          const result = await this.extractor.extract({
            buffer: file.buffer,
            mimeType: file.mimetype,
            filename: file.originalname,
            context: visionCtx,
          });
          return { file, result };
        } catch (error) {
          throw new BadRequestException(
            `Document extraction failed for "${file.originalname}": ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    // Build documents array for the service
    const newDocuments = extracted.map(({ file, result }) => ({
      name: file.originalname,
      content: result.text,
      type: file.mimetype,
    }));

    // Inject new documents into the LangGraph thread
    const context: import('@orchestrator-ai/transport-types').ExecutionContext =
      {
        orgSlug,
        userId: job.user_id,
        conversationId: job.conversation_id,
        agentSlug: LEGAL_AGENT_SLUG,
        agentType: 'langgraph',
        provider: job.provider,
        model: job.model,
      };

    await this.legalDepartmentService.addDocumentsToThread(
      job.conversation_id,
      context,
      newDocuments,
      job.document_count,
    );

    // Store original files in storage (continue index from existing count)
    const storagePaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      try {
        const storagePath = await this.documentsStorage.storeOriginal(
          job.id,
          `${job.document_count + i}-${file.originalname}`,
          file.buffer,
          file.mimetype,
        );
        storagePaths.push(storagePath);
      } catch (error) {
        this.logger.warn(
          `Failed to persist file[${i}] "${file.originalname}" for job ${job.id}: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
    }

    // Update the job row: append paths, increment count, re-queue
    const updatedJob = await this.repository.addDocumentsToRoom(id, orgSlug, {
      newDocumentPaths: storagePaths,
      newDocumentCount: files.length,
    });

    this.logger.log(
      `Added ${files.length} documents to DD room ${id} (total: ${updatedJob.document_count})`,
    );

    return {
      jobId: updatedJob.id,
      conversationId: updatedJob.conversation_id,
      status: 'processing',
      newDocumentCount: files.length,
      totalDocumentCount: updatedJob.document_count,
    };
  }

  /**
   * Streams the persisted original file bytes for a job. Org-scoped via the
   * same repository check as the metadata GET, so we don't need an
   * out-of-band signed URL — the API itself is the access boundary.
   */
  @Get('jobs/:id/file')
  async getOriginalFile(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    if (!row.original_file_path) {
      throw new NotFoundException(
        `Job ${id} has no persisted original file. The modal falls back to extracted text.`,
      );
    }
    let bytes: { data: Buffer; contentType: string };
    try {
      bytes = await this.documentsStorage.downloadOriginal(
        row.original_file_path,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to download original file for job ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new NotFoundException(
        `Original file for job ${id} could not be retrieved from storage.`,
      );
    }
    // Best-effort filename for inline display in browsers
    const filename = row.original_file_path.split('/').slice(-1)[0] ?? 'file';
    res.setHeader(
      'Content-Type',
      bytes.contentType || 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/"/g, '')}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(bytes.data);
  }

  /**
   * Durable observability event history for a job. Live tailing is provided
   * by the existing GET /observability/stream?conversationId=… endpoint;
   * this one returns everything that has already been persisted.
   */
  @Get('jobs/:id/events')
  async events(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    const events = await this.repository.listEventsForConversation(
      row.conversation_id,
    );
    return { events };
  }

  /**
   * GET /legal-department/jobs/:id/document-index — reads the document
   * index from the DD room's graph state checkpoint.
   *
   * Returns the current classification and analysis status for every
   * document in the room. Only meaningful for due-diligence job types.
   */
  @Get('jobs/:id/document-index')
  async documentIndex(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }

    // Read the DD graph state from the checkpointer
    const graph = this.legalDepartmentService.getGraph(DD_JOB_TYPE);
    const snapshot = await graph.getState({
      configurable: { thread_id: row.conversation_id },
    });
    const values = (snapshot?.values ?? {}) as Record<string, unknown>;
    const documentIndex = (values.documentIndex ?? []) as Array<
      Record<string, unknown>
    >;
    const documentsAnalyzed = (values.documentsAnalyzed ?? []) as string[];
    const documentsFailed = (values.documentsFailed ?? {}) as Record<
      string,
      string
    >;

    return {
      documentIndex,
      totalDocuments: documentIndex.length,
      analyzed: documentsAnalyzed.length,
      failed: Object.keys(documentsFailed).length,
      pending:
        documentIndex.length -
        documentsAnalyzed.length -
        Object.keys(documentsFailed).length,
    };
  }

  /**
   * GET /legal-department/jobs/:id/risk-matrix — reads the risk matrix
   * from the DD room's synthesis output. Returns 404 if synthesis hasn't run.
   */
  @Get('jobs/:id/risk-matrix')
  async riskMatrix(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }

    const graph = this.legalDepartmentService.getGraph(DD_JOB_TYPE);
    const snapshot = await graph.getState({
      configurable: { thread_id: row.conversation_id },
    });
    const values = (snapshot?.values ?? {}) as Record<string, unknown>;

    if (!values.riskMatrix) {
      throw new NotFoundException(
        `Risk matrix not yet available for job ${id}. Synthesis must complete first.`,
      );
    }

    return {
      riskMatrix: values.riskMatrix,
      dealBreakerFlags: values.dealBreakerFlags ?? [],
      perCategoryAnalysis: values.perCategoryAnalysis ?? {},
      missingDocuments: values.missingDocuments ?? [],
      crossReferenceMap: values.crossReferenceMap ?? [],
      // Financial Findings panel (DD Financial Analysis — Phase 6) needs the
      // per-specialist running findings and the per-document tabular outputs
      // from cap-table / working-capital / debt-schedule specialists to render
      // its tables. Return them here rather than adding a second endpoint.
      runningFindings: values.runningFindings ?? {},
      perDocumentOutputs: values.perDocumentOutputs ?? {},
    };
  }

  /**
   * GET /legal-department/jobs/:id/report — returns the final DD report
   * as markdown. Only available after report generation completes.
   */
  @Get('jobs/:id/report')
  async report(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }

    const graph = this.legalDepartmentService.getGraph(DD_JOB_TYPE);
    const snapshot = await graph.getState({
      configurable: { thread_id: row.conversation_id },
    });
    const values = (snapshot?.values ?? {}) as Record<string, unknown>;

    if (!values.report) {
      throw new NotFoundException(
        `Report not yet available for job ${id}. Report generation must complete first.`,
      );
    }

    return { report: values.report };
  }

  /**
   * Multipart upload entry point — Phase 3: accepts 1–MAX_FILES files.
   *
   * Each file is routed through DocumentExtractionRouter to produce plain
   * text. All extracted texts are checked against MAX_INPUT_TOKENS
   * combined. Each original file is persisted to storage.
   *
   * The legacy single-file curl shape (`-F "file=@..."`) still works
   * because FilesInterceptor('files') also captures a field named 'file'
   * when the client sends a single file — but callers SHOULD migrate to
   * the `files` field name. The JSON body enqueue path is unchanged.
   */
  @Post('jobs/upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('files', MAX_DD_FILES))
  async upload(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('context') contextJson: string | undefined,
    @Body('capabilitySlug') capabilitySlug: string | undefined,
    @Body('dealContext') dealContextJson: string | undefined,
    @Body('auditContext') auditContextJson: string | undefined,
    @Body('metadata') metadataJson: string | undefined,
    @Body('accessControl') accessControlJson: string | undefined,
  ): Promise<EnqueueJobResponse & { documentCount?: number }> {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'files (multipart field) is required — send one or more files via the "files" multipart field',
      );
    }

    // Parse metadata to check if this is a DD room upload
    let metadata: Record<string, unknown> | undefined;
    if (metadataJson) {
      try {
        metadata = JSON.parse(metadataJson) as Record<string, unknown>;
      } catch {
        throw new BadRequestException('metadata is not valid JSON');
      }
    }
    const isDDRoom = metadata?.jobType === DD_JOB_TYPE;
    const isComplianceAudit = metadata?.jobType === COMPLIANCE_AUDIT_JOB_TYPE;

    // Parse optional access control for DD rooms
    let parsedAccessControl: AccessControl | undefined;
    if (accessControlJson) {
      try {
        parsedAccessControl = JSON.parse(accessControlJson) as AccessControl;
      } catch {
        throw new BadRequestException('accessControl is not valid JSON');
      }
      if (!['open', 'allowlist'].includes(parsedAccessControl.mode)) {
        throw new BadRequestException(
          "accessControl.mode must be 'open' or 'allowlist'",
        );
      }
      if (
        parsedAccessControl.mode === 'allowlist' &&
        !Array.isArray(parsedAccessControl.allowedUserIds)
      ) {
        throw new BadRequestException(
          'accessControl.allowedUserIds must be an array when mode is allowlist',
        );
      }
    }

    // Enforce file count limits based on job type
    const fileLimit = isDDRoom ? MAX_DD_FILES : MAX_FILES;
    if (files.length > fileLimit) {
      throw new BadRequestException(
        `Too many files: ${files.length} exceeds the maximum of ${fileLimit} per ${isDDRoom ? 'DD room' : 'job'}`,
      );
    }

    // DD room size enforcement: 50MB per file, 1GB total
    if (isDDRoom) {
      let totalSize = 0;
      for (const file of files) {
        if (file.size > DD_FILE_SIZE_LIMIT) {
          throw new PayloadTooLargeException(
            `File "${file.originalname}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — exceeds the 50MB per-file limit for DD rooms.`,
          );
        }
        totalSize += file.size;
      }
      if (totalSize > DD_TOTAL_SIZE_LIMIT) {
        throw new PayloadTooLargeException(
          `Total upload size is ${(totalSize / 1024 / 1024).toFixed(0)}MB — exceeds the 1GB limit for DD rooms.`,
        );
      }
    }
    if (!contextJson) {
      throw new BadRequestException(
        'context (multipart field, JSON string) is required',
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contextJson);
    } catch (error) {
      throw new BadRequestException(
        `context is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('context must be a JSON object');
    }
    const ctxCandidate = parsed as Record<string, unknown>;
    const orgSlug =
      typeof ctxCandidate.orgSlug === 'string' ? ctxCandidate.orgSlug : '';
    const userId =
      typeof ctxCandidate.userId === 'string' ? ctxCandidate.userId : '';
    const provider =
      typeof ctxCandidate.provider === 'string' ? ctxCandidate.provider : '';
    const model =
      typeof ctxCandidate.model === 'string' ? ctxCandidate.model : '';
    if (!orgSlug || !userId || !provider || !model) {
      throw new BadRequestException(
        'ExecutionContext must include orgSlug, userId, provider, and model',
      );
    }
    if (orgSlug === '*') {
      throw new BadRequestException(
        'ExecutionContext.orgSlug cannot be the wildcard "*". Select a specific organization before uploading a document.',
      );
    }

    const conversationId = randomUUID();

    // Build a vision-capable context shape for the extractor router so a
    // scanned PDF or image can fall through to vision extraction with the
    // right attribution.
    const visionCtx = {
      orgSlug,
      userId,
      conversationId,
      agentSlug: LEGAL_AGENT_SLUG,
      agentType: 'langgraph',
      provider,
      model,
    };

    // Extract all files in parallel.
    const extracted = await Promise.all(
      files.map(async (file) => {
        try {
          const result = await this.extractor.extract({
            buffer: file.buffer,
            mimeType: file.mimetype,
            filename: file.originalname,
            context: visionCtx,
          });
          return { file, result };
        } catch (error) {
          throw new BadRequestException(
            `Document extraction failed for "${file.originalname}": ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    // Token budget check: DD rooms skip this because documents are processed
    // individually in the graph, not all at once. Non-DD jobs check combined.
    if (!isDDRoom) {
      const combinedText = extracted.map((e) => e.result.text).join('\n\n');
      this.assertWithinInputBudget(combinedText, model);
    }

    // Build the documents array for the job input.
    const documents = extracted.map(({ file, result }) => ({
      content: result.text,
      contentType: 'text/plain',
      filename: file.originalname,
      mimeType: file.mimetype,
      extractorMetadata: result.metadata,
    }));

    // For back-compat, also expose the first doc's content as the top-level
    // `content` field so legacy code paths that read data.content still work.
    const primaryContent = documents[0]?.content ?? '';

    // Parse dealContext for DD rooms
    let dealContext: Record<string, unknown> | undefined;
    if (isDDRoom && dealContextJson) {
      try {
        dealContext = JSON.parse(dealContextJson) as Record<string, unknown>;
      } catch {
        throw new BadRequestException('dealContext is not valid JSON');
      }
    }

    // Parse auditContext for compliance audits
    let auditContext: Record<string, unknown> | undefined;
    if (isComplianceAudit && auditContextJson) {
      try {
        auditContext = JSON.parse(auditContextJson) as Record<string, unknown>;
      } catch {
        throw new BadRequestException('auditContext is not valid JSON');
      }
      if (
        !auditContext.frameworkSlugs ||
        !Array.isArray(auditContext.frameworkSlugs) ||
        (auditContext.frameworkSlugs as unknown[]).length === 0
      ) {
        throw new BadRequestException(
          'auditContext.frameworkSlugs is required and must be a non-empty array',
        );
      }
    }

    const enqueueRequest: EnqueueJobRequest = {
      context: {
        orgSlug,
        userId,
        conversationId,
        agentSlug: LEGAL_AGENT_SLUG,
        agentType: 'langgraph',
        provider,
        model,
      },
      data: {
        content: primaryContent,
        contentType: 'text/plain',
        filename: files[0]!.originalname,
        mimeType: files[0]!.mimetype,
        capabilitySlug: capabilitySlug ?? 'document-onboarding',
        extractorMetadata: extracted[0]!.result.metadata,
        documents,
        document_count: documents.length,
        ...(dealContext && { dealContext }),
        ...(auditContext && { auditContext }),
      },
      ...(metadata && { metadata }),
    };

    const row = await this.repository.insertQueued(
      enqueueRequest,
      conversationId,
      parsedAccessControl,
    );

    // Persist all original files to storage. document_paths[i] corresponds
    // to documents[i]. Best-effort: a storage failure doesn't abort the job.
    const storagePaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      try {
        const storagePath = await this.documentsStorage.storeOriginal(
          row.id,
          `${i}-${file.originalname}`,
          file.buffer,
          file.mimetype,
        );
        storagePaths.push(storagePath);
      } catch (error) {
        this.logger.warn(
          `Failed to persist file[${i}] "${file.originalname}" for job ${row.id}: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
    }

    // Write storage paths back to the row.
    if (storagePaths.length > 0) {
      try {
        await this.repository.updateDocumentPaths(row.id, storagePaths);
        // Back-compat: also set original_file_path to the first path.
        await this.repository.updateOriginalFilePath(row.id, storagePaths[0]!);
      } catch (error) {
        this.logger.warn(
          `Failed to update document_paths for job ${row.id}: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
    }

    this.logger.log(
      `Enqueued upload job ${row.id} (files=${files.map((f) => f.originalname).join(', ')}, document_count=${documents.length}${isDDRoom ? ', type=due-diligence' : ''})`,
    );

    if (parsedAccessControl?.mode === 'allowlist') {
      this.emitAccessControlEvent(
        enqueueRequest.context,
        conversationId,
        row.id,
        { mode: 'open' },
        parsedAccessControl,
      );
    }

    return {
      jobId: row.id,
      conversationId: row.conversation_id,
      status: row.status,
      ...(isDDRoom && { documentCount: documents.length }),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Capability model config (settings page)
  // ─────────────────────────────────────────────────────────────────────

  @Get('capabilities/:slug/models')
  async getCapabilityModels(@Param('slug') slug: string) {
    const rows = await this.capabilityConfig.listForCapability(slug);
    return { capability: slug, roles: rows };
  }

  @Put('capabilities/:slug/models')
  async putCapabilityModel(
    @Param('slug') slug: string,
    @Body()
    body: { role?: string; provider?: string | null; model?: string | null },
  ) {
    if (
      !body ||
      !body.role ||
      !VALID_ROLES.includes(body.role as CapabilityRole)
    ) {
      throw new BadRequestException(
        `body.role must be one of: ${VALID_ROLES.join(', ')}`,
      );
    }
    const row = await this.capabilityConfig.upsert(
      slug,
      body.role as CapabilityRole,
      body.provider ?? null,
      body.model ?? null,
    );
    // Refresh the in-memory cache so the worker picks the change up immediately.
    const all = await this.capabilityConfig.listForCapability(slug);
    setCapabilityModelConfig(all);
    return row;
  }

  /**
   * GET /legal-department/jobs/:id/reasoning?orgSlug=…
   *   → probe: returns list of specialist keys that have captured reasoning.
   *   → Returns 200 with { jobId, specialistKeys: string[] } — empty array
   *     when no reasoning was captured (non-reasoning model, or Phase 4.5 not yet landed).
   *
   * GET /legal-department/jobs/:id/reasoning?orgSlug=…&specialistKey=…
   *   → fetch: returns the thinking content for a specific specialist.
   *   → Returns 200 with { jobId, specialistKey, thinkingContent, thinkingDurationMs, thinkingTokenCount }
   *     or 404 when no reasoning was captured for that specialist.
   */
  @Get('jobs/:id/reasoning')
  async reasoning(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
    @Query('specialistKey') specialistKey: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug, access);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }

    if (!specialistKey) {
      // Probe mode: return list of specialist keys with reasoning
      const specialistKeys =
        await this.repository.listSpecialistKeysWithReasoning(id, orgSlug);
      return { jobId: id, specialistKeys };
    }

    // Fetch mode: return reasoning for a specific specialist
    const reasoning = await this.repository.findReasoningForSpecialist(
      id,
      orgSlug,
      specialistKey,
    );

    if (!reasoning) {
      throw new NotFoundException(
        `No reasoning captured for specialist "${specialistKey}" on job ${id}. ` +
          `The specialist may have run on a non-reasoning model, or the provider has not yet ` +
          `been wired for reasoning capture (Phase 4.5).`,
      );
    }

    return {
      jobId: id,
      specialistKey,
      thinkingContent: reasoning.thinkingContent,
      thinkingDurationMs: reasoning.thinkingDurationMs,
      thinkingTokenCount: reasoning.thinkingTokenCount,
    };
  }

  /**
   * POST /legal-department/jobs/:id/generate-deal-memo
   *
   * Queue a new deal-memo job whose parent is a completed DD Room. The memo
   * workflow reads the parent's DD checkpoint snapshot read-only and drafts
   * an acquisition-agreement memo. See:
   * docs/efforts/current/dd-deal-memo-generation/prd.md §4.3
   */
  @Post('jobs/:id/generate-deal-memo')
  @HttpCode(HttpStatus.ACCEPTED)
  async generateDealMemo(
    @Param('id') parentJobId: string,
    @Body()
    body: {
      context?: {
        orgSlug?: string;
        userId?: string;
        provider?: string;
        model?: string;
      };
      dealStructure?: DealStructure;
      reviewerNotes?: string;
    },
  ): Promise<EnqueueJobResponse> {
    if (!body || !body.context) {
      throw new BadRequestException(
        'ExecutionContext (body.context) is required',
      );
    }
    const ctx = body.context;
    if (!ctx.orgSlug || !ctx.userId) {
      throw new BadRequestException(
        'ExecutionContext must include orgSlug and userId',
      );
    }
    if (ctx.orgSlug === '*') {
      throw new BadRequestException(
        'ExecutionContext.orgSlug cannot be the wildcard "*". Select a specific organization before generating a deal memo.',
      );
    }
    if (
      !body.dealStructure ||
      !VALID_DEAL_STRUCTURES.includes(body.dealStructure)
    ) {
      throw new BadRequestException(
        `dealStructure is required and must be one of: ${VALID_DEAL_STRUCTURES.join(', ')}`,
      );
    }

    const access = await this.resolveAccess(ctx.userId, ctx.orgSlug);
    const parent = await this.repository.findByIdForOrg(
      parentJobId,
      ctx.orgSlug,
      access,
    );
    if (!parent) {
      throw new NotFoundException(
        `Job ${parentJobId} not found in org ${ctx.orgSlug}`,
      );
    }
    const parentMetadata = parent.input?.metadata as
      | Record<string, unknown>
      | undefined;
    if (parentMetadata?.jobType !== DD_JOB_TYPE) {
      throw new ConflictException(
        `Job ${parentJobId} is not a due-diligence room — deal memos can only be generated from completed DD rooms`,
      );
    }
    if (parent.status !== 'completed') {
      throw new ConflictException(
        `Job ${parentJobId} is not completed (current status: ${parent.status}) — deal memos require a completed DD room`,
      );
    }

    // Mint a new conversationId for the memo's LangGraph thread. The memo
    // reads the parent's thread read-only via parentConversationId.
    const memoConversationId = randomUUID();
    const enqueueRequest: EnqueueJobRequest = {
      context: {
        orgSlug: ctx.orgSlug,
        userId: ctx.userId,
        conversationId: memoConversationId,
        agentSlug: LEGAL_AGENT_SLUG,
        agentType: 'langgraph',
        provider: ctx.provider ?? parent.provider,
        model: ctx.model ?? parent.model,
      },
      data: {
        content: '', // memo has no primary content; parent is the data source
        parentJobId,
        parentConversationId: parent.conversation_id,
        dealStructure: body.dealStructure,
        ...(body.reviewerNotes && { reviewerNotes: body.reviewerNotes }),
      },
      metadata: {
        jobType: DEAL_MEMO_JOB_TYPE,
      },
    };

    const row = await this.repository.insertQueued(
      enqueueRequest,
      memoConversationId,
    );

    this.logger.log(
      `Enqueued deal-memo job ${row.id} (parent=${parentJobId}, structure=${body.dealStructure}, conv=${row.conversation_id})`,
    );

    return {
      jobId: row.id,
      conversationId: row.conversation_id,
      status: row.status,
    };
  }

  /**
   * GET /legal-department/jobs/:id/deal-memo
   *
   * Returns the finalized memo's markdown + per-section citations + both
   * stored artifact paths. Only valid for completed deal-memo jobs.
   *
   * Org scoping: the underlying `findByIdForOrg` already filters by
   * orgSlug, so a cross-org caller gets a clean 404.
   */
  @Get('jobs/:id/deal-memo')
  async getDealMemo(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
  ): Promise<{
    jobId: string;
    status: JobStatus;
    memoMarkdown: string;
    sectionCitations: Record<string, unknown[]>;
    artifactPath?: string;
    docxArtifactPath?: string;
    dealStructure?: DealStructure;
    parentJobId?: string;
  }> {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    const row = await this.repository.findByIdForOrg(id, orgSlug);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    const metadata = row.input?.metadata as Record<string, unknown> | undefined;
    if (metadata?.jobType !== DEAL_MEMO_JOB_TYPE) {
      throw new ConflictException(
        `Job ${id} is not a deal-memo job (jobType=${typeof metadata?.jobType === 'string' ? metadata.jobType : 'unknown'})`,
      );
    }
    // Check parent DD room access
    const inputData = row.input?.data as Record<string, unknown> | undefined;
    const parentJobId = inputData?.parentJobId as string | undefined;
    if (parentJobId) {
      const parent = await this.repository.findByIdForOrg(
        parentJobId,
        orgSlug,
        access,
      );
      if (!parent) {
        throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
      }
    }
    if (row.status !== 'completed') {
      throw new ConflictException(
        `Deal memo ${id} is not completed (current status: ${row.status})`,
      );
    }
    const result = row.result ?? {};
    const memoMarkdown = result.memoMarkdown as string | undefined;
    if (!memoMarkdown) {
      // Completed deal-memo jobs without memoMarkdown indicate a finalize
      // path that didn't write the result — fail loud rather than return
      // an empty document.
      throw new ConflictException(
        `Deal memo ${id} is marked completed but result.memoMarkdown is missing`,
      );
    }
    return {
      jobId: row.id,
      status: row.status,
      memoMarkdown,
      sectionCitations: (result.sectionCitations ?? {}) as Record<
        string,
        unknown[]
      >,
      artifactPath: result.artifactPath as string | undefined,
      docxArtifactPath: result.docxArtifactPath as string | undefined,
      dealStructure: inputData?.dealStructure as DealStructure | undefined,
      parentJobId: inputData?.parentJobId as string | undefined,
    };
  }

  /**
   * GET /legal-department/jobs/:id/deal-memo/download?format=md|docx
   *
   * Streams the persisted artifact through this org-scoped proxy. We never
   * mint a vendor-specific signed URL — the API itself is the access
   * boundary, matching how `GET /jobs/:id/file` works for DD originals.
   *
   * 404 cross-org / missing job; 409 wrong jobType / not completed; 400
   * unknown format; 404 if the artifact path is unset (older row).
   */
  @Get('jobs/:id/deal-memo/download')
  async downloadDealMemo(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('callerUserId') callerUserId: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const callerId = this.requireUserId(callerUserId);
    const access = await this.resolveAccess(callerId, orgSlug);
    if (format !== 'md' && format !== 'docx') {
      throw new BadRequestException(
        `format must be 'md' or 'docx' (got ${format ?? 'undefined'})`,
      );
    }
    const row = await this.repository.findByIdForOrg(id, orgSlug);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    // Parent access check for deal memos
    const rowInputData = row.input?.data as Record<string, unknown> | undefined;
    const parentId = rowInputData?.parentJobId as string | undefined;
    if (parentId) {
      const parent = await this.repository.findByIdForOrg(
        parentId,
        orgSlug,
        access,
      );
      if (!parent) {
        throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
      }
    }
    const metadata = row.input?.metadata as Record<string, unknown> | undefined;
    if (metadata?.jobType !== DEAL_MEMO_JOB_TYPE) {
      throw new ConflictException(
        `Job ${id} is not a deal-memo job (jobType=${typeof metadata?.jobType === 'string' ? metadata.jobType : 'unknown'})`,
      );
    }
    if (row.status !== 'completed') {
      throw new ConflictException(
        `Deal memo ${id} is not completed (current status: ${row.status})`,
      );
    }
    const result = row.result ?? {};
    const path =
      format === 'md'
        ? (result.artifactPath as string | undefined)
        : (result.docxArtifactPath as string | undefined);
    if (!path) {
      throw new NotFoundException(
        `Deal memo ${id} has no stored ${format.toUpperCase()} artifact (was the job completed before Phase 4 shipped?).`,
      );
    }
    const bytes = await this.dealMemoArtifactService.downloadArtifact(path);
    const filename = `deal-memo-${id}.${format}`;
    res.setHeader('Content-Type', MEMO_ARTIFACT_CONTENT_TYPES[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(bytes.data);
  }

  @Patch('jobs/:id/access-control')
  @HttpCode(HttpStatus.OK)
  async updateAccessControl(
    @Param('id') id: string,
    @Body() body: UpdateAccessControlRequest,
  ): Promise<UpdateAccessControlResponse> {
    if (!body?.context?.orgSlug || !body?.context?.userId) {
      throw new BadRequestException(
        'ExecutionContext with orgSlug and userId is required',
      );
    }
    const { context, accessControl } = body;
    if (!accessControl || !['open', 'allowlist'].includes(accessControl.mode)) {
      throw new BadRequestException(
        "accessControl.mode must be 'open' or 'allowlist'",
      );
    }
    if (
      accessControl.mode === 'allowlist' &&
      !Array.isArray(accessControl.allowedUserIds)
    ) {
      throw new BadRequestException(
        'accessControl.allowedUserIds must be an array when mode is allowlist',
      );
    }

    const row = await this.repository.findByIdForOrg(id, context.orgSlug);
    if (!row) {
      throw new NotFoundException(
        `Job ${id} not found in org ${context.orgSlug}`,
      );
    }

    const isAdmin = await this.adminLookup.isOrgAdmin(
      context.userId,
      context.orgSlug,
    );
    const canRead = isAccessAllowed(row, context.userId, isAdmin);
    if (!canRead) {
      throw new NotFoundException(
        `Job ${id} not found in org ${context.orgSlug}`,
      );
    }
    const canManage = context.userId === row.user_id || isAdmin;
    if (!canManage) {
      throw new ForbiddenException(
        'Only the room creator or an org admin can manage access control',
      );
    }

    const previousAc = row.access_control;
    const updated = await this.repository.updateAccessControl(
      id,
      context.orgSlug,
      accessControl,
    );

    this.emitAccessControlEvent(
      context,
      row.conversation_id,
      row.id,
      previousAc,
      accessControl,
    );

    return { jobId: updated.id, accessControl: updated.access_control };
  }

  private emitAccessControlEvent(
    context: import('@orchestrator-ai/transport-types').ExecutionContext,
    threadId: string,
    jobId: string,
    previous: AccessControl,
    next: AccessControl,
  ): void {
    this.observability
      .emit({
        context,
        threadId,
        status: 'processing',
        message: 'Access control changed',
        step: 'access_control',
        metadata: {
          eventType: 'access_control.changed',
          jobId,
          actorUserId: context.userId,
          previousMode: previous.mode,
          previousAllowedUserIds: previous.allowedUserIds ?? [],
          newMode: next.mode,
          newAllowedUserIds: next.allowedUserIds ?? [],
        },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Failed to emit access_control.changed event for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // Reference for unused-import linting
  private readonly _docAnalysisType = DOCUMENT_ANALYSIS_JOB_TYPE;

  /**
   * Throws a typed 413 if the input would exceed `MAX_INPUT_TOKENS`.
   * Used by both /jobs (JSON) and /jobs/upload (multipart) so the two
   * entry points share the same outer ceiling.
   */
  private assertWithinInputBudget(content: string, model: string): void {
    const tokens = countTokens(content, model);
    if (tokens > MAX_INPUT_TOKENS) {
      throw new PayloadTooLargeException({
        error: 'input_too_large',
        message: `Document is too large to analyze: ${tokens} tokens exceeds the ${MAX_INPUT_TOKENS}-token limit.`,
        tokens,
        maxTokens: MAX_INPUT_TOKENS,
      });
    }
  }
}
