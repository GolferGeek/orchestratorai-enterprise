/**
 * Unit Tests for Source Store
 * Tests pure state management for prediction sources
 *
 * Key Testing Areas:
 * - Store initialization
 * - State mutations (setters)
 * - Computed properties and getters
 * - Source filtering by scope/type/domain
 * - Loading and error states
 * - Reset operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSourceStore } from '../sourceStore';
import type { PredictionSource } from '../sourceStore';

describe('SourceStore', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('should initialize with empty state', () => {
      const store = useSourceStore();

      expect(store.sources).toEqual([]);
      expect(store.selectedSourceId).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should have default filter values', () => {
      const store = useSourceStore();

      expect(store.filters).toEqual({
        scopeLevel: null,
        sourceType: null,
        domain: null,
        universeId: null,
        active: null,
      });
    });
  });

  describe('Source Mutations', () => {
    it('should set sources', () => {
      const store = useSourceStore();

      const sources: PredictionSource[] = [
        {
          id: 'source-1',
          name: 'Bloomberg RSS',
          sourceType: 'rss',
          scopeLevel: 'domain',
          domain: 'stocks',
          universeId: null,
          targetId: null,
          url: 'https://bloomberg.com/feed',
          crawlConfig: { frequency: '15min' },
          active: true,
          lastCrawledAt: null,
          itemsFound: 0,
          createdAt: '2026-01-09T10:00:00Z',
          updatedAt: '2026-01-09T10:00:00Z',
        },
      ];

      store.setSources(sources);

      expect(store.sources).toHaveLength(1);
      expect(store.sources[0].id).toBe('source-1');
    });

    it('should add new source', () => {
      const store = useSourceStore();

      const source: PredictionSource = {
        id: 'source-1',
        name: 'Bloomberg RSS',
        sourceType: 'rss',
        scopeLevel: 'domain',
        domain: 'stocks',
        universeId: null,
        targetId: null,
        url: 'https://bloomberg.com/feed',
        crawlConfig: { frequency: '15min' },
        active: true,
        lastCrawledAt: null,
        itemsFound: 0,
        createdAt: '2026-01-09T10:00:00Z',
        updatedAt: '2026-01-09T10:00:00Z',
      };

      store.addSource(source);

      expect(store.sources).toHaveLength(1);
      expect(store.sources[0]).toEqual(source);
    });

    it('should update existing source when adding with same ID', () => {
      const store = useSourceStore();

      const source: PredictionSource = {
        id: 'source-1',
        name: 'Bloomberg RSS',
        sourceType: 'rss',
        scopeLevel: 'domain',
        domain: 'stocks',
        universeId: null,
        targetId: null,
        url: 'https://bloomberg.com/feed',
        crawlConfig: { frequency: '15min' },
        active: true,
        lastCrawledAt: null,
        itemsFound: 0,
        createdAt: '2026-01-09T10:00:00Z',
        updatedAt: '2026-01-09T10:00:00Z',
      };

      store.addSource(source);
      store.addSource({ ...source, name: 'Updated Source' });

      expect(store.sources).toHaveLength(1);
      expect(store.sources[0].name).toBe('Updated Source');
    });

    it('should update source', () => {
      const store = useSourceStore();

      const source: PredictionSource = {
        id: 'source-1',
        name: 'Bloomberg RSS',
        sourceType: 'rss',
        scopeLevel: 'domain',
        domain: 'stocks',
        universeId: null,
        targetId: null,
        url: 'https://bloomberg.com/feed',
        crawlConfig: { frequency: '15min' },
        active: true,
        lastCrawledAt: null,
        itemsFound: 0,
        createdAt: '2026-01-09T10:00:00Z',
        updatedAt: '2026-01-09T10:00:00Z',
      };

      store.addSource(source);
      store.updateSource('source-1', { name: 'Modified Source', itemsFound: 100 });

      expect(store.sources[0].name).toBe('Modified Source');
      expect(store.sources[0].itemsFound).toBe(100);
      expect(store.sources[0].sourceType).toBe('rss'); // Unchanged
    });

    it('should not update non-existent source', () => {
      const store = useSourceStore();

      store.updateSource('non-existent', { name: 'New Name' });

      expect(store.sources).toHaveLength(0);
    });

    it('should remove source', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', name: 'Source 1' } as PredictionSource,
        { id: 'source-2', name: 'Source 2' } as PredictionSource,
      ]);

      store.removeSource('source-1');

      expect(store.sources).toHaveLength(1);
      expect(store.sources[0].id).toBe('source-2');
    });

    it('should clear selected source when removing it', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', name: 'Source 1' } as PredictionSource,
      ]);
      store.selectSource('source-1');

      store.removeSource('source-1');

      expect(store.selectedSourceId).toBeNull();
    });
  });

  describe('Selection Operations', () => {
    it('should select source', () => {
      const store = useSourceStore();

      store.selectSource('source-1');

      expect(store.selectedSourceId).toBe('source-1');
    });

    it('should clear selection', () => {
      const store = useSourceStore();

      store.selectSource('source-1');
      store.selectSource(null);

      expect(store.selectedSourceId).toBeNull();
    });
  });

  describe('Computed Properties', () => {
    it('should compute selectedSource', () => {
      const store = useSourceStore();

      const source: PredictionSource = {
        id: 'source-1',
        name: 'Bloomberg RSS',
      } as PredictionSource;

      store.setSources([source]);
      store.selectSource('source-1');

      expect(store.selectedSource).toEqual(source);
    });

    it('should return undefined for non-existent selected source', () => {
      const store = useSourceStore();

      store.selectSource('non-existent');

      expect(store.selectedSource).toBeUndefined();
    });

    it('should compute activeSources', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', active: true } as PredictionSource,
        { id: 'source-2', active: false } as PredictionSource,
        { id: 'source-3', active: true } as PredictionSource,
      ]);

      expect(store.activeSources).toHaveLength(2);
      expect(store.activeSources.every((s) => s.active)).toBe(true);
    });

    it('should compute sourcesByScopeLevel', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', scopeLevel: 'runner' } as PredictionSource,
        { id: 'source-2', scopeLevel: 'universe' } as PredictionSource,
        { id: 'source-3', scopeLevel: 'runner' } as PredictionSource,
        { id: 'source-4', scopeLevel: 'target' } as PredictionSource,
      ]);

      const grouped = store.sourcesByScopeLevel;

      expect(grouped.runner).toHaveLength(2);
      expect(grouped.universe).toHaveLength(1);
      expect(grouped.target).toHaveLength(1);
      expect(grouped.domain).toHaveLength(0);
    });

    it('should compute sourcesByType', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', sourceType: 'rss' } as PredictionSource,
        { id: 'source-2', sourceType: 'web' } as PredictionSource,
        { id: 'source-3', sourceType: 'rss' } as PredictionSource,
        { id: 'source-4', sourceType: 'api' } as PredictionSource,
      ]);

      const grouped = store.sourcesByType;

      expect(grouped.rss).toHaveLength(2);
      expect(grouped.web).toHaveLength(1);
      expect(grouped.api).toHaveLength(1);
      expect(grouped.twitter_search).toHaveLength(0);
    });
  });

  describe('Filter Operations', () => {
    const mockSources: PredictionSource[] = [
      {
        id: 'source-1',
        name: 'Source 1',
        sourceType: 'rss',
        scopeLevel: 'runner',
        domain: 'stocks',
        universeId: 'universe-1',
        active: true,
      } as PredictionSource,
      {
        id: 'source-2',
        name: 'Source 2',
        sourceType: 'web',
        scopeLevel: 'universe',
        domain: 'crypto',
        universeId: 'universe-2',
        active: false,
      } as PredictionSource,
      {
        id: 'source-3',
        name: 'Source 3',
        sourceType: 'rss',
        scopeLevel: 'runner',
        domain: 'stocks',
        universeId: 'universe-1',
        active: true,
      } as PredictionSource,
    ];

    it('should filter by scopeLevel', () => {
      const store = useSourceStore();
      store.setSources(mockSources);

      store.setFilters({ scopeLevel: 'runner' });

      expect(store.filteredSources).toHaveLength(2);
      expect(store.filteredSources.every((s) => s.scopeLevel === 'runner')).toBe(true);
    });

    it('should filter by sourceType', () => {
      const store = useSourceStore();
      store.setSources(mockSources);

      store.setFilters({ sourceType: 'rss' });

      expect(store.filteredSources).toHaveLength(2);
      expect(store.filteredSources.every((s) => s.sourceType === 'rss')).toBe(true);
    });

    it('should filter by domain', () => {
      const store = useSourceStore();
      store.setSources(mockSources);

      store.setFilters({ domain: 'stocks' });

      expect(store.filteredSources).toHaveLength(2);
      expect(store.filteredSources.every((s) => s.domain === 'stocks')).toBe(true);
    });

    it('should filter by universeId', () => {
      const store = useSourceStore();
      store.setSources(mockSources);

      store.setFilters({ universeId: 'universe-1' });

      expect(store.filteredSources).toHaveLength(2);
      expect(store.filteredSources.every((s) => s.universeId === 'universe-1')).toBe(true);
    });

    it('should filter by active status', () => {
      const store = useSourceStore();
      store.setSources(mockSources);

      store.setFilters({ active: true });

      expect(store.filteredSources).toHaveLength(2);
      expect(store.filteredSources.every((s) => s.active)).toBe(true);
    });

    it('should combine multiple filters', () => {
      const store = useSourceStore();
      store.setSources(mockSources);

      store.setFilters({ sourceType: 'rss', domain: 'stocks', active: true });

      expect(store.filteredSources).toHaveLength(2);
      expect(store.filteredSources.every((s) =>
        s.sourceType === 'rss' && s.domain === 'stocks' && s.active
      )).toBe(true);
    });

    it('should clear filters', () => {
      const store = useSourceStore();
      store.setSources(mockSources);

      store.setFilters({ sourceType: 'rss', domain: 'stocks' });
      store.clearFilters();

      expect(store.filters.scopeLevel).toBeNull();
      expect(store.filters.sourceType).toBeNull();
      expect(store.filters.domain).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.active).toBeNull();
    });
  });

  describe('Getter Functions', () => {
    it('should get source by ID', () => {
      const store = useSourceStore();

      const source: PredictionSource = {
        id: 'source-1',
        name: 'Source 1',
      } as PredictionSource;

      store.setSources([source]);

      expect(store.getSourceById('source-1')).toEqual(source);
      expect(store.getSourceById('non-existent')).toBeUndefined();
    });

    it('should get sources for universe', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', universeId: 'universe-1' } as PredictionSource,
        { id: 'source-2', universeId: 'universe-2' } as PredictionSource,
        { id: 'source-3', universeId: 'universe-1' } as PredictionSource,
      ]);

      const sources = store.getSourcesForUniverse('universe-1');

      expect(sources).toHaveLength(2);
      expect(sources.every((s) => s.universeId === 'universe-1')).toBe(true);
    });

    it('should get sources for target', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', targetId: 'target-1' } as PredictionSource,
        { id: 'source-2', targetId: 'target-2' } as PredictionSource,
        { id: 'source-3', targetId: 'target-1' } as PredictionSource,
      ]);

      const sources = store.getSourcesForTarget('target-1');

      expect(sources).toHaveLength(2);
      expect(sources.every((s) => s.targetId === 'target-1')).toBe(true);
    });

    it('should get sources for domain', () => {
      const store = useSourceStore();

      store.setSources([
        { id: 'source-1', domain: 'stocks' } as PredictionSource,
        { id: 'source-2', domain: 'crypto' } as PredictionSource,
        { id: 'source-3', domain: 'stocks' } as PredictionSource,
      ]);

      const sources = store.getSourcesForDomain('stocks');

      expect(sources).toHaveLength(2);
      expect(sources.every((s) => s.domain === 'stocks')).toBe(true);
    });
  });

  describe('Loading and Error States', () => {
    it('should set loading state', () => {
      const store = useSourceStore();

      store.setLoading(true);
      expect(store.isLoading).toBe(true);

      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });

    it('should set error message', () => {
      const store = useSourceStore();

      store.setError('Something went wrong');
      expect(store.error).toBe('Something went wrong');
    });

    it('should clear error', () => {
      const store = useSourceStore();

      store.setError('Error message');
      store.clearError();

      expect(store.error).toBeNull();
    });
  });

  describe('Reset State', () => {
    it('should reset all state to initial values', () => {
      const store = useSourceStore();

      // Set various state
      store.setSources([{ id: 'source-1' } as PredictionSource]);
      store.selectSource('source-1');
      store.setFilters({ sourceType: 'rss', domain: 'stocks' });
      store.setError('Some error');
      store.setLoading(true);

      // Reset
      store.resetState();

      // Verify all reset
      expect(store.sources).toEqual([]);
      expect(store.selectedSourceId).toBeNull();
      expect(store.filters.scopeLevel).toBeNull();
      expect(store.filters.sourceType).toBeNull();
      expect(store.filters.domain).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.active).toBeNull();
      expect(store.error).toBeNull();
      expect(store.isLoading).toBe(false);
    });
  });
});
