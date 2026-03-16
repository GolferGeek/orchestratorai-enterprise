import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
} from '@nestjs/common';
import { ExternalRegistryService } from './external-registry.service';

@Controller('registry')
export class RegistryController {
  constructor(private readonly registry: ExternalRegistryService) {}

  @Get('agents')
  async getAllAgents() {
    return this.registry.getAllAgents();
  }

  @Get('agents/:id')
  async getAgent(@Param('id') id: string) {
    return this.registry.getAgent(id);
  }

  @Post('agents/discover')
  @HttpCode(200)
  async discoverAgent(@Body() body: { url: string }) {
    return this.registry.discoverAgent(body.url);
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
  ) {
    return this.registry.registerAgent(body);
  }

  @Post('agents/:id/heartbeat')
  @HttpCode(200)
  async updateHeartbeat(@Param('id') id: string) {
    return this.registry.updateHeartbeat(id);
  }

  @Delete('agents/:id')
  @HttpCode(204)
  async deregisterAgent(@Param('id') id: string) {
    await this.registry.deregisterAgent(id);
  }
}
