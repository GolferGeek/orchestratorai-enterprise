import {
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ParticipantDetail, RunTrace } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { WorkflowRunsRepository } from '../runs';
import { WorkUnitTraceReader } from './work-unit-trace.reader';

interface AuthorizedRequest {
  organizationSlug?: string;
}

/**
 * GET /workflows/:slug/runs/:runId/trace
 * GET /workflows/:slug/runs/:runId/trace/participants/:participantId
 *
 * Only for a run the caller may read (owner, or shared by its access rule),
 * in the org RBAC bound to the request. Never an org from the query.
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkUnitTraceController {
  constructor(
    private readonly runs: WorkflowRunsRepository,
    private readonly trace: WorkUnitTraceReader,
  ) {}

  @Get(':slug/runs/:runId/trace')
  async runTrace(
    @Param('slug') slug: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<RunTrace> {
    await this.readableRun(slug, runId, user.id, request);
    return { runId, workUnits: await this.trace.units(runId) };
  }

  @Get(':slug/runs/:runId/trace/participants/:participantId')
  async participant(
    @Param('slug') slug: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<ParticipantDetail> {
    await this.readableRun(slug, runId, user.id, request);
    const detail = await this.trace.participant(runId, participantId);
    if (!detail) throw new NotFoundException(`No participant ${participantId} in run ${runId}`);
    return detail;
  }

  private async readableRun(slug: string, runId: string, userId: string, request: AuthorizedRequest) {
    if (!request.organizationSlug) {
      throw new InternalServerErrorException('Authorized organization was not bound to the request');
    }
    const run = await this.runs.getReadable(runId, { userId, organizationSlug: request.organizationSlug });
    if (!run || run.workflowSlug !== slug) {
      throw new NotFoundException(`No run ${runId} for workflow ${slug}`);
    }
  }
}
