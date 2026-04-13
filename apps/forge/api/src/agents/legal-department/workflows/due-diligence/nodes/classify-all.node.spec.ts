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
});
