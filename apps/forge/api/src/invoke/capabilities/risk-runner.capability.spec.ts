/**
 * Unit tests for RiskRunnerCapability
 *
 * Tests:
 * - onModuleInit() registers with capability registry under 'risk-runner' slug
 * - invoke() dispatches to RiskRunnerService.process() with correct input
 * - invoke() returns InvokeOutput with outputType 'json'
 * - getCard() returns valid CapabilityCard with slug 'risk-runner'
 * - getCard() identifies capability as dashboard agentType
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeData } from '@orchestrator-ai/transport-types';
import { RiskRunnerCapability } from './risk-runner.capability';
import { CapabilityRegistryService } from '../capability-registry.service';
import { RiskRunnerService } from '@/agents/risk-runner/risk-runner.service';

describe('RiskRunnerCapability', () => {
  let capability: RiskRunnerCapability;
  let mockRegistry: jest.Mocked<Pick<CapabilityRegistryService, 'register'>>;
  let mockRiskRunnerService: jest.Mocked<Pick<RiskRunnerService, 'process'>>;

  const mockContext = createMockExecutionContext({
    orgSlug: 'risk-org',
    agentSlug: 'risk-runner',
  });

  beforeEach(() => {
    mockRegistry = {
      register: jest.fn(),
    };

    mockRiskRunnerService = {
      process: jest.fn().mockResolvedValue({
        status: 'completed',
        response: { scopes: [{ id: 'scope-1', name: 'US Equities' }] },
        error: undefined,
        duration: 85,
      }),
    };

    capability = new RiskRunnerCapability(
      mockRegistry as unknown as CapabilityRegistryService,
      mockRiskRunnerService as unknown as RiskRunnerService,
    );
  });

  // ─── Registration ────────────────────────────────────────────────────────

  it('registers itself with the capability registry under "risk-runner"', () => {
    capability.onModuleInit();

    expect(mockRegistry.register).toHaveBeenCalledWith('risk-runner', capability);
  });

  // ─── invoke() ───────────────────────────────────────────────────────────

  it('dispatches to RiskRunnerService.process() with context and content fields', async () => {
    const data: InvokeData = {
      content: {
        userMessage: '',
        mode: 'dashboard',
        action: 'scopes.list',
        payload: { params: {} },
      },
    };

    await capability.invoke(mockContext, data);

    expect(mockRiskRunnerService.process).toHaveBeenCalledWith({
      context: mockContext,
      userMessage: '',
      mode: 'dashboard',
      action: 'scopes.list',
      payload: { params: {} },
    });
  });

  it('returns InvokeOutput with outputType "json"', async () => {
    const output = await capability.invoke(mockContext, { content: {} });

    expect(output.outputType).toBe('json');
    expect(output.content).toMatchObject({ status: 'completed' });
  });

  it('falls back to metadata for mode and action when not in content', async () => {
    const data: InvokeData = { content: {} };
    const metadata = { mode: 'dashboard', action: 'alerts.list' };

    await capability.invoke(mockContext, data, metadata);

    const callArg = mockRiskRunnerService.process.mock.calls[0]![0];
    expect(callArg.mode).toBe('dashboard');
    expect(callArg.action).toBe('alerts.list');
  });

  // ─── getCard() ──────────────────────────────────────────────────────────

  it('returns a valid CapabilityCard with slug "risk-runner"', () => {
    const card = capability.getCard();

    expect(card.slug).toBe('risk-runner');
    expect(card.id).toBe('forge-risk-runner');
    expect(card.discoverable).toBe(true);
  });

  it('identifies as dashboard agentType in metadata', () => {
    const card = capability.getCard();

    expect(card.metadata?.agentType).toBe('dashboard');
    expect(card.metadata?.product).toBe('forge');
  });
});
