/**
 * LegalJobsController — async job + capability config endpoints for the
 * Legal Department workspace.
 *
 * No JWT guard: ExecutionContext arrives in the request body. Org scoping is
 * enforced by the repository (every read filters by ctx.orgSlug).
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
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';
import { LegalJobsRepository } from './legal-jobs.repository';
import {
  LegalCapabilityConfigRepository,
  type CapabilityRole,
} from './legal-capability-config.repository';
import { LegalDocumentsStorageService } from './legal-documents-storage.service';
import { setCapabilityModelConfig } from '../config/legal-model-config';
import { LegalDepartmentService } from '../legal-department.service';
import type { LegalDepartmentState } from '../legal-department.state';
import {
  DOCUMENT_ANALYSIS_JOB_TYPE,
  EnqueueJobRequest,
  EnqueueJobResponse,
  JobStatus,
  LEGAL_AGENT_SLUG,
  ListJobsResponse,
  ReviewJobRequest,
  ReviewJobResponse,
} from './legal-jobs.types';

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
];

@Controller('legal-department')
export class LegalJobsController {
  private readonly logger = new Logger(LegalJobsController.name);

  constructor(
    private readonly repository: LegalJobsRepository,
    private readonly capabilityConfig: LegalCapabilityConfigRepository,
    private readonly extractor: DocumentExtractionRouter,
    private readonly documentsStorage: LegalDocumentsStorageService,
    private readonly legalDepartmentService: LegalDepartmentService,
  ) {}

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
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
  ): Promise<ListJobsResponse> {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    let parsedStatus: JobStatus | undefined;
    if (status) {
      if (!VALID_STATUSES.includes(status as JobStatus)) {
        throw new BadRequestException(
          `status must be one of: ${VALID_STATUSES.join(', ')}`,
        );
      }
      parsedStatus = status as JobStatus;
    }
    const jobs = await this.repository.listForOrg(orgSlug, {
      status: parsedStatus,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return { jobs };
  }

  @Get('jobs/:id')
  async get(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const row = await this.repository.findByIdForOrg(id, orgSlug);
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
        }
      | undefined;
    if (row.status === 'awaiting_review') {
      const graph = this.legalDepartmentService.getGraph();
      const snapshot = await graph.getState({
        configurable: { thread_id: row.conversation_id },
      });
      const values = (snapshot?.values ?? {}) as LegalDepartmentState;
      reviewPayload = {
        specialistOutputs: values.specialistOutputs ?? {},
        synthesis: values.orchestration?.synthesis,
        documentsSummary: (values.documents ?? []).map((d) => ({
          name: d.name,
          type: d.type,
          length: d.content?.length ?? 0,
        })),
      };
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
    const decision = body.decision;
    if (!decision || typeof decision !== 'object' || !decision.decision) {
      throw new BadRequestException(
        'body.decision must include a decision field',
      );
    }
    if (!['approve', 'reject', 'modify'].includes(decision.decision)) {
      throw new BadRequestException(
        'decision.decision must be one of: approve, reject, modify',
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

    // Load to produce a useful 404 vs 409 distinction.
    const row = await this.repository.findByIdForOrg(id, ctx.orgSlug);
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
   * Streams the persisted original file bytes for a job. Org-scoped via the
   * same repository check as the metadata GET, so we don't need an
   * out-of-band signed URL — the API itself is the access boundary.
   */
  @Get('jobs/:id/file')
  async getOriginalFile(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const row = await this.repository.findByIdForOrg(id, orgSlug);
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
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }
    const row = await this.repository.findByIdForOrg(id, orgSlug);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    const events = await this.repository.listEventsForConversation(
      row.conversation_id,
    );
    return { events };
  }

  /**
   * Multipart upload entry point.
   *
   * Accepts a single file plus a `context` form field containing the
   * ExecutionContext as a JSON string. The file is routed through the
   * global DocumentExtractionRouter (text/pdf/docx/pptx/json/csv/image/...)
   * to produce plain text, which becomes the job's `data.content`.
   */
  @Post('jobs/upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('context') contextJson: string | undefined,
    @Body('capabilitySlug') capabilitySlug: string | undefined,
  ): Promise<EnqueueJobResponse> {
    if (!file) {
      throw new BadRequestException('file (multipart field) is required');
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

    let extracted;
    try {
      extracted = await this.extractor.extract({
        buffer: file.buffer,
        mimeType: file.mimetype,
        filename: file.originalname,
        context: visionCtx,
      });
    } catch (error) {
      throw new BadRequestException(
        `Document extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const enqueueRequest: EnqueueJobRequest = {
      context: {
        orgSlug,
        userId,
        conversationId, // server-side id wins
        agentSlug: LEGAL_AGENT_SLUG,
        agentType: 'langgraph',
        provider,
        model,
      },
      data: {
        content: extracted.text,
        contentType: 'text/plain',
        filename: file.originalname,
        mimeType: file.mimetype,
        capabilitySlug: capabilitySlug ?? 'document-onboarding',
        extractorMetadata: extracted.metadata,
      },
    };

    const row = await this.repository.insertQueued(
      enqueueRequest,
      conversationId,
    );

    // Persist the original bytes to storage so the modal's Source section
    // can render the actual document the user dropped (not just the
    // extracted text). Best-effort: if the storage write fails, the job
    // still succeeds — the modal falls back to extracted text.
    try {
      const storagePath = await this.documentsStorage.storeOriginal(
        row.id,
        file.originalname,
        file.buffer,
        file.mimetype,
      );
      await this.repository.updateOriginalFilePath(row.id, storagePath);
    } catch (error) {
      this.logger.warn(
        `Failed to persist original file for job ${row.id}: ${error instanceof Error ? error.message : String(error)}. Modal will fall back to extracted text.`,
      );
    }

    this.logger.log(
      `Enqueued upload job ${row.id} (file=${file.originalname}, ${file.size} bytes, extractor=${extracted.metadata.extractor ?? 'unknown'})`,
    );

    return {
      jobId: row.id,
      conversationId: row.conversation_id,
      status: row.status,
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

  // Reference for unused-import linting
  private readonly _docAnalysisType = DOCUMENT_ANALYSIS_JOB_TYPE;
}
