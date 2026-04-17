import {
  createFetchSourceNode,
  generateContentHash,
} from './fetch-source.node';
import type { SentinelIngestState } from '../sentinel-ingest.state';
import type { SentinelSource } from '../../../sentinel/sentinel.types';

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

const makeSource = (overrides?: Partial<SentinelSource>): SentinelSource => ({
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
  ...overrides,
});

describe('FetchSourceNode', () => {
  const fetchNode = createFetchSourceNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns failed status when no source config', async () => {
    const state = {
      executionContext: baseContext,
      sourceConfig: undefined,
      rawItems: [],
      newSignals: [],
      classifiedSignals: [],
      status: 'fetching',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await fetchNode(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No source configuration');
  });

  it('returns failed for unsupported source type', async () => {
    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource({ source_type: 'unknown' as any }),
      rawItems: [],
      newSignals: [],
      classifiedSignals: [],
      status: 'fetching',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await fetchNode(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Unsupported source type');
  });

  it('emits start progress', async () => {
    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource(),
      rawItems: [],
      newSignals: [],
      classifiedSignals: [],
      status: 'fetching',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    // Will fail because the URL doesn't exist, but start progress should emit
    await fetchNode(state);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-sentinel-1',
      expect.stringContaining('Fetching source'),
      expect.objectContaining({ step: 'sentinel_fetch_start' }),
    );
  });
});

describe('generateContentHash', () => {
  it('produces deterministic hash', () => {
    const h1 = generateContentHash(
      'Title',
      'https://example.com',
      '2026-01-01',
    );
    const h2 = generateContentHash(
      'Title',
      'https://example.com',
      '2026-01-01',
    );
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it('different inputs produce different hashes', () => {
    const h1 = generateContentHash('Title A', 'https://a.com', null);
    const h2 = generateContentHash('Title B', 'https://b.com', null);
    expect(h1).not.toBe(h2);
  });

  it('handles null publishedAt', () => {
    const h = generateContentHash('Title', 'https://example.com', null);
    expect(h).toHaveLength(64);
  });
});
