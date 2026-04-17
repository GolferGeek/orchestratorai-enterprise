import { createUpdateSourceNode } from './update-source.node';
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

describe('UpdateSourceNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates source with null error on success', async () => {
    const mockRepository = {
      updateSourcePolled: jest.fn().mockResolvedValue(undefined),
    } as any;

    const updateNode = createUpdateSourceNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource(),
      status: 'updating_source',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    await updateNode(state);
    expect(mockRepository.updateSourcePolled).toHaveBeenCalledWith(
      'src-1',
      null,
    );
  });

  it('updates source with error message on failure', async () => {
    const mockRepository = {
      updateSourcePolled: jest.fn().mockResolvedValue(undefined),
    } as any;

    const updateNode = createUpdateSourceNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource(),
      status: 'failed',
      error: 'HTTP 503: Service Unavailable',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    await updateNode(state);
    expect(mockRepository.updateSourcePolled).toHaveBeenCalledWith(
      'src-1',
      'HTTP 503: Service Unavailable',
    );
  });

  it('handles no source config gracefully', async () => {
    const mockRepository = {
      updateSourcePolled: jest.fn(),
    } as any;

    const updateNode = createUpdateSourceNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      sourceConfig: undefined,
      status: 'updating_source',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await updateNode(state);
    expect(result).toEqual({});
    expect(mockRepository.updateSourcePolled).not.toHaveBeenCalled();
  });

  it('does not fail workflow if update throws', async () => {
    const mockRepository = {
      updateSourcePolled: jest
        .fn()
        .mockRejectedValue(new Error('DB connection error')),
    } as any;

    const updateNode = createUpdateSourceNode(
      mockObservability,
      mockRepository,
    );

    const state = {
      executionContext: baseContext,
      sourceConfig: makeSource(),
      status: 'updating_source',
      startedAt: Date.now(),
    } as unknown as SentinelIngestState;

    const result = await updateNode(state);
    expect(result).toEqual({});
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseContext,
      'conv-sentinel-1',
      expect.stringContaining('Failed to update source metadata'),
      expect.objectContaining({ step: 'sentinel_update_source_error' }),
    );
  });
});
