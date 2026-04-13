import { createIncrementalStartNode } from './incremental-start.node';
import type { DueDiligenceState } from '../due-diligence.state';

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

/** State representing a completed DD room with 2 analyzed docs */
const completedState: DueDiligenceState = {
  executionContext: baseCtx,
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
      name: 'NDA.pdf',
      content: 'NDA content',
      sizeBytes: 100,
    },
    {
      documentId: 'doc-002',
      name: 'Contract.pdf',
      content: 'Contract content',
      sizeBytes: 200,
    },
    // New documents added for incremental update
    {
      documentId: 'doc-003',
      name: 'Amendment.pdf',
      content: 'Amendment content',
      sizeBytes: 150,
    },
    {
      documentId: 'doc-004',
      name: 'Lease.pdf',
      content: 'Lease content',
      sizeBytes: 300,
    },
  ],
  documentIndex: [
    {
      documentId: 'doc-001',
      name: 'NDA.pdf',
      documentType: 'nda',
      parties: ['MegaCorp', 'Recipient'],
      date: '2024-01-15',
      summary: 'An NDA',
      riskScore: 25,
      status: 'complete',
      specialistsAssigned: ['contract', 'ip'],
      specialistsCompleted: ['contract', 'ip'],
    },
    {
      documentId: 'doc-002',
      name: 'Contract.pdf',
      documentType: 'contract',
      parties: ['PartyA', 'PartyB'],
      date: '2024-02-01',
      summary: 'A contract',
      riskScore: 50,
      status: 'complete',
      specialistsAssigned: ['contract', 'compliance'],
      specialistsCompleted: ['contract', 'compliance'],
    },
  ],
  documentQueue: [],
  documentsAnalyzed: ['doc-001', 'doc-002'],
  documentsFailed: {},
  perDocumentOutputs: {
    'doc-001': { specialistOutputs: {}, routingDecision: {} as any },
    'doc-002': { specialistOutputs: {}, routingDecision: {} as any },
  },
  runningFindings: {
    contract: {
      specialistKey: 'contract',
      documentCount: 2,
      keyFindings: [],
      crossReferences: [],
      cumulativeRisks: [],
    },
  },
  status: 'classifying',
  incrementalMode: true,
  newDocumentIds: ['doc-003', 'doc-004'],
  startedAt: Date.now(),
  messages: [],
} as unknown as DueDiligenceState;

describe('IncrementalStartNode', () => {
  const incrementalStartNode =
    createIncrementalStartNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets documentQueue to newDocumentIds only', async () => {
    const result = await incrementalStartNode(completedState);
    expect(result.documentQueue).toEqual(['doc-003', 'doc-004']);
  });

  it('appends new document index entries for new documents', async () => {
    const result = await incrementalStartNode(completedState);
    expect(result.documentIndex).toHaveLength(4);
    // Existing entries preserved
    expect(result.documentIndex![0]!.documentId).toBe('doc-001');
    expect(result.documentIndex![0]!.status).toBe('complete');
    expect(result.documentIndex![1]!.documentId).toBe('doc-002');
    expect(result.documentIndex![1]!.status).toBe('complete');
    // New entries appended
    expect(result.documentIndex![2]!.documentId).toBe('doc-003');
    expect(result.documentIndex![2]!.status).toBe('pending');
    expect(result.documentIndex![2]!.name).toBe('Amendment.pdf');
    expect(result.documentIndex![3]!.documentId).toBe('doc-004');
    expect(result.documentIndex![3]!.status).toBe('pending');
  });

  it('preserves existing document index entries unchanged', async () => {
    const result = await incrementalStartNode(completedState);
    const existing = result.documentIndex!.slice(0, 2);
    expect(existing[0]!.documentType).toBe('nda');
    expect(existing[0]!.riskScore).toBe(25);
    expect(existing[1]!.documentType).toBe('contract');
    expect(existing[1]!.riskScore).toBe(50);
  });

  it('does not duplicate entries if called with already-indexed docs', async () => {
    const stateWithDupes = {
      ...completedState,
      // doc-003 already in index (shouldn't happen but defensive)
      documentIndex: [
        ...completedState.documentIndex,
        {
          documentId: 'doc-003',
          name: 'Amendment.pdf',
          documentType: 'amendment',
          parties: [],
          date: null,
          summary: 'Already indexed',
          riskScore: null,
          status: 'complete' as const,
          specialistsAssigned: [],
          specialistsCompleted: [],
        },
      ],
    } as unknown as DueDiligenceState;

    const result = await incrementalStartNode(stateWithDupes);
    // doc-003 already exists, should not be duplicated; only doc-004 appended
    const doc003Entries = result.documentIndex!.filter(
      (e) => e.documentId === 'doc-003',
    );
    expect(doc003Entries).toHaveLength(1);
    expect(result.documentIndex).toHaveLength(4); // 2 existing + 1 already-indexed doc-003 + 1 new doc-004
  });

  it('sets status to classifying', async () => {
    const result = await incrementalStartNode(completedState);
    expect(result.status).toBe('classifying');
  });

  it('resets startedAt for the incremental run', async () => {
    const before = Date.now();
    const result = await incrementalStartNode(completedState);
    expect(result.startedAt).toBeGreaterThanOrEqual(before);
  });

  it('emits dd_incremental_start progress event', async () => {
    await incrementalStartNode(completedState);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseCtx,
      'conv-1',
      expect.stringContaining('2 new documents'),
      expect.objectContaining({ step: 'dd_incremental_start' }),
    );
  });

  it('does not touch perDocumentOutputs or runningFindings', async () => {
    const result = await incrementalStartNode(completedState);
    // These fields should not be in the returned partial state
    expect(result).not.toHaveProperty('perDocumentOutputs');
    expect(result).not.toHaveProperty('runningFindings');
    expect(result).not.toHaveProperty('dealContext');
  });
});
