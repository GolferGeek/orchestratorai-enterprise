/**
 * Unit tests for CadAgentCapability
 *
 * Tests:
 * - onModuleInit() registers with capability registry under 'cad-agent'
 * - invoke() dispatches to CadAgentService.generate() with userMessage
 * - invoke() throws when userMessage is missing
 * - invoke() accepts plain string content as userMessage
 * - getCard() returns valid CapabilityCard with slug 'cad-agent'
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeData } from '@orchestrator-ai/transport-types';
import { CadAgentCapability } from './cad-agent.capability';
import { CapabilityRegistryService } from '../capability-registry.service';
import { CadAgentService } from '@/agents/cad-agent/cad-agent.service';

describe('CadAgentCapability', () => {
  let capability: CadAgentCapability;
  let mockRegistry: jest.Mocked<Pick<CapabilityRegistryService, 'register'>>;
  let mockCadService: jest.Mocked<Pick<CadAgentService, 'generate'>>;

  const mockContext = createMockExecutionContext({
    orgSlug: 'engineering-org',
    conversationId: 'cad-conv-999',
    agentSlug: 'cad-agent',
  });

  beforeEach(() => {
    mockRegistry = { register: jest.fn() };

    mockCadService = {
      generate: jest.fn().mockResolvedValue({
        conversationId: 'cad-conv-999',
        status: 'completed',
        userMessage: 'Create a 10x10x10 cube',
        generatedCode: 'function createModel(oc) { ... }',
        outputs: {
          step: 'https://storage/model.step',
          gltf: 'https://storage/model.gltf',
        },
        meshStats: { vertices: 8, faces: 12 },
        error: undefined,
        duration: 8500,
      }),
    };

    capability = new CadAgentCapability(
      mockRegistry as unknown as CapabilityRegistryService,
      mockCadService as unknown as CadAgentService,
    );
  });

  // ─── Registration ────────────────────────────────────────────────────────

  it('registers itself with the capability registry under "cad-agent"', () => {
    capability.onModuleInit();

    expect(mockRegistry.register).toHaveBeenCalledWith('cad-agent', capability);
  });

  // ─── invoke() ───────────────────────────────────────────────────────────

  it('dispatches to CadAgentService.generate() with full input', async () => {
    const data: InvokeData = {
      content: {
        userMessage: 'Create a 10x10x10 cube',
        projectId: 'proj-123',
        newProjectName: undefined,
        constraints: { units: 'mm' },
      },
    };

    await capability.invoke(mockContext, data);

    expect(mockCadService.generate).toHaveBeenCalledWith({
      context: mockContext,
      userMessage: 'Create a 10x10x10 cube',
      projectId: 'proj-123',
      newProjectName: undefined,
      constraints: { units: 'mm' },
    });
  });

  it('throws when userMessage is missing from content', async () => {
    const dataWithoutMessage: InvokeData = {
      content: { projectId: 'proj-123' },
    };

    await expect(
      capability.invoke(mockContext, dataWithoutMessage),
    ).rejects.toThrow('data.content.userMessage is required');
  });

  it('accepts a plain string as content and uses it as userMessage', async () => {
    const data: InvokeData = {
      content: 'Create a bracket' as unknown as Record<string, unknown>,
    };

    await capability.invoke(mockContext, data);

    const callArg = mockCadService.generate.mock.calls[0]![0];
    expect(callArg.userMessage).toBe('Create a bracket');
  });

  it('returns InvokeOutput with outputType "json" and CAD result', async () => {
    const data: InvokeData = { content: { userMessage: 'Create a cube' } };

    const output = await capability.invoke(mockContext, data);

    expect(output.outputType).toBe('json');
    const content = output.content as Record<string, unknown>;
    expect(content.conversationId).toBe('cad-conv-999');
    expect(content.status).toBe('completed');
    expect(content.generatedCode).toBeDefined();
  });

  // ─── getCard() ──────────────────────────────────────────────────────────

  it('returns a valid CapabilityCard with slug "cad-agent"', () => {
    const card = capability.getCard();

    expect(card.slug).toBe('cad-agent');
    expect(card.id).toBe('forge-cad-agent');
    expect(card.discoverable).toBe(true);
    expect(card.kind).toBe('workflow');
  });

  it('includes supported output formats in metadata', () => {
    const card = capability.getCard();

    const formats = card.metadata?.outputFormats as string[];
    expect(formats).toContain('STEP');
    expect(formats).toContain('STL');
    expect(formats).toContain('GLTF');
  });
});
