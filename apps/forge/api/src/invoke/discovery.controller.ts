/**
 * Discovery Controller
 *
 * Exposes the well-known capability listing endpoint so consumers can
 * discover what capabilities Forge hosts and how to invoke them.
 *
 * GET /.well-known/capabilities  — lists all discoverable capability cards
 */

import { Controller, Get } from '@nestjs/common';
import type { WellKnownListing } from '@orchestrator-ai/transport-types';
import { CapabilityRegistryService } from './capability-registry.service';
import { Public } from '../auth/decorators/public.decorator';

// A2A capability discovery (.well-known) — must be reachable without auth
// for cross-product bootstrap.
@Public()
@Controller('.well-known')
export class DiscoveryController {
  constructor(private readonly registry: CapabilityRegistryService) {}

  @Get('capabilities')
  getCapabilities(): WellKnownListing {
    const cards = this.registry.getDiscoverableCards();

    return {
      product: 'forge',
      version: '2.0',
      capabilities: cards.map((card) => ({
        slug: card.slug,
        name: card.name,
        description: card.description,
        kind: card.kind,
        streaming: card.invoke.streaming,
        outputTypes: card.outputTypes,
      })),
    };
  }
}
