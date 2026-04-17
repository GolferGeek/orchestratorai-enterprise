import { createLoadUnprocessedNode } from './load-unprocessed.node';
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
  summary: 'Summary',
  full_text: 'Full text content',
  url: `https://example.com/${idx}`,
  published_at: '2026-01-01T00:00:00Z',
  signal_type: 'enforcement',
  jurisdictions: ['us-federal'],
  practice_areas: ['securities'],
  content_hash: `hash-${idx}`,
  processed: false,
  ingested_at: '2026-01-01T00:00:00Z',
});

describe('LoadUnprocessedNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads unprocessed signals from repository', async () => {
    const signals = [makeSignal(1), makeSignal(2)];
    const mockRepository = {
      listSignals: jest.fn().mockResolvedValue(signals),
    } as any;

    const loadNode = createLoadUnprocessedNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [],
      status: 'loading',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await loadNode(state);
    expect(result.unprocessedSignals).toHaveLength(2);
    expect(result.status).toBe('evaluating');
    expect(mockRepository.listSignals).toHaveBeenCalledWith('test-org', {
      processed: false,
      limit: 100,
    });
  });

  it('sets completed status when no signals found', async () => {
    const mockRepository = {
      listSignals: jest.fn().mockResolvedValue([]),
    } as any;

    const loadNode = createLoadUnprocessedNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [],
      status: 'loading',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await loadNode(state);
    expect(result.unprocessedSignals).toHaveLength(0);
    expect(result.status).toBe('completed');
  });

  it('emits progress events', async () => {
    const mockRepository = {
      listSignals: jest.fn().mockResolvedValue([makeSignal(1)]),
    } as any;

    const loadNode = createLoadUnprocessedNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [],
      status: 'loading',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    await loadNode(state);
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-eval-1',
      'Loading unprocessed signals',
      expect.objectContaining({ step: 'sentinel_eval_load_start' }),
    );
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-eval-1',
      expect.stringContaining('Found 1 unprocessed'),
      expect.objectContaining({ step: 'sentinel_eval_load_complete' }),
    );
  });
});
