import { Controller, Get, InternalServerErrorException, NotFoundException, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { IssueLedgerView } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { WorkflowRunsRepository } from '../runs';
import { IssueLedgerService } from './issue-ledger.service';

/** GET /workflows/:slug/runs/:runId/issues, for a run the caller may read. */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class IssueLedgerController {
  constructor(
    private readonly runs: WorkflowRunsRepository,
    private readonly ledger: IssueLedgerService,
  ) {}

  @Get(':slug/runs/:runId/issues')
  async issues(
    @Param('slug') slug: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentUser() user: { id: string },
    @Req() request: { organizationSlug?: string },
  ): Promise<IssueLedgerView> {
    if (!request.organizationSlug) {
      throw new InternalServerErrorException('Authorized organization was not bound to the request');
    }
    const run = await this.runs.getReadable(runId, { userId: user.id, organizationSlug: request.organizationSlug });
    if (!run || run.workflowSlug !== slug) throw new NotFoundException(`No run ${runId} for workflow ${slug}`);
    return this.ledger.view(runId);
  }
}
