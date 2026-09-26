import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { isWorkflowLifecycle } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import {
  CatalogChangeError,
  WorkflowCatalogRepository,
  type OrgGroup,
  type OrgWorkflowSetting,
} from './workflow-catalog.repository';
import { WorkflowCatalogService } from './workflow-catalog.service';
import { WorkflowRegistry } from './workflow.registry';

interface AuthorizedRequest {
  organizationSlug?: string;
}

/**
 * Org admins shape their workflow catalog (admin:settings, the RBAC org):
 *
 * PATCH  /workflows/admin/settings/:slug   { enabled?, lifecycle?, note? }
 * GET    /workflows/admin/groups
 * POST   /workflows/admin/groups           { name }
 * PATCH  /workflows/admin/groups/:id       { name }
 * DELETE /workflows/admin/groups/:id
 * PUT    /workflows/admin/layout           { groups: [{ groupId, workflowSlugs }] }
 */
@Controller('workflows/admin')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class WorkflowCatalogAdminController {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly catalog: WorkflowCatalogService,
    private readonly repo: WorkflowCatalogRepository,
  ) {}

  @Patch('settings/:slug')
  async saveSetting(
    @Param('slug') slug: string,
    @Body() body: { enabled?: unknown; lifecycle?: unknown; note?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<OrgWorkflowSetting> {
    const org = this.org(request);
    const entry = (await this.catalog.view(org)).workflows.find((w) => w.slug === slug);
    if (!entry) throw new NotFoundException(`Workflow "${slug}" is not available to organization "${org}"`);
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be true or false');
    }
    if (body.lifecycle !== undefined && !isWorkflowLifecycle(body.lifecycle)) {
      throw new BadRequestException('lifecycle must be newly_created, dev, test or prod');
    }
    if (body.note !== undefined && body.note !== null && (typeof body.note !== 'string' || body.note.trim() === '')) {
      throw new BadRequestException('note must be non-empty text, or null to clear it');
    }
    const setting: OrgWorkflowSetting = {
      workflowSlug: slug,
      enabled: body.enabled === undefined ? entry.enabled : body.enabled,
      lifecycle: body.lifecycle === undefined ? entry.lifecycle : body.lifecycle,
      note: body.note === undefined ? entry.note : (body.note as string | null),
    };
    await this.repo.saveSetting(org, setting, user.id);
    return setting;
  }

  @Get('groups')
  async groups(@Req() request: AuthorizedRequest): Promise<{ groups: OrgGroup[] }> {
    return { groups: await this.repo.groups(this.org(request)) };
  }

  @Post('groups')
  async createGroup(@Body() body: { name?: unknown }, @Req() request: AuthorizedRequest): Promise<OrgGroup> {
    return this.changing(() => this.repo.createGroup(this.org(request), this.name(body.name)));
  }

  @Patch('groups/:id')
  async renameGroup(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { name?: unknown },
    @Req() request: AuthorizedRequest,
  ): Promise<{ renamed: true }> {
    const renamed = await this.changing(() => this.repo.renameGroup(this.org(request), id, this.name(body.name)));
    if (!renamed) throw new NotFoundException(`No group ${id}`);
    return { renamed: true };
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.OK)
  async deleteGroup(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthorizedRequest,
  ): Promise<{ deleted: true }> {
    if (!(await this.repo.deleteGroup(this.org(request), id))) throw new NotFoundException(`No group ${id}`);
    return { deleted: true };
  }

  @Put('layout')
  async replaceLayout(
    @Body() body: { groups?: unknown },
    @Req() request: AuthorizedRequest,
  ): Promise<{ saved: true }> {
    const org = this.org(request);
    if (!Array.isArray(body.groups)) throw new BadRequestException('groups must be a list');
    const visible = new Set(this.registry.list(org).map((w) => w.slug));
    const placed = new Set<string>();
    const groupIds = new Set<string>();
    const layout = body.groups.map((group: unknown) => {
      const candidate = group as { groupId?: unknown; workflowSlugs?: unknown };
      if (typeof candidate.groupId !== 'string' || !Array.isArray(candidate.workflowSlugs)) {
        throw new BadRequestException('each group needs a groupId and a list of workflowSlugs');
      }
      if (groupIds.has(candidate.groupId)) throw new BadRequestException(`Group ${candidate.groupId} is listed twice`);
      groupIds.add(candidate.groupId);
      const workflowSlugs = candidate.workflowSlugs.map((slug: unknown) => {
        if (typeof slug !== 'string' || !visible.has(slug)) {
          throw new BadRequestException(`"${String(slug)}" is not a workflow of organization "${org}"`);
        }
        if (placed.has(slug)) throw new BadRequestException(`Workflow "${slug}" is placed twice`);
        placed.add(slug);
        return slug;
      });
      return { groupId: candidate.groupId, workflowSlugs };
    });
    await this.changing(() => this.repo.replaceLayout(org, layout));
    return { saved: true };
  }

  private name(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') throw new BadRequestException('name is required');
    return value.trim();
  }

  private async changing<T>(change: () => Promise<T>): Promise<T> {
    try {
      return await change();
    } catch (error) {
      if (error instanceof CatalogChangeError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private org(request: AuthorizedRequest): string {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization to manage its workflows');
    return org;
  }
}
