import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ExternalRegistryService } from './external-registry.service';

@Controller('secure-conversations/registry')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class RegistryController {
  constructor(private readonly registry: ExternalRegistryService) {}

  @Get('agents')
  async getAllAgents(@Req() request: Request) {
    return this.registry.getAllAgents(this.getOrganizationSlug(request));
  }

  @Get('agents/:id')
  async getAgent(@Param('id') id: string, @Req() request: Request) {
    return this.registry.getAgent(id, this.getOrganizationSlug(request));
  }

  @Post('agents/discover')
  @HttpCode(200)
  async discoverAgent(
    @Body() body: { url: string },
    @Req() request: Request,
  ) {
    if (typeof body?.url !== 'string' || !body.url.trim()) {
      throw new BadRequestException('url is required');
    }
    return this.registry.discoverAgent(
      body.url,
      this.getOrganizationSlug(request),
    );
  }

  @Post('agents')
  @HttpCode(201)
  async registerAgent(
    @Body()
    body: {
      id: string;
      name: string;
      description: string;
      url: string;
      version: string;
      capabilities: string[];
      trustScore: number;
      trustLevel: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
      interactions: number;
    },
    @Req() request: Request,
  ) {
    if (
      !body ||
      typeof body.id !== 'string' ||
      !body.id.trim() ||
      body.id.length > 128 ||
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      typeof body.url !== 'string' ||
      !body.url.trim() ||
      !Array.isArray(body.capabilities) ||
      !body.capabilities.every((capability) => typeof capability === 'string') ||
      !Number.isFinite(body.trustScore) ||
      body.trustScore < 0 ||
      body.trustScore > 100 ||
      !Number.isSafeInteger(body.interactions) ||
      body.interactions < 0 ||
      !['trusted', 'neutral', 'untrusted', 'unknown'].includes(body.trustLevel)
    ) {
      throw new BadRequestException('Invalid external agent registration');
    }
    return this.registry.registerAgent(
      body,
      this.getOrganizationSlug(request),
    );
  }

  @Post('agents/:id/heartbeat')
  @HttpCode(200)
  async updateHeartbeat(
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.registry.updateHeartbeat(
      id,
      this.getOrganizationSlug(request),
    );
  }

  @Delete('agents/:id')
  @HttpCode(204)
  async deregisterAgent(
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    await this.registry.deregisterAgent(
      id,
      this.getOrganizationSlug(request),
    );
  }

  private getOrganizationSlug(request: Request): string {
    const organizationSlug = (
      request as Request & { organizationSlug?: string }
    ).organizationSlug;
    if (!organizationSlug || organizationSlug === '*') {
      throw new BadRequestException(
        'A specific authorized organization is required',
      );
    }
    return organizationSlug;
  }
}
