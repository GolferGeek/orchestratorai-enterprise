import { createClassifySignalsNode } from './classify-signals.node';
import type { SentinelIngestState } from '../sentinel-ingest.state';
import type { RawItem } from '../sentinel-ingest.types';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseContext = {
  orgSlug: 'test-org',
  userId: 'u1',
  conversationId: 'conv-sentinel-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma3:4b',
};

const makeItem = (title: string): RawItem => ({
  title,
  summary: 'Summary of ' + title,
  fullText: 'Full text of ' + title,
  url: 'https://example.com/article',
  publishedAt: '2026-01-01T00:00:00Z',
  contentHash: 'hash-' + title,
});

describe('ClassifySignalsNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips classification when no new signals', async () => {
    const mockLlm = {} as any;
    const classifyNode = createClassifySignalsNode(mockLlm, mockObservability);

    const state = {
      executionContext: baseContext,
      newSignals: [],
      classifiedSignals: [],
      status: 'classifying',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await classifyNode(state);
    expect(result.classifiedSignals).toHaveLength(0);
    expect(result.status).toBe('storing');
  });

  it('classifies signals via LLM', async () => {
    const mockLlm = {
      callLLMWithReasoning: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          signalType: 'enforcement',
          jurisdictions: ['us-federal'],
          practiceAreas: ['securities'],
        }),
        thinkingContent: null,
      }),
    } as any;

    const classifyNode = createClassifySignalsNode(mockLlm, mockObservability);

    const state = {
      executionContext: baseContext,
      newSignals: [makeItem('SEC enforcement action')],
      classifiedSignals: [],
      status: 'classifying',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await classifyNode(state);
    expect(result.classifiedSignals).toHaveLength(1);
    expect(result.classifiedSignals![0]!.signalType).toBe('enforcement');
    expect(result.classifiedSignals![0]!.jurisdictions).toEqual(['us-federal']);
    expect(result.classifiedSignals![0]!.practiceAreas).toEqual(['securities']);
  });

  it('falls back to defaults on LLM failure', async () => {
    const mockLlm = {
      callLLMWithReasoning: jest
        .fn()
        .mockRejectedValue(new Error('LLM unavailable')),
    } as any;

    const classifyNode = createClassifySignalsNode(mockLlm, mockObservability);

    const state = {
      executionContext: baseContext,
      newSignals: [makeItem('Some article')],
      classifiedSignals: [],
      status: 'classifying',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await classifyNode(state);
    expect(result.classifiedSignals).toHaveLength(1);
    expect(result.classifiedSignals![0]!.signalType).toBe('news');
    expect(result.classifiedSignals![0]!.jurisdictions).toEqual([]);
    expect(result.classifiedSignals![0]!.practiceAreas).toEqual([]);
  });

  it('falls back on invalid signal type', async () => {
    const mockLlm = {
      callLLMWithReasoning: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          signalType: 'invalid-type',
          jurisdictions: ['eu'],
          practiceAreas: ['data-privacy'],
        }),
        thinkingContent: null,
      }),
    } as any;

    const classifyNode = createClassifySignalsNode(mockLlm, mockObservability);

    const state = {
      executionContext: baseContext,
      newSignals: [makeItem('Article')],
      classifiedSignals: [],
      status: 'classifying',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await classifyNode(state);
    expect(result.classifiedSignals![0]!.signalType).toBe('news');
    expect(result.classifiedSignals![0]!.jurisdictions).toEqual(['eu']);
  });

  it('emits progress during classification', async () => {
    const mockLlm = {
      callLLMWithReasoning: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          signalType: 'ruling',
          jurisdictions: [],
          practiceAreas: [],
        }),
        thinkingContent: null,
      }),
    } as any;

    const classifyNode = createClassifySignalsNode(mockLlm, mockObservability);

    const state = {
      executionContext: baseContext,
      newSignals: [makeItem('Article 1'), makeItem('Article 2')],
      classifiedSignals: [],
      status: 'classifying',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    await classifyNode(state);
    // Start + completion progress
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-sentinel-1',
      expect.stringContaining('Classifying 2 new signals'),
      expect.objectContaining({ step: 'sentinel_classify_start' }),
    );
  });
});
