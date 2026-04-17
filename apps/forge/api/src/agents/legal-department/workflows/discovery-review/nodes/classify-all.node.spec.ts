import { createClassifyAllNode } from './classify-all.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import { fixtureProtocol } from '../__fixtures__/protocol';
import { fixtureDocuments } from '../__fixtures__/documents';

const mockLLMClient = {
  callLLM: jest.fn(),
} as any;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-dr-001',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

function makeState(
  overrides: Partial<DiscoveryReviewState> = {},
): DiscoveryReviewState {
  const docs = fixtureDocuments as DiscoveryReviewState['documents'];
  const index = docs.map((d) => ({
    documentId: d.documentId,
    name: d.name,
    documentType: 'unknown',
    date: null,
    summary: '',
    status: 'ingested' as const,
  }));

  return {
    executionContext: baseCtx,
    reviewProtocol: fixtureProtocol,
    documents: docs,
    documentIndex: index,
    documentQueue: docs.map((d) => d.documentId),
    documentsCoded: [],
    documentsFailed: {},
    documentCodings: {},
    reviewBatches: [],
    batchDecisions: {},
    calibrationAdjustments: [],
    productionSet: [],
    privilegeLog: [],
    reviewStatistics: {
      totalDocuments: docs.length,
      totalCoded: 0,
      totalFailed: 0,
      relevanceBreakdown: {
        relevant: 0,
        not_relevant: 0,
        potentially_relevant: 0,
      },
      privilegeCount: 0,
      hotDocumentCount: 0,
      issueDistribution: {},
      humanCorrectionCount: 0,
      productionSetSize: 0,
    },
    status: 'classifying',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  } as unknown as DiscoveryReviewState;
}

describe('ClassifyAllNode', () => {
  const classifyAllNode = createClassifyAllNode(
    mockLLMClient,
    mockObservability,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('classifies documents using LLM', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        documentType: 'email',
        threadSubject: 'Q2 Product Roadmap',
        date: '2023-03-15',
        summary: 'An email thread discussing product roadmap.',
      }),
    });

    const result = await classifyAllNode(makeState());
    expect(result.documentIndex![0]!.documentType).toBe('email');
    expect(result.documentIndex![0]!.date).toBe('2023-03-15');
    expect(result.documentIndex![0]!.status).toBe('classified');
  });

  it('handles markdown-wrapped JSON from LLM', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n{"documentType":"contract","threadSubject":null,"date":null,"summary":"A supply agreement."}\n```',
    });

    const result = await classifyAllNode(makeState());
    expect(result.documentIndex![0]!.documentType).toBe('contract');
  });

  it('falls back to type other when LLM response is unparseable', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid JSON' });

    const result = await classifyAllNode(makeState());
    expect(result.documentIndex![0]!.documentType).toBe('other');
    expect(result.documentIndex![0]!.status).toBe('classified');
  });

  it('handles LLM errors gracefully — marks as other with error summary', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

    const result = await classifyAllNode(makeState());
    expect(result.documentIndex![0]!.documentType).toBe('other');
    expect(result.documentIndex![0]!.summary).toContain(
      'Classification failed',
    );
    expect(result.documentIndex![0]!.status).toBe('classified');
  });

  it('sets status to coding after classification', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"memo","threadSubject":null,"date":null,"summary":"A memo."}',
    });
    const result = await classifyAllNode(makeState());
    expect(result.status).toBe('coding');
  });

  it('emits dr:classification_complete event', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"memo","threadSubject":null,"date":null,"summary":"A memo."}',
    });

    await classifyAllNode(makeState());

    const calls = mockObservability.emitProgress.mock.calls;
    const completeCall = calls.find(
      (c: any[]) => c[3]?.step === 'dr:classification_complete',
    );
    expect(completeCall).toBeDefined();
    expect(completeCall![3].totalDocuments).toBe(fixtureDocuments.length);
    expect(completeCall![3].typeBreakdown).toBeDefined();
  });

  it('groups email threads by normalized subject', async () => {
    // Three emails: two share a subject, one different
    const emailDoc1 = {
      documentId: 'email-001',
      name: 'email1.eml',
      content: 'From: a@a.com\nSubject: Product Roadmap\nBody...',
      mimeType: 'message/rfc822',
      sizeBytes: 100,
    };
    const emailDoc2 = {
      documentId: 'email-002',
      name: 'email2.eml',
      content: 'From: b@b.com\nSubject: RE: Product Roadmap\nReply...',
      mimeType: 'message/rfc822',
      sizeBytes: 100,
    };
    const emailDoc3 = {
      documentId: 'email-003',
      name: 'email3.eml',
      content: 'From: c@c.com\nSubject: Budget Review\nDifferent...',
      mimeType: 'message/rfc822',
      sizeBytes: 100,
    };

    mockLLMClient.callLLM
      .mockResolvedValueOnce({
        text: '{"documentType":"email","threadSubject":"Product Roadmap","date":null,"summary":"An email."}',
      })
      .mockResolvedValueOnce({
        text: '{"documentType":"email","threadSubject":"Product Roadmap","date":null,"summary":"A reply."}',
      })
      .mockResolvedValueOnce({
        text: '{"documentType":"email","threadSubject":"Budget Review","date":null,"summary":"Budget email."}',
      });

    const docs = [
      emailDoc1,
      emailDoc2,
      emailDoc3,
    ] as DiscoveryReviewState['documents'];
    const state = makeState({
      documents: docs,
      documentIndex: docs.map((d) => ({
        documentId: d.documentId,
        name: d.name,
        documentType: 'unknown',
        date: null,
        summary: '',
        status: 'ingested' as const,
      })),
    });

    const result = await classifyAllNode(state);

    // email-001 and email-002 should share a threadId
    const idx0 = result.documentIndex![0]!;
    const idx1 = result.documentIndex![1]!;
    const idx2 = result.documentIndex![2]!;

    expect(idx0.threadId).toBeDefined();
    expect(idx1.threadId).toBeDefined();
    expect(idx0.threadId).toBe(idx1.threadId);
    expect(idx2.threadId).not.toBe(idx0.threadId);
  });

  it('skips already-classified documents', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"memo","threadSubject":null,"date":null,"summary":"A memo."}',
    });

    const docs = fixtureDocuments as DiscoveryReviewState['documents'];
    const state = makeState({
      documents: docs,
      documentIndex: docs.map((d, i) => ({
        documentId: d.documentId,
        name: d.name,
        documentType: i === 0 ? 'email' : 'unknown',
        date: null,
        summary: i === 0 ? 'Already classified.' : '',
        status: (i === 0
          ? 'classified'
          : 'ingested') as DocumentIndexEntry['status'],
      })),
    });

    await classifyAllNode(state);

    // LLM should be called only for the two non-classified docs
    expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
  });

  it('does not expose _threadSubject in final documentIndex', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"email","threadSubject":"Some Thread","date":null,"summary":"An email."}',
    });

    const result = await classifyAllNode(makeState());
    for (const entry of result.documentIndex!) {
      expect(entry).not.toHaveProperty('_threadSubject');
    }
  });
});

// Type import used only in the spec
import type { DocumentIndexEntry } from '../discovery-review.types';
