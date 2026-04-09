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
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { countTokens, MAX_INPUT_TOKENS } from '../services/token-count.util';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';

/** Maximum number of files accepted per upload request (Phase 3). */
const MAX_FILES = 10;
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
      userId: userId || undefined,
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
        documentsSummary: (values.documents ?? []).map((d, i) => ({
          name: d.name,
          type: values.documentsMetadata?.[i]?.documentType?.type ?? d.type,
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
    @Body() body: { context?: { orgSlug?: string } },
  ): Promise<{ success: true; status: string }> {
    const orgSlug = body?.context?.orgSlug ?? orgSlugQuery;
    if (!orgSlug) {
      throw new BadRequestException('orgSlug is required (body.context.orgSlug or query param)');
    }
    const result = await this.repository.cancelJob(id, orgSlug);
    return { success: true, status: result };
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
  @UseInterceptors(FilesInterceptor('files', MAX_FILES))
  async upload(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('context') contextJson: string | undefined,
    @Body('capabilitySlug') capabilitySlug: string | undefined,
  ): Promise<EnqueueJobResponse> {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'files (multipart field) is required — send one or more files via the "files" multipart field',
      );
    }
    if (files.length > MAX_FILES) {
      throw new BadRequestException(
        `Too many files: ${files.length} exceeds the maximum of ${MAX_FILES} per job`,
      );
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

    // Token budget check: sum of all extracted texts must fit within
    // MAX_INPUT_TOKENS. This is the combined ceiling across all documents.
    const combinedText = extracted.map((e) => e.result.text).join('\n\n');
    this.assertWithinInputBudget(combinedText, model);

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
      },
    };

    const row = await this.repository.insertQueued(
      enqueueRequest,
      conversationId,
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
      `Enqueued upload job ${row.id} (files=${files.map((f) => f.originalname).join(', ')}, document_count=${documents.length})`,
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
    @Query('specialistKey') specialistKey: string | undefined,
  ) {
    if (!orgSlug) {
      throw new BadRequestException('orgSlug query parameter is required');
    }

    // Verify job exists and is org-scoped
    const row = await this.repository.findByIdForOrg(id, orgSlug);
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
