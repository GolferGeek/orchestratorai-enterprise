/**
 * Unit tests for MarketingSwarmCapability
 *
 * Tests:
 * - onModuleInit() registers with capability registry under 'marketing-swarm'
 * - invoke() dispatches to MarketingSwarmService.execute() with correct input
 * - invoke() throws when conversationId is missing from context
 * - invoke() returns InvokeOutput with outputType 'json'
 * - getCard() returns valid CapabilityCard with slug 'marketing-swarm'
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeData } from '@orchestrator-ai/transport-types';
import { MarketingSwarmCapability } from './marketing-swarm.capability';
import { CapabilityRegistryService } from '../capability-registry.service';
import { MarketingSwarmService } from '@/agents/marketing-swarm/marketing-swarm.service';

describe('MarketingSwarmCapability', () => {
  let capability: MarketingSwarmCapability;
  let mockRegistry: jest.Mocked<Pick<CapabilityRegistryService, 'register'>>;
  let mockMarketingService: jest.Mocked<Pick<MarketingSwarmService, 'execute'>>;

  const mockContext = createMockExecutionContext({
    orgSlug: 'marketing-org',
    conversationId: 'swarm-conv-789',
    agentSlug: 'marketing-swarm',
  });

  beforeEach(() => {
    mockRegistry = { register: jest.fn() };

    mockMarketingService = {
      execute: jest.fn().mockResolvedValue({
        status: 'completed',
        outputs: [{ agentSlug: 'writer-1', content: 'Draft post...' }],
        evaluations: [],
        winner: { agentSlug: 'writer-1', content: 'Draft post...' },
        deliverable: null,
        versionedDeliverable: null,
        error: undefined,
        duration: 4200,
      }),
    };

    capability = new MarketingSwarmCapability(
      mockRegistry as unknown as CapabilityRegistryService,
      mockMarketingService as unknown as MarketingSwarmService,
    );
  });

  // ─── Registration ────────────────────────────────────────────────────────

  it('registers itself with the capability registry under "marketing-swarm"', () => {
    capability.onModuleInit();

    expect(mockRegistry.register).toHaveBeenCalledWith('marketing-swarm', capability);
  });

  // ─── invoke() ───────────────────────────────────────────────────────────

  it('dispatches to MarketingSwarmService.execute() with conversationId as taskId', async () => {
    const data: InvokeData = {
      content: {
        contentTypeSlug: 'linkedin-post',
        contentTypeContext: 'B2B SaaS announcement',
        promptData: { topic: 'AI-powered productivity' },
      },
    };

    await capability.invoke(mockContext, data);

    expect(mockMarketingService.execute).toHaveBeenCalledWith({
      context: mockContext,
      taskId: 'swarm-conv-789',
      contentTypeSlug: 'linkedin-post',
      contentTypeContext: 'B2B SaaS announcement',
      promptData: { topic: 'AI-powered productivity' },
      config: undefined,
    });
  });

  it('throws when ExecutionContext.conversationId is missing', async () => {
    const contextWithoutConversation = createMockExecutionContext({ conversationId: '' });

    await expect(
      capability.invoke(contextWithoutConversation, { content: {} }),
    ).rejects.toThrow('ExecutionContext.conversationId is required');
  });

  it('returns InvokeOutput with outputType "json" and swarm results', async () => {
    const output = await capability.invoke(mockContext, { content: {} });

    expect(output.outputType).toBe('json');
    const content = output.content as Record<string, unknown>;
    expect(content.conversationId).toBe('swarm-conv-789');
    expect(content.status).toBe('completed');
  });

  // ─── getCard() ──────────────────────────────────────────────────────────

  it('returns a valid CapabilityCard with slug "marketing-swarm"', () => {
    const card = capability.getCard();

    expect(card.slug).toBe('marketing-swarm');
    expect(card.id).toBe('forge-marketing-swarm');
    expect(card.discoverable).toBe(true);
    expect(card.kind).toBe('workflow');
  });

  it('identifies as swarm agentType in metadata', () => {
    const card = capability.getCard();

    expect(card.metadata?.agentType).toBe('swarm');
  });
});
