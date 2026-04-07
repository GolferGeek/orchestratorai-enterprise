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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';
import { LegalJobsRepository } from './legal-jobs.repository';
import {
  LegalCapabilityConfigRepository,
  type CapabilityRole,
} from './legal-capability-config.repository';
import { setCapabilityModelConfig } from '../config/legal-model-config';
import {
  DOCUMENT_ANALYSIS_JOB_TYPE,
  EnqueueJobRequest,
  EnqueueJobResponse,
  JobStatus,
  LEGAL_AGENT_SLUG,
  ListJobsResponse,
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
    return row;
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
