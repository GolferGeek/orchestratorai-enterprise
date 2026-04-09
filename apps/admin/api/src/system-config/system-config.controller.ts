import { Body, Controller, Get, Headers, Put, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RemoteJwtAuthGuard as JwtAuthGuard, RemoteRbacGuard as RbacGuard, RequirePermission } from '@orchestratorai/auth-client';
import {
  SystemConfigService,
  SystemConfigResponse,
  SystemConfig,
  UpdateSystemConfigDto,
  SystemHealthResponse,
} from './system-config.service';

/**
 * Extract the raw bearer token for forwarding to downstream services.
 * JwtAuthGuard has already validated that the header is present and well-formed,
 * so the `Bearer ` prefix is guaranteed here.
 */
function extractToken(authHeader: string): string {
  return authHeader.slice(7);
}

@ApiTags('system-config')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
@Controller('admin/system')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('config')
  @ApiOperation({
    summary: 'System-wide configuration',
    description: 'Returns system-wide configuration from Auth API.',
  })
  @ApiResponse({ status: 200, description: 'System configuration' })
  async getConfig(
    @Headers('authorization') authHeader: string,
  ): Promise<SystemConfigResponse> {
    const token = extractToken(authHeader);
    return this.systemConfigService.getConfig(token);
  }

  @Put('config')
  @ApiOperation({
    summary: 'Update system configuration',
    description: 'Updates a system-wide configuration key via Auth API.',
  })
  @ApiResponse({ status: 200, description: 'Updated configuration entry' })
  async updateConfig(
    @Headers('authorization') authHeader: string,
    @Body() dto: UpdateSystemConfigDto,
  ): Promise<SystemConfig> {
    const token = extractToken(authHeader);
    return this.systemConfigService.updateConfig(token, dto);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Health check across all products',
    description:
      'Pings each product API health endpoint and returns aggregated status. Products that are unreachable are reported with error details — no fallbacks.',
  })
  @ApiResponse({ status: 200, description: 'Product health statuses' })
  async getHealth(): Promise<SystemHealthResponse> {
    return this.systemConfigService.getHealth();
  }
}
