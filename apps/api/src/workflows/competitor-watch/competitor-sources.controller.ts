import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { type CompetitorSource, SourcesStoreService } from './sources-store.service';

/**
 * GET /workflows/competitor-watch/sources: the pages the org follows, for the
 * run form. Admins add and change them in the workflow's admin (section
 * "sources", competitor-watch.admin.ts).
 */
@Controller('workflows/competitor-watch/sources')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class CompetitorSourcesController {
  constructor(private readonly store: SourcesStoreService) {}

  @Get()
  async list(@Req() request: { organizationSlug?: string }): Promise<CompetitorSource[]> {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization');
    return this.store.list(org);
  }
}
