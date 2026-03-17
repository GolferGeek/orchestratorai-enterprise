/**
 * DiscoveryController unit tests
 *
 * Tests GET /.well-known/capabilities returns a WellKnownListing
 * shaped correctly from the capability registry cards.
 */

import { DiscoveryController } from './discovery.controller';
import { CapabilityRegistryService } from './capability-registry.service';
import type { CapabilityCard } from '@orchestrator-ai/transport-types';

function buildCard(slug: string): CapabilityCard {
  return {
    id: `cap-${slug}`,
    slug,
    name: `${slug} capability`,
    description: `Description for ${slug}`,
    kind: 'workflow',
    discoverable: true,
    invoke: { method: 'invoke', streaming: false, outputTypes: ['text'] },
    outputTypes: ['text'],
  };
}

describe('DiscoveryController', () => {
  let controller: DiscoveryController;
  let registry: jest.Mocked<Pick<CapabilityRegistryService, 'getDiscoverableCards'>>;

  beforeEach(() => {
    registry = {
      getDiscoverableCards: jest.fn().mockReturnValue([
        buildCard('marketing-swarm'),
        buildCard('legal-department'),
      ]),
    };

    controller = new DiscoveryController(registry as unknown as CapabilityRegistryService);
  });

  describe('getCapabilities', () => {
    it('returns WellKnownListing with product forge and version 2.0', () => {
      const listing = controller.getCapabilities();

      expect(listing.product).toBe('forge');
      expect(listing.version).toBe('2.0');
    });

    it('includes one entry per discoverable capability card', () => {
      const listing = controller.getCapabilities();

      expect(listing.capabilities).toHaveLength(2);
      expect(listing.capabilities[0]?.slug).toBe('marketing-swarm');
      expect(listing.capabilities[1]?.slug).toBe('legal-department');
    });

    it('maps card fields to WellKnownEntry shape', () => {
      const listing = controller.getCapabilities();
      const entry = listing.capabilities[0];

      expect(entry).toMatchObject({
        slug: 'marketing-swarm',
        name: 'marketing-swarm capability',
        kind: 'workflow',
        streaming: false,
      });
    });

    it('returns empty capabilities array when registry has no discoverable cards', () => {
      registry.getDiscoverableCards.mockReturnValueOnce([]);

      const listing = controller.getCapabilities();

      expect(listing.capabilities).toHaveLength(0);
    });
  });
});
