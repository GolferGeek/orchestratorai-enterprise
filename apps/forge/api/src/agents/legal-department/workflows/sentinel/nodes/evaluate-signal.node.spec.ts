import { createEvaluateSignalNode } from './evaluate-signal.node';
import type { SentinelEvaluateState } from '../sentinel-evaluate.state';
import type { SentinelSignal } from '../../../sentinel/sentinel.types';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseContext = {
  orgSlug: 'test-org',
  userId: 'u1',
  conversationId: 'conv-eval-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma3:4b',
};

const makeSignal = (idx: number): SentinelSignal => ({
  id: `signal-${idx}`,
  org_slug: 'test-org',
  source_id: 'src-1',
  title: `Signal ${idx}`,
  summary: 'SEC enforcement action against financial firms',
  full_text: 'The SEC announced enforcement action...',
  url: `https://example.com/${idx}`,
  published_at: '2026-01-01T00:00:00Z',
  signal_type: 'enforcement',
  jurisdictions: ['us-federal'],
  practice_areas: ['securities'],
  content_hash: `hash-${idx}`,
  processed: false,
  ingested_at: '2026-01-01T00:00:00Z',
});

describe('EvaluateSignalNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty queue when no signals', async () => {
    const mockRepository = {
      markSignalsProcessed: jest.fn().mockResolvedValue(undefined),
      createAlertsBatch: jest.fn().mockResolvedValue([]),
    } as any;

    const evalNode = createEvaluateSignalNode(
      {} as any,
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await evalNode(state);
    expect(result.unprocessedSignals).toEqual([]);
  });

  it('skips signal when no RAG context available', async () => {
    const mockRepository = {
      markSignalsProcessed: jest.fn().mockResolvedValue(undefined),
      createAlertsBatch: jest.fn().mockResolvedValue([]),
    } as any;

    const mockRag = {
      getContext: jest.fn().mockResolvedValue(''),
    } as any;

    const evalNode = createEvaluateSignalNode(
      {} as any,
      mockObservability,
      mockRepository,
      mockRag,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [makeSignal(1)],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await evalNode(state);
    expect(result.unprocessedSignals).toEqual([]);
    expect(mockRepository.markSignalsProcessed).toHaveBeenCalledWith([
      'signal-1',
    ]);
  });

  it('generates alerts when LLM returns relevant matches', async () => {
    const mockRepository = {
      markSignalsProcessed: jest.fn().mockResolvedValue(undefined),
      createAlertsBatch: jest.fn().mockResolvedValue([]),
    } as any;

    const mockRag = {
      getContext: jest
        .fn()
        .mockResolvedValue('Portfolio: Acme Corp (holding-1), securities'),
    } as any;

    const llmResponse = JSON.stringify([
      {
        holdingId: 'holding-1',
        relevanceScore: 85,
        severity: 'high',
        urgency: 'this_week',
        summary: 'SEC enforcement affects Acme',
        reasoning: 'Direct impact',
        recommendedAction: 'Review compliance',
      },
    ]);

    const mockLlm = {
      callLLM: jest.fn().mockResolvedValue({ text: llmResponse }),
    } as any;

    const evalNode = createEvaluateSignalNode(
      mockLlm,
      mockObservability,
      mockRepository,
      mockRag,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [makeSignal(1)],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await evalNode(state);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts?.[0]?.portfolioId).toBe('holding-1');
    expect(result.alerts?.[0]?.relevanceScore).toBe(85);
    expect(mockRepository.createAlertsBatch).toHaveBeenCalledWith(
      'test-org',
      expect.arrayContaining([
        expect.objectContaining({
          signalId: 'signal-1',
          portfolioId: 'holding-1',
        }),
      ]),
    );
    expect(mockRepository.markSignalsProcessed).toHaveBeenCalledWith([
      'signal-1',
    ]);
  });

  it('filters out low-relevance matches below threshold', async () => {
    const mockRepository = {
      markSignalsProcessed: jest.fn().mockResolvedValue(undefined),
      createAlertsBatch: jest.fn().mockResolvedValue([]),
    } as any;

    const mockRag = {
      getContext: jest.fn().mockResolvedValue('Portfolio context'),
    } as any;

    const llmResponse = JSON.stringify([
      {
        holdingId: 'holding-1',
        relevanceScore: 20, // below threshold of 30
        severity: 'low',
        urgency: 'informational',
        summary: 'Tangential connection',
        reasoning: 'Loosely related',
        recommendedAction: 'No action needed',
      },
    ]);

    const mockLlm = {
      callLLM: jest.fn().mockResolvedValue({ text: llmResponse }),
    } as any;

    const evalNode = createEvaluateSignalNode(
      mockLlm,
      mockObservability,
      mockRepository,
      mockRag,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [makeSignal(1)],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await evalNode(state);
    expect(result.alerts).toHaveLength(0);
    expect(mockRepository.createAlertsBatch).not.toHaveBeenCalled();
  });

  it('marks signal processed even on LLM error', async () => {
    const mockRepository = {
      markSignalsProcessed: jest.fn().mockResolvedValue(undefined),
      createAlertsBatch: jest.fn().mockResolvedValue([]),
    } as any;

    const mockRag = {
      getContext: jest.fn().mockResolvedValue('Portfolio context'),
    } as any;

    const mockLlm = {
      callLLM: jest.fn().mockRejectedValue(new Error('LLM timeout')),
    } as any;

    const evalNode = createEvaluateSignalNode(
      mockLlm,
      mockObservability,
      mockRepository,
      mockRag,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [makeSignal(1)],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await evalNode(state);
    expect(result.unprocessedSignals).toEqual([]);
    expect(mockRepository.markSignalsProcessed).toHaveBeenCalledWith([
      'signal-1',
    ]);
  });

  it('pops the first signal from the queue', async () => {
    const mockRepository = {
      markSignalsProcessed: jest.fn().mockResolvedValue(undefined),
      createAlertsBatch: jest.fn().mockResolvedValue([]),
    } as any;

    // No RAG service → mark processed and skip
    const evalNode = createEvaluateSignalNode(
      {} as any,
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [makeSignal(1), makeSignal(2), makeSignal(3)],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await evalNode(state);
    expect(result.unprocessedSignals).toHaveLength(2);
    expect(result.unprocessedSignals?.[0]?.id).toBe('signal-2');
    expect(mockRepository.markSignalsProcessed).toHaveBeenCalledWith([
      'signal-1',
    ]);
  });
});
