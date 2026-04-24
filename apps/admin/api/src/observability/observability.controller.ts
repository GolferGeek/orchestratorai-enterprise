import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  RemoteJwtAuthGuard as JwtAuthGuard,
  RemoteRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ObservabilityService,
  type ObservabilityEvent,
  type ObservabilityEventsQuery,
  type ObservabilityMetrics,
} from './observability.service';

@ApiTags('observability')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
@Controller('admin/observability')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Observability metrics' })
  @ApiResponse({ status: 200, description: 'Aggregated observability metrics' })
  async getMetrics(): Promise<ObservabilityMetrics> {
    return this.observabilityService.getMetrics();
  }

  @Get('events')
  @ApiOperation({ summary: 'Observability event log' })
  @ApiResponse({ status: 200, description: 'Filtered observability events' })
  async listEvents(
    @Query('product') product?: string,
    @Query('severity') severity?: 'info' | 'warn' | 'error',
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ObservabilityEvent[]> {
    const query: ObservabilityEventsQuery = {
      product,
      severity,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    };
    return this.observabilityService.listEvents(query);
  }
}
