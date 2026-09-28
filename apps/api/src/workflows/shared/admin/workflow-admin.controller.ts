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
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  WorkflowAdminAgentChange,
  WorkflowAdminMatrix,
  WorkflowAdminRow,
  WorkflowAdminView,
} from '@orchestrator-ai/transport-types';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { WorkflowRegistry, type CatalogWorkflow } from '../../catalog/workflow.registry';
import { configurableRoles } from '../models';
import { AgentOverridesRepository } from './agent-overrides.repository';
import { AdminRowError, sectionView, validateMatrix, validateRow, type WorkflowAdminSection } from './workflow-admin-section';
import { WorkflowAdminRegistry } from './workflow-admin.registry';

interface AuthorizedRequest {
  organizationSlug?: string;
}

const MAX_INSTRUCTIONS = 20000;

/**
 * A workflow's admin page, for the org's admins:
 *
 * GET    /workflows/:slug/admin                              agents, model roles, sections
 * PUT    /workflows/:slug/admin/agents/:agent                { instructions: string | null }
 * GET    /workflows/:slug/admin/agents/:agent/history
 * GET    /workflows/:slug/admin/sections/:key                { rows }
 * POST   /workflows/:slug/admin/sections/:key                { row }
 * PUT    /workflows/:slug/admin/sections/:key/:id            { row }
 * DELETE /workflows/:slug/admin/sections/:key/:id
 * PUT    /workflows/:slug/admin/sections/:key                { rows: [{ id, row }] }  bulk edit
 * GET    /workflows/:slug/admin/sections/:key/matrix         a matrix section's cells
 * PUT    /workflows/:slug/admin/sections/:key/matrix         { rows: [{ id, cells }] }
 *
 * Models per role are /workflows/admin/model-profiles. Everything is scoped
 * to the RBAC org; "*" must pick an org first.
 */
