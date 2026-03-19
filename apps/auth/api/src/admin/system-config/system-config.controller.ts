import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import {
  SystemConfigService,
  SystemConfig,
  UpdateSystemConfigDto,
} from './system-config.service';

@ApiTags('System Config')
@Controller('admin/system/config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get()
  @ApiOperation({ summary: 'List all system configuration entries' })
  @ApiResponse({
    status: 200,
    description: 'All system_settings key-value pairs',
  })
  async findAll(): Promise<SystemConfig[]> {
    return this.systemConfigService.findAll();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Create or update a system configuration entry' })
  @ApiParam({ name: 'key', description: 'Configuration key' })
  @ApiResponse({
    status: 200,
    description: 'Updated system configuration entry',
  })
  @ApiResponse({ status: 500, description: 'Database error' })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSystemConfigDto,
  ): Promise<SystemConfig> {
    return this.systemConfigService.update(key, dto);
  }
}
