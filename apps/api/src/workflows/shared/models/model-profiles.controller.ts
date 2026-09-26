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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { WorkflowRegistry } from '../../catalog/workflow.registry';
import { ModelProfilesRepository, UnknownModelError } from './model-profiles.repository';
import type { ModelProfileRecord } from './model-profile.types';

interface AuthorizedRequest {
  organizationSlug?: string;
}

interface ModelProfileBody {
  workflowSlug?: unknown;
  role?: unknown;
  provider?: unknown;
  model?: unknown;
}

/**
 * Org admins choose the model for each role of each workflow.
 *
 * GET    /workflows/admin/model-profiles[?workflowSlug=]
 * PUT    /workflows/admin/model-profiles   { workflowSlug, role, provider, model }
 * DELETE /workflows/admin/model-profiles/:id
 *
 * Scoped to the org RBAC bound to the request; "*" must pick an org first.
 */
@Controller('workflows/admin/model-profiles')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class ModelProfilesController {
  constructor(
    private readonly profiles: ModelProfilesRepository,
    private readonly registry: WorkflowRegistry,
  ) {}

  @Get()
  async list(
    @Query('workflowSlug') workflowSlug: string | undefined,
    @Req() request: AuthorizedRequest,
  ): Promise<{ profiles: ModelProfileRecord[] }> {
    return { profiles: await this.profiles.list(this.org(request), workflowSlug) };
  }

  @Put()
  async save(
    @Body() body: ModelProfileBody,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<ModelProfileRecord> {
    const organizationSlug = this.org(request);
    const { workflowSlug, role, provider, model } = body;
    if (
      typeof workflowSlug !== 'string' ||
      typeof role !== 'string' ||
      typeof provider !== 'string' ||
      typeof model !== 'string' ||
      [workflowSlug, role, provider, model].some((value) => value.trim() === '')
    ) {
      throw new BadRequestException('workflowSlug, role, provider and model are required');
    }
    const workflow = this.registry.get(workflowSlug, organizationSlug);
    if (!workflow || workflow.entryPoint.kind !== 'runtime') {
      throw new BadRequestException(
        `Workflow "${workflowSlug}" does not use model profiles in organization "${organizationSlug}"`,
      );
    }
    if (!workflow.entryPoint.modelRoles.includes(role)) {
      throw new BadRequestException(
        `Workflow "${workflowSlug}" has no role "${role}"; its roles: ${workflow.entryPoint.modelRoles.join(', ')}`,
      );
    }
    try {
      return await this.profiles.upsert({
        organizationSlug,
        workflowSlug,
        role,
        provider,
        model,
        updatedBy: user.id,
      });
    } catch (error) {
      if (error instanceof UnknownModelError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthorizedRequest,
  ): Promise<{ deleted: true }> {
    if (!(await this.profiles.delete(this.org(request), id))) {
      throw new NotFoundException(`No model profile ${id}`);
    }
    return { deleted: true };
  }

  private org(request: AuthorizedRequest): string {
    const org = request.organizationSlug;
    if (!org || org === '*') {
      throw new BadRequestException('Select an organization to manage its model profiles');
    }
    return org;
  }
}