@Controller('workflows/:slug/admin')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class WorkflowAdminController {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly admin: WorkflowAdminRegistry,
    private readonly agents: AgentOverridesRepository,
  ) {}

  @Get()
  async view(@Param('slug') slug: string, @Req() request: AuthorizedRequest): Promise<WorkflowAdminView> {
    const org = this.org(request);
    const workflow = this.workflow(slug, org);
    return {
      slug,
      name: workflow.name,
      modelRoles: workflow.entryPoint.kind === 'runtime' ? configurableRoles(workflow.entryPoint.modelRoles) : [],
      agents: await this.agents.forWorkflow(slug, org),
      sections: this.admin.sections(slug).map(sectionView),
    };
  }

  @Put('agents/:agent')
  async saveAgent(
    @Param('slug') slug: string,
    @Param('agent') agent: string,
    @Body() body: { instructions?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<{ saved: true }> {
    const org = this.org(request);
    await this.linkedAgent(slug, agent, org);
    const instructions = body.instructions;
    if (instructions !== null && (typeof instructions !== 'string' || !instructions.trim() || instructions.length > MAX_INSTRUCTIONS)) {
      throw new BadRequestException(`instructions must be non-empty text (at most ${MAX_INSTRUCTIONS} characters), or null for the default`);
    }
    await this.agents.save(agent, org, instructions === null ? null : instructions.trim(), user.id);
    return { saved: true };
  }

  @Get('agents/:agent/history')
  async agentHistory(
    @Param('slug') slug: string,
    @Param('agent') agent: string,
    @Req() request: AuthorizedRequest,
  ): Promise<{ changes: WorkflowAdminAgentChange[] }> {
    const org = this.org(request);
    await this.linkedAgent(slug, agent, org);
    return { changes: await this.agents.history(agent, org) };
  }

  @Get('sections/:key/matrix')
  async matrix(@Param('slug') slug: string, @Param('key') key: string, @Req() request: AuthorizedRequest): Promise<WorkflowAdminMatrix> {
    const org = this.org(request);
    return this.matrixOf(this.section(slug, key, org)).load(org);
  }

  @Put('sections/:key/matrix')
  async saveMatrix(
    @Param('slug') slug: string,
    @Param('key') key: string,
    @Body() body: { rows?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<WorkflowAdminMatrix> {
    const org = this.org(request);
    const matrix = this.matrixOf(this.section(slug, key, org));
    try {
      const rows = validateMatrix(await matrix.load(org), body.rows, matrix);
      return await matrix.save(org, rows, user.id);
    } catch (error) {
      if (error instanceof AdminRowError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('sections/:key')
  async rows(@Param('slug') slug: string, @Param('key') key: string, @Req() request: AuthorizedRequest): Promise<{ rows: WorkflowAdminRow[] }> {
    const org = this.org(request);
    const section = this.section(slug, key, org);
    if (!section.list) throw new BadRequestException(`${section.label} is a matrix: GET sections/${key}/matrix`);
    return { rows: await section.list(org) };
  }

  @Post('sections/:key')
  async create(
    @Param('slug') slug: string,
    @Param('key') key: string,
    @Body() body: { row?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<WorkflowAdminRow> {
    const org = this.org(request);
    const section = this.section(slug, key, org);
    if (!section.create) throw new BadRequestException(`${section.label}: rows cannot be added`);
    return this.rowErrors(() => section.create!(org, validateRow(section.fields, body.row), user.id));
  }

  @Put('sections/:key')
  async saveAll(
    @Param('slug') slug: string,
    @Param('key') key: string,
    @Body() body: { rows?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<{ rows: WorkflowAdminRow[] }> {
    const org = this.org(request);
    const section = this.section(slug, key, org);
    const bulk = section.bulk;
    if (!bulk) throw new BadRequestException(`${section.label} has no bulk edit`);
    if (!Array.isArray(body.rows) || !body.rows.length) throw new BadRequestException('rows must be a non-empty list');
    const fields = section.fields.filter((f) => bulk.fields.includes(f.key));
    const rows = body.rows.map((entry: unknown) => {
      const e = entry as { id?: unknown; row?: unknown };
      if (typeof e.id !== 'string' || !e.id) throw new BadRequestException('each row needs an id');
      return { id: e.id, row: e.row };
    });
    if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new BadRequestException('a row is listed twice');
    try {
      const checked = rows.map((r) => ({ id: r.id, row: validateRow(fields, r.row) }));
      return { rows: await bulk.save(org, checked, user.id) };
    } catch (error) {
      if (error instanceof AdminRowError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Put('sections/:key/:id')
  async update(
    @Param('slug') slug: string,
    @Param('key') key: string,
    @Param('id') id: string,
    @Body() body: { row?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<WorkflowAdminRow> {
    const org = this.org(request);
    const section = this.section(slug, key, org);
    if (!section.update) throw new BadRequestException(`${section.label}: rows cannot be changed`);
    // A row update leaves the bulk fields alone: they are saved together (PUT sections/:key).
    const editable = section.fields.filter((f) => !section.bulk?.fields.includes(f.key)).map((f) => f.key);
    return this.rowErrors(() => section.update!(org, id, validateRow(section.fields, body.row, { editable }), user.id));
  }

  @Delete('sections/:key/:id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('slug') slug: string,
    @Param('key') key: string,
    @Param('id') id: string,
    @Req() request: AuthorizedRequest,
  ): Promise<{ deleted: true }> {
    const org = this.org(request);
    const section = this.section(slug, key, org);
    if (!section.remove) throw new BadRequestException(`${section.label}: rows cannot be removed`);
    if (!(await section.remove(org, id))) throw new NotFoundException(`${section.label} has no ${id}`);
    return { deleted: true };
  }

  private async rowErrors(work: () => Promise<WorkflowAdminRow>): Promise<WorkflowAdminRow> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AdminRowError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private workflow(slug: string, org: string): CatalogWorkflow {
    const workflow = this.registry.get(slug, org);
    if (!workflow) throw new NotFoundException(`Workflow "${slug}" is not available to organization "${org}"`);
    return workflow;
  }

  private section(slug: string, key: string, org: string): WorkflowAdminSection {
    this.workflow(slug, org);
    const section = this.admin.section(slug, key);
    if (!section) throw new NotFoundException(`Workflow "${slug}" has no admin section "${key}"`);
    return section;
  }

  private matrixOf(section: WorkflowAdminSection): NonNullable<WorkflowAdminSection['matrix']> {
    if (!section.matrix) throw new BadRequestException(`${section.label} is not a matrix`);
    return section.matrix;
  }

  private async linkedAgent(slug: string, agent: string, org: string): Promise<void> {
    this.workflow(slug, org);
    if (!(await this.agents.forWorkflow(slug, org)).some((a) => a.slug === agent)) {
      throw new NotFoundException(`Workflow "${slug}" does not run agent "${agent}"`);
    }
  }

  private org(request: AuthorizedRequest): string {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization to administer its workflows');
    return org;
  }
}
