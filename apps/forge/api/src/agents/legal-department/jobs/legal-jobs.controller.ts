/**
 * LegalJobsController — async job endpoints for the Legal Department workspace.
 *
 * No JWT guard: ExecutionContext arrives in the request body, matching the
 * existing LegalDepartmentController. Org scoping is enforced by the
 * repository (every read filters by ctx.orgSlug).
 *
 * Routes:
 *   POST   /legal-department/jobs           — enqueue a new document-analysis job
 *   GET    /legal-department/jobs           — list jobs for caller's org
 *   GET    /legal-department/jobs/:id       — fetch one job
 *   GET    /legal-department/jobs/:id/events — (Phase 2) durable event history
 *
 * See: docs/efforts/current/prd.md §4.3
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
  Query,
} from '@nestjs/common';
import { LegalJobsRepository } from './legal-jobs.repository';
import {
  EnqueueJobRequest,
  EnqueueJobResponse,
  JobStatus,
  ListJobsResponse,
} from './legal-jobs.types';

const VALID_STATUSES: ReadonlyArray<JobStatus> = [
  'queued',
  'processing',
  'completed',
  'failed',
];

@Controller('legal-department/jobs')
export class LegalJobsController {
  private readonly logger = new Logger(LegalJobsController.name);

  constructor(private readonly repository: LegalJobsRepository) {}

  @Post()
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

  @Get()
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

  @Get(':id')
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
  @Get(':id/events')
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
}
