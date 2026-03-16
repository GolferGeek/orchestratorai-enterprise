import { Controller, Get, Query } from '@nestjs/common';
import { AmbientDatabaseService, TriggerExecution } from '../ambient-database/database.service';

/**
 * ExecutionsController — top-level /executions endpoint for listing
 * recent executions across all pulse triggers.
 */
@Controller('executions')
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
