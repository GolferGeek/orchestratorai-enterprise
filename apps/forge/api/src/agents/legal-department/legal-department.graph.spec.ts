import { MemorySaver } from '@langchain/langgraph';
import { createLegalDepartmentGraph } from './legal-department.graph';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  LegalDocumentMetadata,
  LegalDepartmentState,
} from './legal-department.state';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-graph-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

const validContractJson = JSON.stringify({
  clauses: { governingLaw: { jurisdiction: 'Delaware' } },
  contractType: { type: 'nda', isMutual: true },
  riskFlags: [],
  confidence: 0.9,
  summary: 'NDA analyzed by contract agent',
});

const validReportText =
  '# Legal Analysis Report\n\n## Executive Summary\n\nAnalysis complete.';

function createMockLLMClient(): jest.Mocked<LLMHttpClientService> {
  return {
    callLLM: jest.fn().mockResolvedValue({ text: validContractJson }),
  } as unknown as jest.Mocked<LLMHttpClientService>;
}

function createMockObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

function createMinimalMetadata(): LegalDocumentMetadata {
  return {
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
  };
}

describe('createLegalDepartmentGraph', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  const memorySaver = new MemorySaver();

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as unknown as jest.Mocked<PostgresCheckpointerService>;
  });

  describe('graph creation', () => {
    it('should create a graph successfully', async () => {
      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should use checkpointer.getSaver', async () => {
      await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );
      expect(mockCheckpointer.getSaver).toHaveBeenCalled();
    });
  });

  describe('simple chat flow (no documents)', () => {
    it('should complete with echo response when no documents provided', async () => {
      // For echo path (no docs), LLM returns conversational response
      mockLLMClient.callLLM.mockResolvedValue({
        text: 'Legal information: This is general advice.',
      });

      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const threadId = `test-simple-${Date.now()}`;
      const finalState = (await graph.invoke(
        {
          executionContext: mockCtx,
          userMessage: 'What is an NDA?',
          documents: [],
          documentsMetadata: [],
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: threadId } },
      )) as unknown as LegalDepartmentState;

      expect(finalState.status).toBe('completed');
      expect(finalState.response).toContain('Legal information:');
    });

    it('should emit started and completed events for simple chat', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: 'General legal guidance response.',
      });

      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const threadId = `test-events-${Date.now()}`;
      await graph.invoke(
        {
          executionContext: mockCtx,
          userMessage: 'Tell me about contract law',
          documents: [],
          documentsMetadata: [],
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: threadId } },
      );

      expect(mockObservability.emitStarted).toHaveBeenCalled();
      expect(mockObservability.emitCompleted).toHaveBeenCalled();
    });
  });

  describe('document analysis flow (with CLO routing)', () => {
    it('should route through CLO routing when documents and metadata provided', async () => {
      // Echo skips LLM when docs+metadata present
      // LLM calls: specialist(s) via orchestrator, synthesis, report
      const synthesisJson = JSON.stringify({
        executiveSummary: 'Analysis complete',
        keyFindings: [
          { specialist: 'contract', finding: 'NDA analyzed', severity: 'low' },
        ],
        overallRisk: { level: 'low', description: 'Low risk', factors: [] },
        recommendations: ['Proceed'],
        confidence: 0.85,
      });
      mockLLMClient.callLLM
        .mockResolvedValueOnce({ text: validContractJson }) // contract agent (via orchestrator)
        .mockResolvedValueOnce({ text: synthesisJson }) // synthesis
        .mockResolvedValue({ text: validReportText }); // report generation

      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const threadId = `test-routing-${Date.now()}`;
      const finalState = (await graph.invoke(
        {
          executionContext: { ...mockCtx, conversationId: threadId },
          userMessage: 'Analyze this NDA',
          documents: [
            {
              name: 'nda.pdf',
              content:
                'This is a non-disclosure agreement between Company A and Company B.',
            },
          ],
          documentsMetadata: [createMinimalMetadata()],
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: threadId } },
      )) as unknown as LegalDepartmentState;

      expect(finalState.status).toBe('completed');
      expect(finalState.routingDecision).toBeDefined();
    });
  });

  describe('error handling in graph flow', () => {
    it('should handle echo node failure and route to handle_error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));

      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const threadId = `test-error-${Date.now()}`;
      const finalState = (await graph.invoke(
        {
          executionContext: { ...mockCtx, conversationId: threadId },
          userMessage: 'test',
          documents: [],
          documentsMetadata: [],
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: threadId } },
      )) as unknown as LegalDepartmentState;

      // After echo failure, should route to handle_error and end as failed
      expect(finalState.status).toBe('failed');
    });

    it('should emit failure event when echo node fails', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const threadId = `test-emit-fail-${Date.now()}`;
      await graph.invoke(
        {
          executionContext: { ...mockCtx, conversationId: threadId },
          userMessage: 'test',
          documents: [],
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: threadId } },
      );

      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });
  });

  describe('conditional routing logic', () => {
    it('should route to contract agent for contract document type', async () => {
      // Echo skips LLM when docs+metadata present
      const synthesisJson = JSON.stringify({
        executiveSummary: 'Contract analyzed',
        keyFindings: [
          { specialist: 'contract', finding: 'NDA analyzed', severity: 'low' },
        ],
        overallRisk: { level: 'low', description: 'Low risk', factors: [] },
        recommendations: ['Proceed'],
        confidence: 0.85,
      });
      mockLLMClient.callLLM
        .mockResolvedValueOnce({ text: validContractJson }) // contract agent (via orchestrator)
        .mockResolvedValueOnce({ text: synthesisJson }) // synthesis
        .mockResolvedValue({ text: validReportText }); // report

      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const threadId = `test-contract-route-${Date.now()}`;
      const finalState = (await graph.invoke(
        {
          executionContext: { ...mockCtx, conversationId: threadId },
          userMessage: 'Review this contract',
          documents: [
            { name: 'contract.pdf', content: 'service agreement contract' },
          ],
          documentsMetadata: [
            {
              ...createMinimalMetadata(),
              documentType: { type: 'contract', confidence: 0.9 },
            },
          ],
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: threadId } },
      )) as unknown as LegalDepartmentState;

      expect(finalState.status).toBe('completed');
      expect(finalState.specialistOutputs?.contract).toBeDefined();
    });
  });

  describe('graph with multi-agent flow', () => {
    it('should handle documents with content triggering multiple specialists', async () => {
      const synthesisJson = JSON.stringify({
        executiveSummary: 'Multi-domain analysis complete',
        keyFindings: [
          { specialist: 'contract', finding: 'NDA analyzed', severity: 'low' },
        ],
        overallRisk: { level: 'low', description: 'Low risk', factors: [] },
        recommendations: ['Proceed with caution'],
        confidence: 0.85,
      });

      // Multi-agent: echo, then specialists run via orchestrator (contract + ip), synthesis, HITL, report
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Echo: Multi-domain document analyzed.',
        }) // echo
        .mockResolvedValueOnce({ text: validContractJson }) // contract agent (in orchestrator)
        .mockResolvedValueOnce({
          text: JSON.stringify({
            // ip agent (in orchestrator)
            ownership: {
              owner: 'Company A',
              ownershipType: 'exclusive',
              clear: true,
              details: 'clear',
            },
            ipTypes: [],
            riskFlags: [],
            confidence: 0.85,
            summary: 'IP analyzed',
          }),
        })
        .mockResolvedValueOnce({ text: synthesisJson }) // synthesis
        .mockResolvedValue({ text: validReportText }); // report

      const graph = await createLegalDepartmentGraph(
        mockLLMClient,
        mockObservability,
        mockCheckpointer,
      );

      const threadId = `test-multi-agent-${Date.now()}`;
      const finalState = (await graph.invoke(
        {
          executionContext: { ...mockCtx, conversationId: threadId },
          userMessage: 'Analyze this complex document',
          documents: [
            {
              name: 'complex.pdf',
              content:
                'contract agreement with intellectual property license provisions',
            },
          ],
          documentsMetadata: [createMinimalMetadata()],
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: threadId } },
      )) as unknown as LegalDepartmentState;

      // Graph should complete - either through multi-agent or single-agent path
      expect(finalState.status).toBe('completed');
    });
  });
});
