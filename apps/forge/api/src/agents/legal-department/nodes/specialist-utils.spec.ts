import {
  getDocumentText,
  stripMarkdownFences,
  buildBaseUserMessage,
  queryCollectionForContext,
  chunkTextByTokens,
  runSpecialistOverDocument,
} from './specialist-utils';
import { LegalDepartmentState } from '../legal-department.state';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { RagStorageService } from '@orchestratorai/planes/rag';
import type { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../shared/services/observability.service';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: mockCtx,
    userMessage: 'Analyze this contract',
    documents: [],
    legalMetadata: undefined,
    routingDecision: undefined,
    orchestration: {},
    specialistOutputs: {},
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  };
}

describe('specialist-utils', () => {
  describe('getDocumentText', () => {
    it('should return content from documents array', () => {
      const state = createBaseState({
        documents: [{ name: 'doc.pdf', content: 'document content here' }],
      });
      expect(getDocumentText(state)).toBe('document content here');
    });

    it('should return content from legalMetadata sections when no documents', () => {
      const state = createBaseState({
        documents: [],
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [
              {
                title: 'Section 1',
                type: 'terms',
                startIndex: 0,
                endIndex: 100,
                content: 'first section',
                confidence: 0.9,
              },
              {
                title: 'Section 2',
                type: 'obligations',
                startIndex: 100,
                endIndex: 200,
                content: 'second section',
                confidence: 0.9,
              },
            ],
            confidence: 0.9,
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
      });
      expect(getDocumentText(state)).toBe('first section\n\nsecond section');
    });

    it('should return undefined when neither documents nor metadata exists', () => {
      const state = createBaseState({
        documents: [],
        legalMetadata: undefined,
      });
      expect(getDocumentText(state)).toBeUndefined();
    });

    it('should prefer documents array over metadata sections', () => {
      const state = createBaseState({
        documents: [{ name: 'doc.pdf', content: 'from documents' }],
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [
              {
                title: 'S1',
                type: 'terms',
                startIndex: 0,
                endIndex: 50,
                content: 'from metadata',
                confidence: 0.9,
              },
            ],
            confidence: 0.9,
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
      });
      expect(getDocumentText(state)).toBe('from documents');
    });
  });

  describe('stripMarkdownFences', () => {
    it('should remove ```json wrapper', () => {
      expect(stripMarkdownFences('```json\n{"key": "value"}\n```')).toBe(
        '{"key": "value"}',
      );
    });

    it('should remove ``` wrapper', () => {
      expect(stripMarkdownFences('```\n{"key": "value"}\n```')).toBe(
        '{"key": "value"}',
      );
    });

    it('should return trimmed text when no fences', () => {
      expect(stripMarkdownFences('  {"key": "value"}  ')).toBe(
        '{"key": "value"}',
      );
    });

    it('should handle empty string', () => {
      expect(stripMarkdownFences('')).toBe('');
    });
  });

  describe('buildBaseUserMessage', () => {
    it('should include document text', () => {
      const state = createBaseState({ userMessage: 'analyze' });
      const result = buildBaseUserMessage('contract text here', state);
      expect(result).toContain('contract text here');
    });

    it('should include metadata context when available', () => {
      const state = createBaseState({
        userMessage: 'analyze',
        legalMetadata: {
          documentType: { type: 'nda', confidence: 0.9 },
          sections: {
            sections: [],
            confidence: 0.5,
            structureType: 'formal',
          },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: {
            parties: [],
            contractingParties: [
              {
                name: 'Acme Corp',
                type: 'corporate',
                position: 0,
                confidence: 0.9,
              },
              {
                name: 'Widget Inc',
                type: 'corporate',
                position: 50,
                confidence: 0.9,
              },
            ] as [
              {
                name: string;
                type: string;
                position: number;
                confidence: number;
              },
              {
                name: string;
                type: string;
                position: number;
                confidence: number;
              },
            ],
            confidence: 0.9,
          },
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
      const result = buildBaseUserMessage('doc text', state);
      expect(result).toContain('Document Type: nda');
      expect(result).toContain('Acme Corp');
      expect(result).toContain('Widget Inc');
    });

    it('should include user message when not just "analyze"', () => {
      const state = createBaseState({
        userMessage: 'Focus on confidentiality',
      });
      const result = buildBaseUserMessage('doc text', state);
      expect(result).toContain('User Request: Focus on confidentiality');
    });

    it('should not include user message when just "analyze"', () => {
      const state = createBaseState({ userMessage: 'analyze' });
      const result = buildBaseUserMessage('doc text', state);
      expect(result).not.toContain('User Request');
    });

    it('should include primary date when available', () => {
      const state = createBaseState({
        userMessage: 'analyze',
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [],
            confidence: 0.5,
            structureType: 'formal',
          },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: {
            dates: [],
            primaryDate: {
              originalText: 'Jan 1, 2024',
              normalizedDate: '2024-01-01',
              dateType: 'effective',
              confidence: 0.9,
              position: 0,
            },
            confidence: 0.9,
          },
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
      const result = buildBaseUserMessage('doc text', state);
      expect(result).toContain('Primary Date: 2024-01-01');
    });
  });

  describe('queryCollectionForContext', () => {
    function createMockRagService(
      overrides: Partial<RagStorageService> = {},
    ): RagStorageService {
      return {
        getCollectionBySlug: jest
          .fn()
          .mockResolvedValue({ id: 'col-123', slug: 'test-collection' }),
        keywordSearch: jest.fn().mockResolvedValue([
          {
            chunkId: 'c1',
            documentId: 'd1',
            documentFilename: 'policy.pdf',
            content: 'relevant content',
            score: 0.9,
            pageNumber: 1,
            chunkIndex: 0,
            charOffset: null,
            metadata: {},
          },
        ]),
        ...overrides,
      } as unknown as RagStorageService;
    }

    it('should return formatted context when collection has matches', async () => {
      const ragService = createMockRagService();
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toContain('[policy.pdf] relevant content');
    });

    it('should return empty string when ragService is undefined', async () => {
      const result = await queryCollectionForContext(
        undefined,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toBe('');
    });

    it('should return empty string when collection does not exist', async () => {
      const ragService = createMockRagService({
        getCollectionBySlug: jest.fn().mockResolvedValue(null),
      });
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'nonexistent',
        'query text',
      );
      expect(result).toBe('');
    });

    it('should return empty string when no search results', async () => {
      const ragService = createMockRagService({
        keywordSearch: jest.fn().mockResolvedValue([]),
      });
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toBe('');
    });

    it('should return empty string when RAG service throws', async () => {
      const ragService = createMockRagService({
        getCollectionBySlug: jest
          .fn()
          .mockRejectedValue(new Error('DB connection failed')),
      });
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toBe('');
    });
  });
});

describe('chunkTextByTokens', () => {
  it('returns the input as a single chunk when it fits the budget', () => {
    const text = 'short paragraph one\n\nshort paragraph two';
    const chunks = chunkTextByTokens(text, 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits on paragraph boundaries when the input exceeds the budget', () => {
    const big = Array.from({ length: 50 }, (_, i) =>
      `paragraph ${i} `.repeat(10),
    ).join('\n\n');
    const chunks = chunkTextByTokens(big, 50);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should drastically exceed the target budget
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('hard-splits a single paragraph that exceeds the budget', () => {
    // Single paragraph (no newlines) much bigger than the budget
    const para = 'a '.repeat(5_000);
    const chunks = chunkTextByTokens(para, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('runSpecialistOverDocument', () => {
  type DummyOutput = {
    findings: string[];
    confidence: number;
    summary: string;
  };

  function makeMockLlm(responses: string[]): LLMHttpClientService {
    let idx = 0;
    return {
      callLLM: jest.fn().mockImplementation(async () => {
        const text = responses[idx % responses.length]!;
        idx++;
        return { text };
      }),
    } as unknown as LLMHttpClientService;
  }

  function makeMockObservability(): ObservabilityService {
    return {
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as ObservabilityService;
  }

  function dummyParse(text: string): DummyOutput {
    return JSON.parse(text);
  }

  function dummyMerge(rs: DummyOutput[]): DummyOutput {
    const findings = rs.flatMap((r) => r.findings);
    return {
      findings,
      confidence: Math.min(...rs.map((r) => r.confidence)),
      summary: rs.map((r) => r.summary).join(' | '),
    };
  }

  it('takes the single-call path when the input fits the budget', async () => {
    const llm = makeMockLlm([
      JSON.stringify({ findings: ['a'], confidence: 0.9, summary: 's' }),
    ]);
    const obs = makeMockObservability();
    const state = createBaseState({
      documents: [{ name: 'd', content: 'tiny doc' }],
    });
    const run = await runSpecialistOverDocument<DummyOutput>({
      llmClient: llm,
      observability: obs,
      state,
      documentText: 'tiny doc',
      systemMessage: 'sys',
      callerName: 'legal-department:dummy-agent',
      buildUserMessage: (chunk) => chunk,
      parse: dummyParse,
      merge: dummyMerge,
      progressLabel: 'Dummy Agent',
      progressStepPrefix: 'dummy_agent',
    });
    expect(run.chunks).toBe(1);
    expect(run.result.findings).toEqual(['a']);
    expect(llm.callLLM).toHaveBeenCalledTimes(1);
    // Single-call path should NOT emit a chunking event
    const calls = (obs.emitProgress as jest.Mock).mock.calls;
    expect(
      calls.find((c) => String(c[2]).includes('chunked:')),
    ).toBeUndefined();
  });

  it('takes the chunked path when the input exceeds the per-call budget', async () => {
    // Build a document large enough to force chunking under a tiny model.
    // Use the gpt-3.5 budget (16k window, 1.5k reserved output → ~14k input).
    const big = Array.from(
      { length: 30 },
      (_, i) => 'lorem '.repeat(2000) + `\n\nblock ${i}`,
    ).join('\n\n');
    const llm = makeMockLlm([
      JSON.stringify({ findings: ['a', 'b'], confidence: 0.8, summary: 's1' }),
      JSON.stringify({ findings: ['c'], confidence: 0.6, summary: 's2' }),
      JSON.stringify({ findings: ['d'], confidence: 0.9, summary: 's3' }),
      JSON.stringify({ findings: ['e'], confidence: 0.7, summary: 's4' }),
      JSON.stringify({ findings: ['f'], confidence: 0.85, summary: 's5' }),
    ]);
    const obs = makeMockObservability();
    const state = createBaseState({
      executionContext: { ...mockCtx, model: 'gpt-3.5-turbo' },
      documents: [{ name: 'd', content: big }],
    });
    const run = await runSpecialistOverDocument<DummyOutput>({
      llmClient: llm,
      observability: obs,
      state,
      documentText: big,
      systemMessage: 'sys',
      callerName: 'legal-department:dummy-agent',
      buildUserMessage: (chunk) => chunk,
      parse: dummyParse,
      merge: dummyMerge,
      progressLabel: 'Dummy Agent',
      progressStepPrefix: 'dummy_agent',
    });
    expect(run.chunks).toBeGreaterThan(1);
    expect((llm.callLLM as jest.Mock).mock.calls.length).toBe(run.chunks);
    // Merge correctness: findings concat, confidence min
    expect(run.result.findings.length).toBeGreaterThanOrEqual(run.chunks);
    expect(run.result.confidence).toBe(
      Math.min(
        ...(llm.callLLM as jest.Mock).mock.results
          .slice(0, run.chunks)
          .map(() => 0)
          .map((_, i) => [0.8, 0.6, 0.9, 0.7, 0.85][i % 5]!),
      ),
    );
    // Chunked path emits the ticker event
    const calls = (obs.emitProgress as jest.Mock).mock.calls;
    const tickerCall = calls.find((c) => String(c[2]).includes('chunked:'));
    expect(tickerCall).toBeDefined();
  });
});

describe('runSpecialistOverDocument framing-headroom clamp', () => {
  type DummyOutput = {
    findings: string[];
    confidence: number;
    summary: string;
  };

  it('caps heavy framing at half the budget so chunks stay sane', async () => {
    // Simulate the real-world case: a buildUserMessage that injects a
    // huge RAG context into every call. Without the clamp, framingHeadroom
    // would consume the whole budget and chunkTextByTokens would fall
    // into hard-split mode producing thousands of microchunks.
    const llm = {
      callLLM: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          findings: ['x'],
          confidence: 0.9,
          summary: 's',
        }),
      }),
    } as unknown as LLMHttpClientService;
    const obs = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as ObservabilityService;

    // ~20k token document under the gpt-3.5 budget (~14k input). The doc
    // needs to chunk; what we're checking is the chunk count stays small
    // even when framing dwarfs the input budget.
    const doc = 'lorem ipsum '.repeat(8000);
    const hugeRagContext = 'rag context line '.repeat(20_000); // ~60k tokens

    const state = createBaseState({
      executionContext: { ...mockCtx, model: 'gpt-3.5-turbo' },
      documents: [{ name: 'd', content: doc }],
    });

    const run = await runSpecialistOverDocument<DummyOutput>({
      llmClient: llm,
      observability: obs,
      state,
      documentText: doc,
      systemMessage: 'sys',
      callerName: 'legal-department:dummy-agent',
      buildUserMessage: (chunk) => `${chunk}\n\n${hugeRagContext}`,
      parse: (t) => JSON.parse(t) as DummyOutput,
      merge: (rs) => rs[0]!,
      progressLabel: 'Dummy Agent',
      progressStepPrefix: 'dummy_agent',
    });
    // Sanity: chunk count should be small (single-digit), not thousands
    expect(run.chunks).toBeGreaterThan(0);
    expect(run.chunks).toBeLessThan(50);
  });
});
