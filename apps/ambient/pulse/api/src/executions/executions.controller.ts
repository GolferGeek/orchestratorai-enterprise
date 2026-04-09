import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AmbientDatabaseService, TriggerExecution } from '../ambient-database/database.service';

/**
 * ExecutionsController — top-level /executions endpoint for listing
 * recent executions across all pulse triggers.
 */
@Controller('executions')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:audit')
export class ExecutionsController {
  constructor(private readonly db: AmbientDatabaseService) {}

  @Get()
  async listExecutions(
    @Query('limit') limit?: string,
  ): Promise<TriggerExecution[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.db.getRecentExecutions(undefined, parsedLimit);
  }
}
