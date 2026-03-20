/**
 * CapabilityRegistryService unit tests
 *
 * Tests register/invoke dispatch, getDiscoverableCards filtering,
 * unknown capability error, and observability event emission.
 */

import { CapabilityRegistryService } from './capability-registry.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { CapabilityCard, InvokeOutput } from '@orchestrator-ai/transport-types';
import type { CapabilityHandler } from './capability-registry.service';

const mockOutput: InvokeOutput = { content: 'capability output', outputType: 'text' };

function buildCard(overrides?: Partial<CapabilityCard>): CapabilityCard {
  return {
    id: 'cap-1',
    slug: 'marketing-swarm',
    name: 'Marketing Swarm',
    kind: 'workflow',
    discoverable: true,
    invoke: { method: 'invoke', streaming: true },
    outputTypes: ['text', 'markdown'],
    ...overrides,
  };
}

function buildHandler(card: CapabilityCard): jest.Mocked<CapabilityHandler> {
  return {
    invoke: jest.fn().mockResolvedValue(mockOutput),
    getCard: jest.fn().mockReturnValue(card),
  };
}

function buildObservability() {
  return { emitInvocationEvent: jest.fn().mockResolvedValue(undefined) };
}

describe('CapabilityRegistryService', () => {
  let service: CapabilityRegistryService;
  let observability: ReturnType<typeof buildObservability>;

  beforeEach(() => {
    observability = buildObservability();
    service = new CapabilityRegistryService(observability as never);
  });

  describe('register + invoke', () => {
    it('dispatches invoke to the registered handler matching agentSlug', async () => {
      const handler = buildHandler(buildCard());
      service.register('marketing-swarm', handler);

      const context = createMockExecutionContext({ agentSlug: 'marketing-swarm' });
      const output = await service.invoke(context, { content: 'brief' });

      expect(handler.invoke).toHaveBeenCalledWith(context, { content: 'brief' }, undefined);
      expect(output).toEqual(mockOutput);
    });

    it('emits invocation.started and invocation.completed events', async () => {
      const handler = buildHandler(buildCard());
      service.register('marketing-swarm', handler);
      const context = createMockExecutionContext({ agentSlug: 'marketing-swarm' });

      await service.invoke(context, { content: 'test' });

      const events = observability.emitInvocationEvent.mock.calls;
      expect(events[0]?.[1]?.type).toBe('invocation.started');
      expect(events[1]?.[1]?.type).toBe('invocation.completed');
      expect(events[1]?.[1]?.sourceApp).toBe('forge');
    });
  });

  describe('invoke — unknown capability', () => {
    it('throws and emits invocation.failed for unregistered capability slug', async () => {
      const context = createMockExecutionContext({ agentSlug: 'ghost' });

      await expect(service.invoke(context, { content: 'test' })).rejects.toThrow(
        'Unknown capability: ghost',
      );

      const events = observability.emitInvocationEvent.mock.calls;
      expect(events[1]?.[1]?.type).toBe('invocation.failed');
    });
  });

  describe('getDiscoverableCards', () => {
    it('returns only cards where discoverable is true', () => {
      service.register('public-cap', buildHandler(buildCard({ slug: 'public-cap', discoverable: true })));
      service.register('private-cap', buildHandler(buildCard({ slug: 'private-cap', discoverable: false })));

      const cards = service.getDiscoverableCards();

      expect(cards).toHaveLength(1);
      expect(cards[0]?.slug).toBe('public-cap');
    });
  });
});
