import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  ObservabilityService,
  ObservabilityEventsResponse,
  ObservabilityMetricsFlat,
  ObservabilityErrorsResponse,
} from './observability.service';

@ApiTags('observability')
@ApiBearerAuth('JWT-auth')
@Controller('admin/observability')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('events')
  @ApiOperation({
    summary: 'Recent observability events',
    description:
      'Returns recent observability events from the database, sorted newest first.',
  })
  @ApiResponse({ status: 200, description: 'Recent events from all products' })
  async getEvents(): Promise<ObservabilityEventsResponse> {
    return this.observabilityService.getEvents();
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'System metrics summary',
    description: 'Returns aggregated system metrics from the database.',
  })
  @ApiResponse({ status: 200, description: 'System metrics by product' })
  async getMetrics(): Promise<ObservabilityMetricsFlat> {
    return this.observabilityService.getMetrics();
  }

  @Get('errors')
  @ApiOperation({
    summary: 'Recent errors across products',
    description:
      'Returns recent error events from the database, sorted newest first.',
  })
  @ApiResponse({ status: 200, description: 'Recent errors from all products' })
  async getErrors(): Promise<ObservabilityErrorsResponse> {
    return this.observabilityService.getErrors();
  }
}
