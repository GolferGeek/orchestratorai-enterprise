import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Patch,
  NotFoundException,
  HttpCode,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { WorkflowRegistryService, WorkflowDefinition } from './workflow-registry.service';
import { WorkflowExecutorService } from './workflow-executor.service';

@Controller('ambient/workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowsController {
  constructor(
    private readonly registry: WorkflowRegistryService,
    private readonly executor: WorkflowExecutorService,
  ) {}

  @Get()
  getAll(@Req() request: Request) {
    return this.registry.getAll(this.getOrganizationSlug(request));
  }

  @Get('runs')
  getAllRuns(@Req() request: Request) {
    return this.registry.getRuns(
      undefined,
      this.getOrganizationSlug(request),
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() request: Request) {
    const wf = this.registry.getById(id, this.getOrganizationSlug(request));
    if (!wf) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return wf;
  }

  @Get(':id/runs')
  getRuns(@Param('id') id: string, @Req() request: Request) {
    return this.registry.getRuns(id, this.getOrganizationSlug(request));
  }

  @Post()
  @RequirePermission('admin:settings')
  register(
    @Body() definition: WorkflowDefinition,
    @Req() request: Request,
  ) {
    const orgSlug = this.resolveTargetOrganization(
      request,
      definition?.orgSlug,
    );
    if (
      !definition ||
      typeof definition.id !== 'string' ||
      !definition.id.trim() ||
      typeof definition.name !== 'string' ||
      !definition.name.trim() ||
      !Array.isArray(definition.steps) ||
      !['db-change', 'file-change', 'internal-a2a', 'scheduled', 'manual'].includes(
        definition.trigger,
      )
    ) {
      throw new BadRequestException('Invalid workflow definition');
    }
    const scopedDefinition = { ...definition, orgSlug };
    this.registry.register(scopedDefinition);
    return scopedDefinition;
  }

  @Post(':id/execute')
  @HttpCode(202)
  async execute(
    @Param('id') id: string,
    @Body() body: { triggerData?: Record<string, unknown> },
    @Req() request: Request,
  ) {
    const run = await this.executor.execute(
      id,
      body?.triggerData,
      this.getOrganizationSlug(request),
    );
    return run;
  }

  @Patch(':id/enable')
  @RequirePermission('admin:settings')
  enable(@Param('id') id: string, @Req() request: Request) {
    const orgSlug = this.getOrganizationSlug(request);
    const wf = this.registry.getById(id, orgSlug);
    if (!wf) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    this.registry.enable(id, orgSlug);
    return { id, enabled: true };
  }

  @Patch(':id/disable')
  @RequirePermission('admin:settings')
  disable(@Param('id') id: string, @Req() request: Request) {
    const orgSlug = this.getOrganizationSlug(request);
    const wf = this.registry.getById(id, orgSlug);
    if (!wf) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    this.registry.disable(id, orgSlug);
    return { id, enabled: false };
  }

  private getOrganizationSlug(request: Request): string | undefined {
    return (request as Request & { organizationSlug?: string })
      .organizationSlug;
  }

  private resolveTargetOrganization(
    request: Request,
    requestedOrgSlug?: string,
  ): string {
    const authorizedOrgSlug = this.getOrganizationSlug(request);
    if (authorizedOrgSlug && authorizedOrgSlug !== '*') {
      if (requestedOrgSlug && requestedOrgSlug !== authorizedOrgSlug) {
        throw new BadRequestException(
          'orgSlug must match the authorized organization',
        );
      }
      return authorizedOrgSlug;
    }
    if (!requestedOrgSlug) {
      throw new BadRequestException('orgSlug is required');
    }
    return requestedOrgSlug;
  }
}
