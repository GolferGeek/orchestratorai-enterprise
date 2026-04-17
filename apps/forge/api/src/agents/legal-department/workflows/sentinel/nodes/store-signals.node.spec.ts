import { createStoreSignalsNode } from './store-signals.node';
import type { SentinelIngestState } from '../sentinel-ingest.state';
import type { ClassifiedSignal } from '../sentinel-ingest.types';
import type {
  SentinelSource,
  SentinelSignal,
} from '../../../sentinel/sentinel.types';

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

const makeSource = (): SentinelSource => ({
  id: 'src-1',
  org_slug: 'test-org',
  name: 'Test RSS',
  source_type: 'rss',
  url: 'https://example.com/feed.xml',
  poll_interval_minutes: 60,
  practice_areas: ['general'],
  jurisdictions: ['us-federal'],
  enabled: true,
  last_polled_at: null,
  last_error: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const makeSignal = (idx: number): ClassifiedSignal => ({
  title: `Signal ${idx}`,
  summary: 'Summary',
  fullText: 'Full text content',
  url: `https://example.com/${idx}`,
  publishedAt: '2026-01-01T00:00:00Z',
  contentHash: `hash-${idx}`,
  signalType: 'enforcement',
  jurisdictions: ['us-federal'],
  practiceAreas: ['securities'],
});

const makeStoredSignal = (idx: number): SentinelSignal => ({
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

describe('StoreSignalsNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips when no classified signals', async () => {
    const mockRepository = {} as any;
    const storeNode = createStoreSignalsNode(mockObservability, mockRepository);

    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource(),
      classifiedSignals: [],
      status: 'storing',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await storeNode(state);
    expect(result.status).toBe('updating_source');
  });

  it('stores signals to database', async () => {
    const mockRepository = {
      createSignalsBatch: jest
        .fn()
        .mockResolvedValue([makeStoredSignal(1), makeStoredSignal(2)]),
    } as any;

    const storeNode = createStoreSignalsNode(mockObservability, mockRepository);

    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource(),
      classifiedSignals: [makeSignal(1), makeSignal(2)],
      status: 'storing',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await storeNode(state);
    expect(result.status).toBe('updating_source');
    expect(mockRepository.createSignalsBatch).toHaveBeenCalledWith(
      'test-org',
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'src-1', title: 'Signal 1' }),
      ]),
    );
  });

  it('returns failed when no source config', async () => {
    const mockRepository = {} as any;
    const storeNode = createStoreSignalsNode(mockObservability, mockRepository);

    const state = {
      executionContext: baseContext,
      sourceConfig: undefined,
      classifiedSignals: [makeSignal(1)],
      status: 'storing',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await storeNode(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No source configuration');
  });

  it('emits progress during storage', async () => {
    const mockRepository = {
      createSignalsBatch: jest.fn().mockResolvedValue([makeStoredSignal(1)]),
    } as any;

    const storeNode = createStoreSignalsNode(mockObservability, mockRepository);

    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource(),
      classifiedSignals: [makeSignal(1)],
      status: 'storing',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    await storeNode(state);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-sentinel-1',
      expect.stringContaining('Storing 1 signals'),
      expect.objectContaining({ step: 'sentinel_store_start' }),
    );
  });
});
