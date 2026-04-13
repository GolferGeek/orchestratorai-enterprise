import { createClassifyAllNode } from './classify-all.node';
import type { DueDiligenceState } from '../due-diligence.state';

const mockLLMClient = {
  callLLM: jest.fn(),
} as any;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'u1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const baseState: DueDiligenceState = {
  executionContext: baseCtx,
  documents: [
    {
      documentId: 'doc-001',
      name: 'NDA.pdf',
      content: 'Non-Disclosure Agreement between MegaCorp and Recipient...',
      sizeBytes: 100,
    },
  ],
  documentIndex: [
    {
      documentId: 'doc-001',
      name: 'NDA.pdf',
      documentType: 'unknown',
      parties: [],
      date: null,
      summary: '',
      riskScore: null,
      status: 'pending',
      specialistsAssigned: [],
      specialistsCompleted: [],
    },
  ],
  dealContext: {
    transactionType: 'acquisition',
    targetCompany: 'TargetCo',
    buyerCompany: 'BuyerCo',
    jurisdictions: [],
    focusAreas: [],
    knownIssues: [],
  },
  documentQueue: ['doc-001'],
  documentsAnalyzed: [],
  documentsFailed: {},
  perDocumentOutputs: {},
  runningFindings: {},
  status: 'classifying',
  startedAt: Date.now(),
  messages: [],
} as unknown as DueDiligenceState;

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
        documentType: 'nda',
        parties: ['MegaCorp', 'Recipient'],
        date: '2024-01-15',
        summary: 'An NDA between MegaCorp and Recipient.',
      }),
    });

    const result = await classifyAllNode(baseState);
    expect(result.documentIndex![0]!.documentType).toBe('nda');
    expect(result.documentIndex![0]!.parties).toEqual([
      'MegaCorp',
      'Recipient',
    ]);
    expect(result.documentIndex![0]!.date).toBe('2024-01-15');
    expect(result.documentIndex![0]!.status).toBe('classified');
  });

  it('handles LLM returning markdown-wrapped JSON', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n{"documentType":"contract","parties":["A","B"],"date":null,"summary":"A contract."}\n```',
    });

    const result = await classifyAllNode(baseState);
    expect(result.documentIndex![0]!.documentType).toBe('contract');
  });

  it('handles LLM classification failure gracefully', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

    const result = await classifyAllNode(baseState);
    expect(result.documentIndex![0]!.documentType).toBe('unknown');
    expect(result.documentIndex![0]!.summary).toContain(
      'Classification failed',
    );
    expect(result.documentIndex![0]!.status).toBe('classified');
  });

  it('handles unparseable LLM response', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not json at all' });

    const result = await classifyAllNode(baseState);
    expect(result.documentIndex![0]!.documentType).toBe('other');
  });

  it('sets status to analyzing after classification', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"nda","parties":[],"date":null,"summary":"test"}',
    });

    const result = await classifyAllNode(baseState);
    expect(result.status).toBe('analyzing');
  });

  it('emits classification_complete event', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"nda","parties":[],"date":null,"summary":"test"}',
    });

    await classifyAllNode(baseState);

    const completeCalls = mockObservability.emitProgress.mock.calls.filter(
      (c: any[]) => c[3]?.step === 'dd:classification_complete',
    );
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0][3].totalDocuments).toBe(1);
  });

  it('skips already-classified documents in incremental mode', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"amendment","parties":[],"date":null,"summary":"An amendment"}',
    });

    const incrementalState = {
      ...baseState,
      documents: [
        baseState.documents[0], // existing doc
        {
          documentId: 'doc-new',
          name: 'Amendment.pdf',
          content: 'Amendment text...',
          sizeBytes: 150,
        },
      ],
      documentIndex: [
        {
          documentId: 'doc-001',
          name: 'NDA.pdf',
          documentType: 'nda',
          parties: ['MegaCorp'],
          date: '2024-01-15',
          summary: 'An NDA',
          riskScore: 25,
          status: 'complete', // already complete — should be skipped
          specialistsAssigned: ['contract'],
          specialistsCompleted: ['contract'],
        },
        {
          documentId: 'doc-new',
          name: 'Amendment.pdf',
          documentType: 'unknown',
          parties: [],
          date: null,
          summary: '',
          riskScore: null,
          status: 'pending', // pending — should be classified
          specialistsAssigned: [],
          specialistsCompleted: [],
        },
      ],
    } as unknown as DueDiligenceState;

    const result = await classifyAllNode(incrementalState);

    // LLM should only be called once (for the new doc, not the complete one)
    expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(1);

    // Existing doc preserved unchanged
    expect(result.documentIndex![0]!.documentType).toBe('nda');
    expect(result.documentIndex![0]!.status).toBe('complete');
    expect(result.documentIndex![0]!.riskScore).toBe(25);

    // New doc classified
    expect(result.documentIndex![1]!.documentType).toBe('amendment');
    expect(result.documentIndex![1]!.status).toBe('classified');
  });

  it('skips documents with failed status in incremental mode', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"documentType":"contract","parties":[],"date":null,"summary":"test"}',
    });

    const stateWithFailed = {
      ...baseState,
      documents: [
        {
          documentId: 'doc-failed',
          name: 'Failed.pdf',
          content: 'content',
          sizeBytes: 100,
        },
      ],
      documentIndex: [
        {
          documentId: 'doc-failed',
          name: 'Failed.pdf',
          documentType: 'unknown',
          parties: [],
          date: null,
          summary: 'Analysis failed',
          riskScore: null,
          status: 'failed',
          specialistsAssigned: [],
          specialistsCompleted: [],
        },
      ],
    } as unknown as DueDiligenceState;

    await classifyAllNode(stateWithFailed);

    // LLM should not be called for failed documents
    expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
  });
});
