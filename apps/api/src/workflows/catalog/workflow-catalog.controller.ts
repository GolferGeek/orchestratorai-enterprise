import {
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type {
  WorkflowRunSummary,
  WorkflowRunView,
} from '@orchestrator-ai/transport-types';
import {
  WorkflowRegistry,
  type WorkflowEntryPoint,
  type WorkflowRunSource,
} from './workflow.registry';
import {
  WorkflowRunsRepository,
  toWorkflowRunView,
  type WorkflowRunReader,
} from '../shared/runs';

import { WorkflowDocumentsService } from '../shared/documents/workflow-documents.service';

const RUN_LIST_LIMIT = 50;

interface AuthorizedRequest {
  organizationSlug?: string;
}

/**
 * Workflow catalog endpoints for the Workflows product sidebar.
 *
 * GET    /workflows                    — workflows visible to the org
 * GET    /workflows/:slug/runs         — the caller's runs of a workflow
 * GET    /workflows/:slug/runs/:runId  — one runtime run
 * DELETE /workflows/:slug/runs/:id     — the owner deletes a run
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowCatalogController {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly runs: WorkflowRunsRepository,
    private readonly documents: WorkflowDocumentsService,
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

  /** The caller's runs of a workflow, newest first, whatever storage holds them. */
  @Get(':slug/runs')
  async listRuns(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<{ runs: WorkflowRunSummary[] }> {
    const reader = this.reader(user, request);
    const entryPoint = this.entryPoint(slug, reader);
    if (entryPoint.kind === 'runtime') {
      const runs = await this.runs.listVisible(slug, reader, RUN_LIST_LIMIT);
      return {
        runs: runs.map((run) => ({
          conversationId: run.id,
          workflowSlug: run.workflowSlug,
          status: run.status,
          title: entryPoint.runTitle(run.input),
          createdAt: run.queuedAt,
          updatedAt: run.completedAt ?? run.startedAt ?? run.queuedAt,
          completedAt: run.completedAt,
        })),
      };
    }
    return { runs: await this.customSource(slug, entryPoint).list(reader) };
  }

  /** One runtime run, if the caller may read it. */
  @Get(':slug/runs/:runId')
  async getRun(
    @Param('slug') slug: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<WorkflowRunView> {
    const reader = this.reader(user, request);
    if (this.entryPoint(slug, reader).kind !== 'runtime') {
      throw new NotFoundException(`Workflow '${slug}' serves its runs from its own endpoints`);
    }
    const run = await this.runs.getReadable(runId, reader);
    if (!run || run.workflowSlug !== slug) {
      throw new NotFoundException(`No run ${runId} for workflow ${slug}`);
    }
    return toWorkflowRunView(run);
  }

  /**
   * DELETE /workflows/:slug/runs/:conversationId
   * The owner deletes a run and everything it produced, uploads included.
   */
  @Delete(':slug/runs/:conversationId')
  @HttpCode(HttpStatus.OK)
  async deleteRun(
    @Param('slug') slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<{ deleted: boolean }> {
    const reader = this.reader(user, request);
    const entryPoint = this.entryPoint(slug, reader);
    if (entryPoint.kind === 'runtime') {
      const outcome = await this.runs.deleteOwned(slug, conversationId, reader);
      if (outcome.status === 'active') {
        throw new ConflictException('Cancel the run before deleting it');
      }
      if (outcome.status === 'not_found') {
        throw new NotFoundException(`No run found for conversation: ${conversationId}`);
      }
      await this.documents.removeAll(outcome.run.organizationSlug, outcome.run.id);
      return { deleted: true };
    }
    const deleted = await this.customSource(slug, entryPoint).delete(conversationId, reader);
    if (!deleted) {
      throw new NotFoundException(`No run found for conversation: ${conversationId}`);
    }
    return { deleted: true };
  }

  private entryPoint(slug: string, reader: WorkflowRunReader): WorkflowEntryPoint {
    const workflow = this.registry.get(slug, reader.organizationSlug);
    if (!workflow) {
      throw new NotFoundException(`Unknown workflow: ${slug}`);
    }
    return workflow.entryPoint;
  }

  private customSource(slug: string, entryPoint: WorkflowEntryPoint): WorkflowRunSource {
    if (entryPoint.kind === 'custom' && entryPoint.runs) {
      return entryPoint.runs;
    }
    throw new NotFoundException(`Workflow '${slug}' does not record runs here`);
  }

  private reader(user: { id: string }, request: AuthorizedRequest): WorkflowRunReader {
    return { userId: user.id, organizationSlug: this.requireOrganization(request) };
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
