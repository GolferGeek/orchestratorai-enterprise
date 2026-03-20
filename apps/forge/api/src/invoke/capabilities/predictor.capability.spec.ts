/**
 * Unit tests for PredictorCapability
 *
 * Tests:
 * - onModuleInit() registers with capability registry under 'predictor' slug
 * - invoke() dispatches to PredictorService.process() with correct input
 * - invoke() returns InvokeOutput with outputType 'json'
 * - getCard() returns a valid CapabilityCard with slug 'predictor'
 * - getCard() identifies capability as dashboard agentType
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeData } from '@orchestrator-ai/transport-types';
import { PredictorCapability } from './predictor.capability';
import { CapabilityRegistryService } from '../capability-registry.service';
import { PredictorService } from '@/agents/predictor/predictor.service';

describe('PredictorCapability', () => {
  let capability: PredictorCapability;
  let mockRegistry: jest.Mocked<Pick<CapabilityRegistryService, 'register'>>;
  let mockPredictorService: jest.Mocked<Pick<PredictorService, 'process'>>;

  const mockContext = createMockExecutionContext({
    orgSlug: 'finance-org',
    agentSlug: 'predictor',
  });

  beforeEach(() => {
    mockRegistry = {
      register: jest.fn(),
    };

    mockPredictorService = {
      process: jest.fn().mockResolvedValue({
        status: 'completed',
        response: { predictions: [{ ticker: 'AAPL', score: 0.87 }] },
        error: undefined,
        duration: 120,
      }),
    };

    capability = new PredictorCapability(
      mockRegistry as unknown as CapabilityRegistryService,
      mockPredictorService as unknown as PredictorService,
    );
  });

  // ─── Registration ────────────────────────────────────────────────────────

  it('registers itself with the capability registry under "predictor"', () => {
    capability.onModuleInit();

    expect(mockRegistry.register).toHaveBeenCalledWith('predictor', capability);
  });

  // ─── invoke() ───────────────────────────────────────────────────────────

  it('dispatches to PredictorService.process() with context and content fields', async () => {
    const data: InvokeData = {
      content: {
        userMessage: 'List all predictions',
        mode: 'dashboard',
        action: 'predictions.list',
        payload: { params: {} },
      },
    };

    await capability.invoke(mockContext, data);

    expect(mockPredictorService.process).toHaveBeenCalledWith({
      context: mockContext,
      userMessage: 'List all predictions',
      mode: 'dashboard',
      action: 'predictions.list',
      payload: { params: {} },
    });
  });

  it('returns InvokeOutput with outputType "json"', async () => {
    const output = await capability.invoke(mockContext, { content: {} });

    expect(output.outputType).toBe('json');
    expect(output.content).toMatchObject({
      status: 'completed',
      response: expect.anything(),
    });
  });

  it('passes ExecutionContext whole — does not destructure it', async () => {
    await capability.invoke(mockContext, { content: { mode: 'dashboard' } });

    const callArg = mockPredictorService.process.mock.calls[0]![0];
    expect(callArg.context).toBe(mockContext);
  });

  // ─── getCard() ──────────────────────────────────────────────────────────

  it('returns a valid CapabilityCard with slug "predictor"', () => {
    const card = capability.getCard();

    expect(card.slug).toBe('predictor');
    expect(card.id).toBe('forge-predictor');
    expect(card.discoverable).toBe(true);
    expect(card.kind).toBe('workflow');
  });

  it('identifies as dashboard agentType in metadata', () => {
    const card = capability.getCard();

    expect(card.metadata?.agentType).toBe('dashboard');
    expect(card.metadata?.product).toBe('forge');
  });
});
