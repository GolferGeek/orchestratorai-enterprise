import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { WorkflowRegistry } from './workflow.registry';
import { MarketingDbService } from '../marketing-swarm/marketing-db.service';

interface AuthorizedRequest {
  organizationSlug?: string;
}

/**
 * Workflow catalog endpoints for the Workflows product sidebar.
 *
 * GET /workflows           — list workflow definitions
 * GET /workflows/:slug/runs — list runs for the authenticated user
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowCatalogController {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly marketingDb: MarketingDbService,
  ) {}

  @Get()
  async listWorkflows(@Req() request: AuthorizedRequest): Promise<{
    status: string;
    workflows: Array<{
      slug: string;
      name: string;
      description?: string;
      organizationSlug: string | null;
    }>;
  }> {
    // From the code registry, not the agents table. A workflow is a LangGraph
    // endpoint; it has no row.
    const orgSlug = this.requireOrganization(request);
    return {
      status: 'ok',
      workflows: this.registry.list(orgSlug).map((w) => ({
        slug: w.slug,
        name: w.name,
        description: w.description,
        organizationSlug: w.organizationSlugs.includes('global')
          ? null
          : (w.organizationSlugs[0] ?? null),
      })),
    };
  }

  @Get(':slug/runs')
  async listRuns(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<{
    runs: Array<{
      taskId: string;
      conversationId: string;
      workflowSlug: string;
      status: string;
      contentTypeSlug: string;
      previewTitle: string;
      createdAt: string;
      updatedAt: string;
      completedAt: string | null;
    }>;
  }> {
    const organizationSlug = this.requireOrganization(request);
    if (!this.registry.has(slug, organizationSlug)) {
      throw new NotFoundException(`Unknown workflow: ${slug}`);
    }
    // NOTE: run history is still marketing-swarm's own storage. Whether a
    // workflow exists is now a registry question; where its runs live is not
    // yet generalised, and the second workflow is what should force that seam.
    if (slug !== 'marketing-swarm') {
      throw new NotFoundException(`Workflow '${slug}' does not record runs yet`);
    }

    const tasks = await this.marketingDb.listUserTasks({
      userId: user.id,
      organizationSlug: this.requireOrganization(request),
    });

    return {
      runs: tasks.map((task) => ({
        ...task,
        workflowSlug: slug,
      })),
    };
  }

  /**
   * DELETE /workflows/:slug/runs/:conversationId
   * Deletes a workflow run and all associated data (outputs, evaluations, versions).
   */
  @Delete(':slug/runs/:conversationId')
  @HttpCode(HttpStatus.OK)
  async deleteRun(
    @Param('slug') slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<{ deleted: boolean }> {
    if (!this.registry.has(slug, this.requireOrganization(request))) {
      throw new NotFoundException(`Unknown workflow: ${slug}`);
    }
    if (slug !== 'marketing-swarm') {
      throw new NotFoundException(`Workflow '${slug}' does not record runs yet`);
    }

    const deleted = await this.marketingDb.deleteTaskForUser(
      conversationId,
      user.id,
      this.requireOrganization(request),
    );

    if (!deleted) {
      throw new NotFoundException(
        `No run found for conversation: ${conversationId}`,
      );
    }

    return { deleted: true };
  }

  private requireOrganization(request: AuthorizedRequest): string {
    if (!request.organizationSlug) {
      throw new InternalServerErrorException(
        'Authorized organization was not bound to the request',
      );
    }
    return request.organizationSlug;
  }
}
