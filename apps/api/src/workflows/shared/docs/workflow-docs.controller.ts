import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WORKFLOW_DOC_NAMES, type JsonValue, type WorkflowBrief, type WorkflowDoc, type WorkflowDocName } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { WorkflowRegistry, type CatalogWorkflow } from '../../catalog/workflow.registry';
import { WorkflowDocMissingError, WorkflowDocsService } from './workflow-docs.service';

/** A workflow's brief and docs, for anyone in an org that can see the workflow. */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowDocsController {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly docs: WorkflowDocsService,
  ) {}

  @Get(':slug/brief')
  async brief(@Param('slug') slug: string, @Req() request: { organizationSlug?: string }): Promise<WorkflowBrief> {
    const workflow = this.visible(slug, request);
    const entry = workflow.entryPoint;
    const validate = entry.kind === 'runtime' ? (input: JsonValue) => entry.parseStartInput(input) : undefined;
    return this.missingAs404(() => this.docs.brief(slug, validate));
  }

  @Get(':slug/docs/:name')
  async doc(
    @Param('slug') slug: string,
    @Param('name') name: string,
    @Req() request: { organizationSlug?: string },
  ): Promise<WorkflowDoc> {
    if (!(WORKFLOW_DOC_NAMES as readonly string[]).includes(name)) {
      throw new BadRequestException(`name must be one of ${WORKFLOW_DOC_NAMES.join(', ')}`);
    }
    this.visible(slug, request);
    const markdown = await this.missingAs404(() => this.docs.doc(slug, name as WorkflowDocName));
    return { name: name as WorkflowDocName, markdown };
  }

  private visible(slug: string, request: { organizationSlug?: string }): CatalogWorkflow {
    if (!request.organizationSlug) {
      throw new InternalServerErrorException('Authorized organization was not bound to the request');
    }
    const workflow = this.registry.get(slug, request.organizationSlug);
    if (!workflow) throw new NotFoundException(`No workflow ${slug}`);
    return workflow;
  }

  private async missingAs404<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (err) {
      if (err instanceof WorkflowDocMissingError) throw new NotFoundException(err.message);
      throw err;
    }
  }
}
