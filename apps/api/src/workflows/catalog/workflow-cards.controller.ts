import { BadRequestException, Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import type { CapabilityCard, WellKnownListing } from '@orchestrator-ai/transport-types';
import { Public } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { WorkflowCatalogService } from './workflow-catalog.service';
import { workflowCard, workflowListingEntry } from './workflow-card';
import { WorkflowRegistry } from './workflow.registry';

/**
 * A2A discovery for workflows.
 *
 * GET /workflows/:slug/.well-known/agent.json  - one workflow's card (public, for bootstrap)
 * GET /workflows/.well-known/agents.json       - the workflows the caller's org can run
 */
@Controller('workflows')
export class WorkflowCardsController {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly catalog: WorkflowCatalogService,
  ) {}

  @Public()
  @Get(':slug/.well-known/agent.json')
  card(@Param('slug') slug: string): CapabilityCard {
    const workflow = this.registry.get(slug);
    if (!workflow) throw new NotFoundException(`No workflow ${slug}`);
    return workflowCard(workflow);
  }

  @Get('.well-known/agents.json')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('agents:execute')
  async listing(@Req() request: { organizationSlug?: string }): Promise<WellKnownListing> {
    const org = request.organizationSlug;
    if (!org) throw new BadRequestException('Select an organization');
    const enabled = new Set((await this.catalog.view(org)).workflows.filter((w) => w.enabled).map((w) => w.slug));
    return {
      product: 'orchestratorai-workflows',
      version: '2',
      capabilities: this.registry.list(org).filter((w) => enabled.has(w.slug)).map(workflowListingEntry),
    };
  }
}
