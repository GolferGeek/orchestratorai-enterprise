import { createDeduplicateNode } from './deduplicate.node';
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

const makeItem = (hash: string): RawItem => ({
  title: `Item ${hash}`,
  summary: 'Summary',
  fullText: 'Full text content',
  url: `https://example.com/${hash}`,
  publishedAt: '2026-01-01T00:00:00Z',
  contentHash: hash,
});

describe('DeduplicateNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters out items with existing hashes', async () => {
    const mockRepository = {
      getExistingHashes: jest
        .fn()
        .mockResolvedValue(new Set(['hash-1', 'hash-3'])),
    } as any;

    const deduplicateNode = createDeduplicateNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      rawItems: [makeItem('hash-1'), makeItem('hash-2'), makeItem('hash-3')],
      newSignals: [],
      classifiedSignals: [],
      status: 'deduplicating',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await deduplicateNode(state);
    expect(result.newSignals).toHaveLength(1);
    expect(result.newSignals![0]!.contentHash).toBe('hash-2');
    expect(result.status).toBe('classifying');
  });

  it('returns all items when none exist', async () => {
    const mockRepository = {
      getExistingHashes: jest.fn().mockResolvedValue(new Set()),
    } as any;

    const deduplicateNode = createDeduplicateNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      rawItems: [makeItem('hash-1'), makeItem('hash-2')],
      newSignals: [],
      classifiedSignals: [],
      status: 'deduplicating',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await deduplicateNode(state);
    expect(result.newSignals).toHaveLength(2);
  });

  it('handles empty raw items', async () => {
    const mockRepository = {
      getExistingHashes: jest.fn(),
    } as any;

    const deduplicateNode = createDeduplicateNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      rawItems: [],
      newSignals: [],
      classifiedSignals: [],
      status: 'deduplicating',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await deduplicateNode(state);
    expect(result.newSignals).toHaveLength(0);
    expect(mockRepository.getExistingHashes).not.toHaveBeenCalled();
  });

  it('emits progress with dedup counts', async () => {
    const mockRepository = {
      getExistingHashes: jest.fn().mockResolvedValue(new Set(['hash-1'])),
    } as any;

    const deduplicateNode = createDeduplicateNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      rawItems: [makeItem('hash-1'), makeItem('hash-2')],
      newSignals: [],
      classifiedSignals: [],
      status: 'deduplicating',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    await deduplicateNode(state);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-sentinel-1',
      expect.stringContaining('2 fetched'),
      expect.objectContaining({
        totalFetched: 2,
        alreadyExists: 1,
        newCount: 1,
      }),
    );
  });
});
