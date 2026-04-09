import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  RemoteJwtAuthGuard as JwtAuthGuard,
  RemoteRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import {
  AgentRegistryService,
  AgentListResponse,
  AgentDetailResponse,
  AgentConfigUpdateDto,
  AgentDefinition,
  AgentStatsResponse,
} from './agent-registry.service';

@ApiTags('agent-registry')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:admin')
@Controller('admin/agents')
export class AgentRegistryController {
  constructor(private readonly agentRegistryService: AgentRegistryService) {}

  @Get()
  @ApiOperation({
    summary: 'List all registered agents',
    description: 'Returns all agents from the database.',
  })
  @ApiResponse({ status: 200, description: 'All registered agents' })
  async listAgents(): Promise<AgentListResponse> {
    return this.agentRegistryService.listAgents();
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Agent usage statistics',
    description: 'Returns usage statistics for all agents from the database.',
  })
  @ApiResponse({ status: 200, description: 'Agent usage stats' })
  async getStats(): Promise<AgentStatsResponse> {
    return this.agentRegistryService.getStats();
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get agent details',
    description: 'Returns details for a specific agent by slug.',
  })
  @ApiParam({ name: 'slug', description: 'Agent slug' })
  @ApiResponse({ status: 200, description: 'Agent details' })
  async getAgent(@Param('slug') slug: string): Promise<AgentDetailResponse> {
    return this.agentRegistryService.getAgent(slug);
  }

  @Put(':slug/config')
  @ApiOperation({
    summary: 'Update agent configuration',
    description: 'Updates configuration for a specific agent.',
  })
  @ApiParam({ name: 'slug', description: 'Agent slug' })
  @ApiResponse({ status: 200, description: 'Updated agent' })
  async updateAgentConfig(
    @Param('slug') slug: string,
    @Body() dto: AgentConfigUpdateDto,
  ): Promise<AgentDefinition> {
    return this.agentRegistryService.updateAgentConfig(slug, dto);
  }
}
