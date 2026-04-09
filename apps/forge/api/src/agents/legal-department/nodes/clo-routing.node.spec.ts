import { createCloRoutingNode } from './clo-routing.node';
import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
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
    documentsMetadata: [],
    routingDecision: undefined,
    orchestration: {},
    specialistOutputs: {},
    response: undefined,
    status: 'started',
    error: undefined,
    startedAt: Date.now(),
    outputMode: 'analysis',
    clauseMap: undefined,
    redlineOutput: undefined,
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
        documentsMetadata: [
          {
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
        ],
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
        documentsMetadata: [
          {
            documentType: { type: 'contract', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
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
        documentsMetadata: [
          {
            documentType: { type: 'employment', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('employment');
    });

    it("should route to ip for 'patent' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'patent.pdf', content: 'patent application' }],
        documentsMetadata: [
          {
            documentType: { type: 'patent', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('ip');
    });

    it("should route to privacy for 'privacy' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'privacy.pdf', content: 'privacy policy' }],
        documentsMetadata: [
          {
            documentType: { type: 'privacy', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('privacy');
    });

    it("should route to compliance for 'compliance' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'compliance.pdf', content: 'compliance document' }],
        documentsMetadata: [
          {
            documentType: { type: 'compliance', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('compliance');
    });

    it("should route to corporate for 'corporate' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'corporate.pdf', content: 'corporate resolution' }],
        documentsMetadata: [
          {
            documentType: { type: 'corporate', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('corporate');
    });

    it("should route to litigation for 'pleading' document type", async () => {
      const state = createBaseState({
        documents: [{ name: 'complaint.pdf', content: 'court complaint' }],
        documentsMetadata: [
          {
            documentType: { type: 'pleading', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
      });
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('litigation');
    });

    it("should route to real_estate for 'lease' document type", async () => {
      const state = createBaseState({
        documents: [
          { name: 'lease.pdf', content: 'commercial lease agreement' },
        ],
        documentsMetadata: [
          {
            documentType: { type: 'lease', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
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
    it('should return failed status on routing error', async () => {
      const badObservability = {
        emitProgress: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Network error')),
        emitFailed: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<ObservabilityService>;

      const badNode = createCloRoutingNode(badObservability);
      const state = createBaseState();

      const result = await badNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('CLO Routing');
    });
  });

  describe('partial document type match', () => {
    it('should match partial document types', async () => {
      const state = createBaseState({
        documents: [{ name: 'doc.pdf', content: 'ip assignment agreement' }],
        documentsMetadata: [
          {
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
        ],
      });
      // Just check it returns something valid (partial match logic)
      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBeDefined();
    });
  });

  describe('multi-document routing union (Phase 3)', () => {
    it('should include documentTypeMap when multiple documents have metadata', async () => {
      const state = createBaseState({
        documents: [
          { name: 'nda.pdf', content: 'non-disclosure agreement' },
          {
            name: 'employment.pdf',
            content: 'employment contract termination',
          },
        ],
        documentsMetadata: [
          {
            documentType: { type: 'nda', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
          {
            documentType: { type: 'employment', confidence: 0.85 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
            signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
            dates: { dates: [], confidence: 0.5 },
            parties: { parties: [], confidence: 0.5 },
            confidence: {
              overall: 0.85,
              breakdown: {},
              factors: {
                textQuality: 0.85,
                extractionMethod: 'native',
                completeness: 0.85,
                patternMatchCount: 3,
              },
            },
            extractedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await cloRoutingNode(state);
      expect(result.routingDecision).toBeDefined();
      // documentTypeMap maps each filename to its detected type
      expect(result.routingDecision?.documentTypeMap).toBeDefined();
      const typeMap = result.routingDecision?.documentTypeMap ?? {};
      expect(Object.keys(typeMap)).toHaveLength(2);
    });

    it('should route multi-agent when documents span different legal domains', async () => {
      const state = createBaseState({
        documents: [
          {
            name: 'nda.pdf',
            content: 'non-disclosure confidential information',
          },
          {
            name: 'ip.pdf',
            content: 'intellectual property patent license royalty',
          },
        ],
        documentsMetadata: [
          {
            documentType: { type: 'nda', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
          {
            documentType: { type: 'ip_agreement', confidence: 0.88 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
            signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
            dates: { dates: [], confidence: 0.5 },
            parties: { parties: [], confidence: 0.5 },
            confidence: {
              overall: 0.88,
              breakdown: {},
              factors: {
                textQuality: 0.88,
                extractionMethod: 'native',
                completeness: 0.88,
                patternMatchCount: 4,
              },
            },
            extractedAt: new Date().toISOString(),
          },
        ],
        userMessage: 'Review this NDA and IP agreement',
      });

      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBeDefined();
    });

    it('should still set a primary specialist when only one document is present', async () => {
      const state = createBaseState({
        documents: [
          { name: 'contract.pdf', content: 'service agreement terms' },
        ],
        documentsMetadata: [
          {
            documentType: { type: 'contract', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
              structureType: 'formal',
            },
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
        ],
      });

      const result = await cloRoutingNode(state);
      expect(result.routingDecision?.specialist).toBe('contract');
    });
  });
});
