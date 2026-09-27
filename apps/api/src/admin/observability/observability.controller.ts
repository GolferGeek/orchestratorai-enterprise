import {
  Controller,
  Get,
  InternalServerErrorException,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
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
  async getMetrics(@Req() request: { organizationSlug?: string }): Promise<ObservabilityMetrics> {
    return this.observabilityService.getMetrics(boundOrganization(request));
  }

  @Get('events')
  @ApiOperation({ summary: 'Observability event log' })
  @ApiResponse({ status: 200, description: 'Filtered observability events' })
  async listEvents(
    @Req() request: { organizationSlug?: string },
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
    return this.observabilityService.listEvents(query, boundOrganization(request));
  }
}

/**
 * The org RBAC bound to the request: an org admin sees only that org; a
 * super-admin with no org selected is bound to "*" and sees every org.
 */
export function boundOrganization(request: { organizationSlug?: string }): string {
  if (!request.organizationSlug) {
    throw new InternalServerErrorException('Authorized organization was not bound to the request');
  }
  return request.organizationSlug;
}
