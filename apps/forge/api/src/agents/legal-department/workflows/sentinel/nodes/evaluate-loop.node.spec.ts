import { createEvaluateLoopNode } from './evaluate-loop.node';
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

describe('EvaluateLoopNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits progress with queue position', async () => {
    const loopNode = createEvaluateLoopNode(mockObservability);

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [makeSignal(1), makeSignal(2)],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await loopNode(state);
    expect(result).toEqual({});
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-eval-1',
      expect.stringContaining('Evaluating signal 1 of 2'),
      expect.objectContaining({ remaining: 2, completed: 0 }),
    );
  });

  it('returns empty update (pure dispatcher)', async () => {
    const loopNode = createEvaluateLoopNode(mockObservability);

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [makeSignal(1)],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    const result = await loopNode(state);
    expect(result).toEqual({});
  });

  it('truncates long signal titles in progress message', async () => {
    const loopNode = createEvaluateLoopNode(mockObservability);
    const longSignal = makeSignal(1);
    longSignal.title = 'A'.repeat(100);

    const state = {
      executionContext: baseContext,
      unprocessedSignals: [longSignal],
      alerts: [],
      status: 'evaluating',
      startedAt: Date.now(),
    } as unknown as SentinelEvaluateState;

    await loopNode(state);
    const progressMessage = mockObservability.emitProgress.mock.calls[0][2];
    expect(progressMessage).toContain('...');
  });
});
