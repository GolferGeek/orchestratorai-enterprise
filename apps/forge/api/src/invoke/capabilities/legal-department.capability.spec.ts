/**
 * Unit tests for LegalDepartmentCapability
 *
 * Tests:
 * - onModuleInit() registers with capability registry under 'legal-department'
 * - invoke() dispatches to LegalDepartmentService.process() with userMessage
 * - invoke() throws when userMessage is missing from data.content
 * - invoke() returns InvokeOutput with outputType 'json'
 * - getCard() returns valid CapabilityCard with slug 'legal-department'
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeData } from '@orchestrator-ai/transport-types';
import { LegalDepartmentCapability } from './legal-department.capability';
import { CapabilityRegistryService } from '../capability-registry.service';
import { LegalDepartmentService } from '@/agents/legal-department/legal-department.service';
import { LegalIntelligenceService } from '@/agents/legal-department/services/legal-intelligence.service';
import { ObservabilityService } from '@/agents/shared/services/observability.service';
import type { LegalDocumentMetadata } from '@/agents/legal-department/legal-department.state';

describe('LegalDepartmentCapability', () => {
  let capability: LegalDepartmentCapability;
  let mockRegistry: jest.Mocked<Pick<CapabilityRegistryService, 'register'>>;
  let mockLegalService: jest.Mocked<Pick<LegalDepartmentService, 'process'>>;
  let mockLegalIntelligence: jest.Mocked<
    Pick<LegalIntelligenceService, 'extractMetadata'>
  >;
  let mockObservability: jest.Mocked<Pick<ObservabilityService, 'emitProgress'>>;

  const mockContext = createMockExecutionContext({
    orgSlug: 'legal-org',
    conversationId: 'legal-conv-001',
    agentSlug: 'legal-department',
  });

  beforeEach(() => {
    mockRegistry = { register: jest.fn() };

    mockLegalService = {
      process: jest.fn().mockResolvedValue({
        conversationId: 'legal-conv-001',
        status: 'completed',
        userMessage: 'Review this NDA',
        response: 'The NDA contains a perpetual non-compete clause...',
        specialistOutputs: [],
        legalMetadata: null,
        routingDecision: 'contract',
        error: undefined,
        duration: 3100,
      }),
    };

    const minimalMeta = {
      documentType: { type: 'nda', confidence: 0.9 },
      sections: {
        sections: [],
        confidence: 0,
        structureType: 'formal' as const,
      },
      signatures: { signatures: [], confidence: 0, partyCount: 0 },
      dates: { dates: [], confidence: 0 },
      parties: { parties: [], confidence: 0 },
      confidence: {
        overall: 0.9,
        breakdown: {},
        factors: {
          textQuality: 1,
          extractionMethod: 'native' as const,
          completeness: 1,
          patternMatchCount: 0,
        },
      },
      extractedAt: new Date().toISOString(),
    } as LegalDocumentMetadata;

    mockLegalIntelligence = {
      extractMetadata: jest.fn().mockResolvedValue(minimalMeta),
    };

    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    };

    capability = new LegalDepartmentCapability(
      mockRegistry as unknown as CapabilityRegistryService,
      mockLegalService as unknown as LegalDepartmentService,
      mockLegalIntelligence as unknown as LegalIntelligenceService,
      mockObservability as unknown as ObservabilityService,
    );
  });

  // ─── Registration ────────────────────────────────────────────────────────

  it('registers itself with the capability registry under "legal-department"', () => {
    capability.onModuleInit();

    expect(mockRegistry.register).toHaveBeenCalledWith(
      'legal-department',
      capability,
    );
  });

  // ─── invoke() ───────────────────────────────────────────────────────────

  it('dispatches to LegalDepartmentService.process() with userMessage and documents', async () => {
    const data: InvokeData = {
      content: {
        userMessage: 'Review this NDA',
        documents: [
          { name: 'nda.pdf', content: 'This agreement...', type: 'nda' },
        ],
        legalMetadata: { jurisdiction: 'US' },
      },
    };

    await capability.invoke(mockContext, data);

    expect(mockLegalService.process).toHaveBeenCalledWith({
      context: mockContext,
      userMessage: 'Review this NDA',
      documents: [
        { name: 'nda.pdf', content: 'This agreement...', type: 'nda' },
      ],
      legalMetadata: { jurisdiction: 'US' },
    });
  });

  it('throws when data.content.userMessage is missing', async () => {
    const dataWithoutMessage: InvokeData = { content: { documents: [] } };

    await expect(
      capability.invoke(mockContext, dataWithoutMessage),
    ).rejects.toThrow('data.content.userMessage is required');
  });

  it('returns InvokeOutput with outputType "json" and legal response', async () => {
    const data: InvokeData = {
      content: { userMessage: 'What are my IP rights?' },
    };

    const output = await capability.invoke(mockContext, data);

    expect(output.outputType).toBe('json');
    const content = output.content as Record<string, unknown>;
    expect(content.conversationId).toBe('legal-conv-001');
    expect(content.status).toBe('completed');
  });

  it('passes ExecutionContext whole to underlying service', async () => {
    const data: InvokeData = { content: { userMessage: 'IP question' } };
    await capability.invoke(mockContext, data);

    const callArg = mockLegalService.process.mock.calls[0]![0];
    expect(callArg.context).toBe(mockContext);
  });

  // ─── getCard() ──────────────────────────────────────────────────────────

  it('returns a valid CapabilityCard with slug "legal-department"', () => {
    const card = capability.getCard();

    expect(card.slug).toBe('legal-department');
    expect(card.id).toBe('forge-legal-department');
    expect(card.discoverable).toBe(true);
  });

  it('identifies as langgraph agentType in metadata', () => {
    const card = capability.getCard();

    expect(card.metadata?.agentType).toBe('langgraph');
  });
});
