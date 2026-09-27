import { Controller, Get, InternalServerErrorException, NotFoundException, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { TraceReviewView } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { WorkflowRunsRepository } from '../runs';
import { QualityRepository } from './quality.repository';

/** GET /workflows/:slug/runs/:runId/trace-reviews, for a run the caller may read. */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class TraceReviewsController {
  constructor(
    private readonly runs: WorkflowRunsRepository,
    private readonly repo: QualityRepository,
  ) {}

  @Get(':slug/runs/:runId/trace-reviews')
  async list(
    @Param('slug') slug: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentUser() user: { id: string },
    @Req() request: { organizationSlug?: string },
  ): Promise<TraceReviewView[]> {
    if (!request.organizationSlug) {
      throw new InternalServerErrorException('Authorized organization was not bound to the request');
    }
    const run = await this.runs.getReadable(runId, { userId: user.id, organizationSlug: request.organizationSlug });
    if (!run || run.workflowSlug !== slug) throw new NotFoundException(`No run ${runId} for workflow ${slug}`);
    return this.repo.reviewsForRun(runId);
  }
}
