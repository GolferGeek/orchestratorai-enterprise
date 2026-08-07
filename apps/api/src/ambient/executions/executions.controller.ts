import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AmbientDatabaseService, TriggerExecution } from '../ambient-database/database.service';

/**
 * ExecutionsController — top-level /executions endpoint for listing
 * recent executions across all ambient triggers.
 */
@Controller('ambient/executions')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:audit')
export class ExecutionsController {
  constructor(private readonly db: AmbientDatabaseService) {}

  @Get()
  async listExecutions(
    @Query('limit') limit?: string,
    @Req() request?: Request,
  ): Promise<TriggerExecution[]> {
    const parsedLimit = limit ? Number(limit) : 50;
    const safeLimit = Number.isSafeInteger(parsedLimit)
      ? Math.min(1000, Math.max(1, parsedLimit))
      : 50;
    const orgSlug = (
      request as Request & { organizationSlug?: string } | undefined
    )?.organizationSlug;
    return this.db.getRecentExecutions(undefined, safeLimit, orgSlug);
  }
}
