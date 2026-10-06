import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DiscoveryMissing, GatehouseDiscoveryService } from './discovery.service';

const ORG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Public: how an outside agent finds a company. A company's own domain
 * rewrites its /.well-known/agent-card.json and /.well-known/agents.json to these.
 */
@Controller('gatehouse/orgs')
export class GatehouseDiscoveryController {
  constructor(private readonly discovery: GatehouseDiscoveryService) {}

  @Get(':org/agent-card.json')
  card(@Param('org') org: string, @Res({ passthrough: true }) response: Response) {
    return this.answer(org, response, () => this.discovery.companyCard(org));
  }

  @Get(':org/agents.json')
  catalog(@Param('org') org: string, @Res({ passthrough: true }) response: Response) {
    return this.answer(org, response, () => this.discovery.catalog(org));
  }

  private async answer<T>(org: string, response: Response, work: () => Promise<T>): Promise<T> {
    if (!ORG.test(org)) throw new NotFoundException(`No organization ${org}`);
    try {
      const body = await work();
      response.setHeader('Cache-Control', 'public, max-age=300');
      return body;
    } catch (error) {
      if (error instanceof DiscoveryMissing) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
