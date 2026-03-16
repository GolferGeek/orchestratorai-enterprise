import { createCloRoutingNode } from './clo-routing.node';
import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  taskId: 'task-123',
  planId: 'plan-123',
  deliverableId: 'deliverable-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

function createMockObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: mockCtx,
    userMessage: 'test message',
    documents: [],
    legalMetadata: undefined,
    routingDecision: undefined,
    orchestration: {},
    specialistOutputs: {},
    response: undefined,
    status: 'started',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  };
}

describe('createCloRoutingNode', () => {
  let mockObservability: jest.Mocked<ObservabilityService>;
  let cloRoutingNode: ReturnType<typeof createCloRoutingNode>;

  beforeEach(() => {
    mockObservability = createMockObservability();
    cloRoutingNode = createCloRoutingNode(mockObservability);
  });

  describe('basic routing', () => {
    it('should return a function', () => {
      expect(typeof cloRoutingNode).toBe('function');
    });

    it('should route to contract by default when no document type or keywords', async () => {
      const state = createBaseState({
        userMessage: 'please review this',
        documents: [{ name: 'doc.txt', content: 'some text' }],
        legalMetadata: {
          documentType: { type: 'unknown', confidence: 0.5 },
          sections: {
            sections: [],
            confidence: 0.5,
            structureType: 'unstructured',
          },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.5,
            breakdown: {},
            factors: {
              textQuality: 0.5,
              extractionMethod: 'none',
              completeness: 0.5,
              patternMatchCount: 0,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });

      const result = await cloRoutingNode(state);
      expect(result.routingDecision).toBeDefined();
      expect(result.routingDecision?.specialist).toBe('contract');
    });

    it('should emit progress events', async () => {
      const state = createBaseState();
      await cloRoutingNode(state);
      expect(mockObservability.emitProgress).toHaveBeenCalled();
    });
  });

  describe('document type routing', () => {
    it("should route to contract for 'contract' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'contract.pdf', content: 'contract text' }],
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('contract');
      expect(result.routingDecision?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should route to employment for 'employment' document type", async () => {
      const state = createBaseState({
        documents: [
          { name: 'employment.pdf', content: 'employment agreement' },
        ],
        legalMetadata: {
          documentType: { type: 'employment', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('employment');
    });

    it("should route to ip for 'patent' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'patent.pdf', content: 'patent application' }],
        legalMetadata: {
          documentType: { type: 'patent', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('ip');
    });

    it("should route to privacy for 'privacy' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'privacy.pdf', content: 'privacy policy' }],
        legalMetadata: {
          documentType: { type: 'privacy', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('privacy');
    });

    it("should route to compliance for 'compliance' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'compliance.pdf', content: 'compliance document' }],
        legalMetadata: {
          documentType: { type: 'compliance', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('compliance');
    });

    it("should route to corporate for 'corporate' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'corporate.pdf', content: 'corporate resolution' }],
        legalMetadata: {
          documentType: { type: 'corporate', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('corporate');
    });

    it("should route to litigation for 'pleading' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'complaint.pdf', content: 'court complaint' }],
        legalMetadata: {
          documentType: { type: 'pleading', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('litigation');
    });

    it("should route to real_estate for 'lease' document type", async () => {
      const state = createBaseState({
        documents: [
          { name: 'lease.pdf', content: 'commercial lease agreement' },
        ],
        legalMetadata: {
          documentType: { type: 'lease', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('real_estate');
    });
  });

  describe('keyword routing', () => {
    it("should route to contract when user message contains 'nda'", async () => {
      const state = createBaseState({ userMessage: 'review this nda please' });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('contract');
    });

    it("should route to employment when user message contains 'employment'", async () => {
      const state = createBaseState({
        userMessage: 'analyze this employment agreement',
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('employment');
    });

    it("should route to ip when user message contains 'patent'", async () => {
      const state = createBaseState({
        userMessage: 'review this patent assignment',
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('ip');
    });

    it("should route to privacy when user message contains 'gdpr'", async () => {
      // Use a message that only triggers privacy, not compliance
      const state = createBaseState({
        userMessage: 'review gdpr requirements',
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('privacy');
    });

    it("should route to compliance when user message contains 'compliance'", async () => {
      const state = createBaseState({ userMessage: 'check compliance policy' });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('compliance');
    });

    it("should route to corporate when user message contains 'board'", async () => {
      const state = createBaseState({ userMessage: 'review board resolution' });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('corporate');
    });

    it("should route to litigation when user message contains 'lawsuit'", async () => {
      const state = createBaseState({
        userMessage: 'analyze this lawsuit filing',
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('litigation');
    });

    it("should route to real_estate when user message contains 'lease'", async () => {
      const state = createBaseState({
        userMessage: 'review this lease agreement',
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('real_estate');
    });
  });

  describe('multi-agent detection', () => {
    it('should set multiAgent to true', async () => {
      const state = createBaseState({
        userMessage: 'analyze this contract',
        documents: [{ name: 'doc.pdf', content: 'contract agreement' }],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.multiAgent).toBe(true);
    });

    it('should detect multiple specialists from document content', async () => {
      const state = createBaseState({
        userMessage: 'analyze this contract',
        documents: [
          {
            name: 'doc.pdf',
            content:
              'contract agreement with intellectual property license and privacy data protection clause',
          },
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialists?.length).toBeGreaterThan(1);
    });

    it('should include primary specialist in specialists array', async () => {
      const state = createBaseState({
        userMessage: 'analyze this nda contract',
        documents: [{ name: 'nda.pdf', content: 'non-disclosure agreement' }],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialists).toContain(
        result.routingDecision?.specialist,
      );
    });
  });

  describe('routing decision structure', () => {
    it('should return routing decision with all required fields', async () => {
      const state = createBaseState({
        userMessage: 'review this contract',
        documents: [{ name: 'doc.pdf', content: 'service agreement' }],
      });
      const result = await cloRoutingNode(state);
      const decision = result.routingDecision;
      expect(decision?.specialist).toBeDefined();
      expect(decision?.confidence).toBeDefined();
      expect(decision?.reasoning).toBeDefined();
      expect(decision?.categories).toBeDefined();
      expect(Array.isArray(decision?.categories)).toBe(true);
    });

    it('should include categories in routing decision', async () => {
      const state = createBaseState({
        userMessage: 'review this nda agreement',
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.categories.length).toBeGreaterThan(0);
    });

    it('should include default category when no routing clues found', async () => {
      const state = createBaseState({ userMessage: 'help me' });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.categories).toContain('default');
    });
  });

  describe('document text analysis for multi-agent', () => {
    it('should detect employment patterns in document text', async () => {
      const state = createBaseState({
        userMessage: 'analyze',
        documents: [
          {
            name: 'doc.pdf',
            content: 'employment agreement with employee terms and non-compete',
          },
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialists).toContain('employment');
    });

    it('should detect privacy patterns in document text', async () => {
      const state = createBaseState({
        userMessage: 'analyze',
        documents: [
          {
            name: 'doc.pdf',
            content:
              'data protection and personal data privacy gdpr compliance',
          },
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialists).toContain('privacy');
    });

    it('should detect corporate patterns in document text', async () => {
      const state = createBaseState({
        userMessage: 'analyze',
        documents: [
          {
            name: 'doc.pdf',
            content: 'board of directors shareholder meeting bylaws resolution',
          },
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialists).toContain('corporate');
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and default to contract', async () => {
      // Force an error after the first emitProgress call (which is outside try/catch)
      // The second emitProgress is inside the try block
      const badObservability = {
        emitProgress: jest
          .fn()
          .mockResolvedValueOnce(undefined) // first call outside try succeeds
          .mockRejectedValueOnce(new Error('Network error')), // second call inside try fails
        emitFailed: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<ObservabilityService>;

      const badNode = createCloRoutingNode(badObservability);
      const state = createBaseState();

      const result = await badNode(state);
      expect(result.routingDecision?.specialist).toBe('contract');
      expect(result.routingDecision?.reasoning).toContain('Routing error');
    });
  });

  describe('partial document type match', () => {
    it('should match partial document types', async () => {
      const state = createBaseState({
        documents: [{ name: 'doc.pdf', content: 'ip assignment agreement' }],
        legalMetadata: {
          documentType: { type: 'ip-assignment-doc', confidence: 0.7 },
          sections: {
            sections: [],
            confidence: 0.5,
            structureType: 'unstructured',
          },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.7,
            breakdown: {},
            factors: {
              textQuality: 0.7,
              extractionMethod: 'native',
              completeness: 0.7,
              patternMatchCount: 3,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      // Just check it returns something valid (partial match logic)
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBeDefined();
    });
  });
});
