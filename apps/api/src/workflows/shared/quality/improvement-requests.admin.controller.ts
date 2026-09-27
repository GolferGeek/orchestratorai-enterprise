import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IMPROVEMENT_STATUSES, type ImprovementRequestView, type ImprovementStatus } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { QualityRepository } from './quality.repository';

const isStatus = (value: unknown): value is ImprovementStatus =>
  (IMPROVEMENT_STATUSES as readonly unknown[]).includes(value);

/**
 * Org admins work the improvement queue (admin:settings, the RBAC org):
 *
 * GET   /workflows/admin/improvement-requests?status=open
 * PATCH /workflows/admin/improvement-requests/:id   { status, adminNotes? }
 */
@Controller('workflows/admin/improvement-requests')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class ImprovementRequestsAdminController {
  constructor(private readonly repo: QualityRepository) {}

  @Get()
  async list(@Query('status') status: string | undefined, @Req() request: { organizationSlug?: string }) {
    if (status !== undefined && !isStatus(status)) {
      throw new BadRequestException(`status must be one of ${IMPROVEMENT_STATUSES.join(', ')}`);
    }
    return this.repo.improvements(this.org(request), status ?? null);
  }

  @Patch(':id')
  async decide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status?: unknown; adminNotes?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: { organizationSlug?: string },
  ): Promise<ImprovementRequestView> {
    if (!isStatus(body.status)) throw new BadRequestException(`status must be one of ${IMPROVEMENT_STATUSES.join(', ')}`);
    if (body.adminNotes !== undefined && body.adminNotes !== null && typeof body.adminNotes !== 'string') {
      throw new BadRequestException('adminNotes must be text, or null');
    }
    const notes = typeof body.adminNotes === 'string' && body.adminNotes.trim() ? body.adminNotes.trim() : null;
    const decided = await this.repo.decideImprovement(this.org(request), id, {
      status: body.status,
      adminNotes: notes,
      decidedBy: user.id,
    });
    if (!decided) throw new NotFoundException(`No improvement request ${id}`);
    return decided;
  }

  private org(request: { organizationSlug?: string }): string {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization to manage its improvement requests');
    return org;
  }
}
