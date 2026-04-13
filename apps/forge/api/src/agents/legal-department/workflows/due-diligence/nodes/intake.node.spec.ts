import { createIntakeNode } from './intake.node';
import type { DueDiligenceState } from '../due-diligence.state';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseState: DueDiligenceState = {
  executionContext: {
    orgSlug: 'legal',
    userId: 'u1',
    conversationId: 'conv-1',
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma4:e4b',
  },
  dealContext: {
    transactionType: 'acquisition',
    targetCompany: 'TargetCo',
    buyerCompany: 'BuyerCo',
    jurisdictions: ['US'],
    focusAreas: [],
    knownIssues: [],
  },
  documents: [
    {
      documentId: 'doc-001',
      name: 'test.pdf',
      content: 'test content',
      sizeBytes: 100,
    },
    {
      documentId: 'doc-002',
      name: 'test2.pdf',
      content: 'test content 2',
      sizeBytes: 200,
    },
  ],
  documentIndex: [],
  documentQueue: [],
  documentsAnalyzed: [],
  documentsFailed: {},
  perDocumentOutputs: {},
  runningFindings: {},
  status: 'intake',
  startedAt: Date.now(),
  messages: [],
} as unknown as DueDiligenceState;

describe('IntakeNode', () => {
  const intakeNode = createIntakeNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes document index from uploaded documents', async () => {
    const result = await intakeNode(baseState);
    expect(result.documentIndex).toHaveLength(2);
    expect(result.documentIndex![0]!.documentId).toBe('doc-001');
    expect(result.documentIndex![0]!.status).toBe('pending');
    expect(result.documentIndex![1]!.documentId).toBe('doc-002');
  });

  it('queues all documents for classification', async () => {
    const result = await intakeNode(baseState);
    expect(result.documentQueue).toEqual(['doc-001', 'doc-002']);
  });

  it('sets status to classifying', async () => {
    const result = await intakeNode(baseState);
    expect(result.status).toBe('classifying');
  });

  it('fails when deal context is incomplete', async () => {
    const badState = {
      ...baseState,
      dealContext: {
        ...baseState.dealContext,
        targetCompany: '',
      },
    } as unknown as DueDiligenceState;
    const result = await intakeNode(badState);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('targetCompany');
  });

  it('handles empty documents array', async () => {
    const emptyState = {
      ...baseState,
      documents: [],
    } as unknown as DueDiligenceState;
    const result = await intakeNode(emptyState);
    expect(result.documentIndex).toHaveLength(0);
    expect(result.documentQueue).toEqual([]);
  });

  it('emits progress event', async () => {
    await intakeNode(baseState);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseState.executionContext,
      'conv-1',
      expect.stringContaining('2 documents'),
      expect.any(Object),
    );
  });
});
