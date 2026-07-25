import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AgentDefinitionService } from '../../agents/invoke/agent-definition.service';
import { MarketingDbService } from '../marketing-swarm/marketing-db.service';

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
  async listWorkflows(
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<{
    status: string;
    workflows: Array<{
      slug: string;
      name: string;
      description?: string;
      organizationSlug: string | null;
    }>;
  }> {
    const workflows = await this.agentDefs.listWorkflows(orgSlug);
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
    @Headers('x-organization-slug') orgSlug?: string,
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
      organizationSlug: orgSlug,
    });

    return {
      runs: tasks.map((task) => ({
        ...task,
        workflowSlug: slug,
      })),
    };
  }
}
