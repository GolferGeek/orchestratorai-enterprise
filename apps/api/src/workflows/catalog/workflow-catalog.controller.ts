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
import { AgentDefinitionService } from '../../agents/invoke/agent-definition.service';
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
    private readonly agentDefs: AgentDefinitionService,
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
    const workflows = await this.agentDefs.listWorkflows(
      this.requireOrganization(request),
    );
    return {
      status: 'ok',
      workflows: workflows.map((w) => ({
        slug: w.slug,
        name: w.name,
        description: w.description,
        organizationSlug: w.orgSlug ?? null,
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
    if (slug !== 'marketing-swarm') {
      throw new NotFoundException(`Unknown workflow: ${slug}`);
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
    if (slug !== 'marketing-swarm') {
      throw new NotFoundException(`Unknown workflow: ${slug}`);
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
