/**
 * Unit Tests for Missed Opportunity Store
 * Tests pure state management for missed opportunities
 *
 * Key Testing Areas:
 * - Store initialization
 * - State mutations (setters)
 * - Computed properties and getters
 * - Opportunity filtering by target/status/direction
 * - Analysis management
 * - Pagination
 * - Opportunity statistics
 * - Loading and error states
 * - Reset operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMissedOpportunityStore } from '../missedOpportunityStore';
import type {
  MissedOpportunity,
  MissedOpportunityAnalysis,
} from '../missedOpportunityStore';

describe('MissedOpportunityStore', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('should initialize with empty state', () => {
      const store = useMissedOpportunityStore();

      expect(store.opportunities).toEqual([]);
      expect(store.currentAnalysis).toBeNull();
      expect(store.selectedOpportunityId).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.isLoadingAnalysis).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should have default filter values', () => {
      const store = useMissedOpportunityStore();

      expect(store.filters).toEqual({
        targetId: null,
        universeId: null,
        analysisStatus: null,
        direction: null,
        minMovePercent: null,
      });
    });

    it('should have default pagination values', () => {
      const store = useMissedOpportunityStore();

      expect(store.page).toBe(1);
      expect(store.pageSize).toBe(20);
      expect(store.totalCount).toBe(0);
    });
  });

  describe('Opportunity Mutations', () => {
    it('should set opportunities', () => {
      const store = useMissedOpportunityStore();

      const opportunities: MissedOpportunity[] = [
        {
          id: 'opp-1',
          targetId: 'target-1',
          targetName: 'AAPL',
          targetSymbol: 'AAPL',
          moveStartAt: '2026-01-09T10:00:00Z',
          moveEndAt: '2026-01-09T14:00:00Z',
          startValue: 150,
          endValue: 160,
          movePercent: 6.67,
          direction: 'up',
          discoveredDrivers: ['Earnings beat'],
          signalsWeHad: [],
          sourceGaps: ['Missing SEC filings'],
          suggestedLearnings: [],
          analysisStatus: 'pending',
          createdAt: '2026-01-09T15:00:00Z',
          updatedAt: '2026-01-09T15:00:00Z',
        },
      ];

      store.setOpportunities(opportunities);

      expect(store.opportunities).toHaveLength(1);
      expect(store.opportunities[0].id).toBe('opp-1');
    });

    it('should add new opportunity at beginning', () => {
      const store = useMissedOpportunityStore();

      const opportunity: MissedOpportunity = {
        id: 'opp-1',
        targetId: 'target-1',
        targetName: 'AAPL',
        targetSymbol: 'AAPL',
        moveStartAt: '2026-01-09T10:00:00Z',
        moveEndAt: '2026-01-09T14:00:00Z',
        startValue: 150,
        endValue: 160,
        movePercent: 6.67,
        direction: 'up',
        discoveredDrivers: ['Earnings beat'],
        signalsWeHad: [],
        sourceGaps: ['Missing SEC filings'],
        suggestedLearnings: [],
        analysisStatus: 'pending',
        createdAt: '2026-01-09T15:00:00Z',
        updatedAt: '2026-01-09T15:00:00Z',
      };

      store.addOpportunity(opportunity);

      expect(store.opportunities).toHaveLength(1);
      expect(store.opportunities[0]).toEqual(opportunity);
    });

    it('should add new opportunity at beginning of existing list', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1', createdAt: '2026-01-09T10:00:00Z' } as MissedOpportunity,
      ]);

      store.addOpportunity({
        id: 'opp-2',
        createdAt: '2026-01-09T11:00:00Z',
      } as MissedOpportunity);

      expect(store.opportunities).toHaveLength(2);
      expect(store.opportunities[0].id).toBe('opp-2'); // New opportunity first
    });

    it('should update existing opportunity when adding with same ID', () => {
      const store = useMissedOpportunityStore();

      const opportunity: MissedOpportunity = {
        id: 'opp-1',
        analysisStatus: 'pending',
      } as MissedOpportunity;

      store.addOpportunity(opportunity);
      store.addOpportunity({ ...opportunity, analysisStatus: 'analyzed' });

      expect(store.opportunities).toHaveLength(1);
      expect(store.opportunities[0].analysisStatus).toBe('analyzed');
    });

    it('should update opportunity', () => {
      const store = useMissedOpportunityStore();

      const opportunity: MissedOpportunity = {
        id: 'opp-1',
        analysisStatus: 'pending',
      } as MissedOpportunity;

      store.addOpportunity(opportunity);
      store.updateOpportunity('opp-1', {
        analysisStatus: 'analyzed',
        discoveredDrivers: ['News', 'Momentum'],
      });

      expect(store.opportunities[0].analysisStatus).toBe('analyzed');
      expect(store.opportunities[0].discoveredDrivers).toEqual(['News', 'Momentum']);
    });

    it('should not update non-existent opportunity', () => {
      const store = useMissedOpportunityStore();

      store.updateOpportunity('non-existent', { analysisStatus: 'analyzed' });

      expect(store.opportunities).toHaveLength(0);
    });

    it('should remove opportunity', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1' } as MissedOpportunity,
        { id: 'opp-2' } as MissedOpportunity,
      ]);

      store.removeOpportunity('opp-1');

      expect(store.opportunities).toHaveLength(1);
      expect(store.opportunities[0].id).toBe('opp-2');
    });

    it('should clear selected opportunity and analysis when removing it', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1' } as MissedOpportunity,
      ]);
      store.selectOpportunity('opp-1');
      store.setCurrentAnalysis({ id: 'analysis-1' } as MissedOpportunityAnalysis);

      store.removeOpportunity('opp-1');

      expect(store.selectedOpportunityId).toBeNull();
      expect(store.currentAnalysis).toBeNull();
    });
  });

  describe('Analysis Management', () => {
    it('should set current analysis', () => {
      const store = useMissedOpportunityStore();

      const analysis: MissedOpportunityAnalysis = {
        id: 'analysis-1',
        missedOpportunityId: 'opp-1',
        drivers: [
          { driver: 'Earnings beat', confidence: 0.9, sources: ['Bloomberg'] },
        ],
        signalAnalysis: [],
        sourceRecommendations: [],
        learningRecommendations: [],
        summary: 'Strong earnings beat',
        createdAt: '2026-01-09T15:00:00Z',
      };

      store.setCurrentAnalysis(analysis);

      expect(store.currentAnalysis).toEqual(analysis);
    });

    it('should clear current analysis', () => {
      const store = useMissedOpportunityStore();

      store.setCurrentAnalysis({ id: 'analysis-1' } as MissedOpportunityAnalysis);
      store.setCurrentAnalysis(null);

      expect(store.currentAnalysis).toBeNull();
    });
  });

  describe('Selection Operations', () => {
    it('should select opportunity', () => {
      const store = useMissedOpportunityStore();

      store.selectOpportunity('opp-1');

      expect(store.selectedOpportunityId).toBe('opp-1');
    });

    it('should clear selection and analysis', () => {
      const store = useMissedOpportunityStore();

      store.selectOpportunity('opp-1');
      store.setCurrentAnalysis({ id: 'analysis-1' } as MissedOpportunityAnalysis);
      store.selectOpportunity(null);

      expect(store.selectedOpportunityId).toBeNull();
      expect(store.currentAnalysis).toBeNull();
    });
  });

  describe('Computed Properties', () => {
    it('should compute selectedOpportunity', () => {
      const store = useMissedOpportunityStore();

      const opportunity: MissedOpportunity = {
        id: 'opp-1',
        targetName: 'AAPL',
      } as MissedOpportunity;

      store.setOpportunities([opportunity]);
      store.selectOpportunity('opp-1');

      expect(store.selectedOpportunity).toEqual(opportunity);
    });

    it('should return undefined for non-existent selected opportunity', () => {
      const store = useMissedOpportunityStore();

      store.selectOpportunity('non-existent');

      expect(store.selectedOpportunity).toBeUndefined();
    });

    it('should compute pendingAnalysis', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1', analysisStatus: 'pending' } as MissedOpportunity,
        { id: 'opp-2', analysisStatus: 'analyzed' } as MissedOpportunity,
        { id: 'opp-3', analysisStatus: 'pending' } as MissedOpportunity,
      ]);

      expect(store.pendingAnalysis).toHaveLength(2);
      expect(store.pendingAnalysis.every((o) => o.analysisStatus === 'pending')).toBe(true);
    });

    it('should compute analyzedOpportunities', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1', analysisStatus: 'pending' } as MissedOpportunity,
        { id: 'opp-2', analysisStatus: 'analyzed' } as MissedOpportunity,
        { id: 'opp-3', analysisStatus: 'analyzed' } as MissedOpportunity,
      ]);

      expect(store.analyzedOpportunities).toHaveLength(2);
      expect(store.analyzedOpportunities.every((o) => o.analysisStatus === 'analyzed')).toBe(true);
    });

    it('should compute opportunitiesByTarget', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1', targetId: 'target-1' } as MissedOpportunity,
        { id: 'opp-2', targetId: 'target-2' } as MissedOpportunity,
        { id: 'opp-3', targetId: 'target-1' } as MissedOpportunity,
      ]);

      const grouped = store.opportunitiesByTarget;

      expect(grouped['target-1']).toHaveLength(2);
      expect(grouped['target-2']).toHaveLength(1);
    });

    it('should compute opportunitiesByDirection', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1', direction: 'up' } as MissedOpportunity,
        { id: 'opp-2', direction: 'down' } as MissedOpportunity,
        { id: 'opp-3', direction: 'up' } as MissedOpportunity,
      ]);

      const grouped = store.opportunitiesByDirection;

      expect(grouped.up).toHaveLength(2);
      expect(grouped.down).toHaveLength(1);
    });

    it('should compute totalPages', () => {
      const store = useMissedOpportunityStore();

      store.setTotalCount(55);
      store.setPageSize(20);

      expect(store.totalPages).toBe(3); // ceil(55/20) = 3
    });

    it('should compute hasMore', () => {
      const store = useMissedOpportunityStore();

      store.setTotalCount(55);
      store.setPageSize(20);
      store.setPage(1);

      expect(store.hasMore).toBe(true);

      store.setPage(3);

      expect(store.hasMore).toBe(false);
    });
  });

  describe('Opportunity Statistics', () => {
    it('should compute opportunityStats', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1', direction: 'up', movePercent: 5, analysisStatus: 'pending' } as MissedOpportunity,
        { id: 'opp-2', direction: 'down', movePercent: 3, analysisStatus: 'analyzed' } as MissedOpportunity,
        { id: 'opp-3', direction: 'up', movePercent: 7, analysisStatus: 'analyzed' } as MissedOpportunity,
        { id: 'opp-4', direction: 'up', movePercent: 4, analysisStatus: 'actioned' } as MissedOpportunity,
      ]);

      const stats = store.opportunityStats;

      expect(stats.total).toBe(4);
      expect(stats.avgMovePercent).toBeCloseTo(4.75, 1); // (5+3+7+4)/4 = 4.75
      expect(stats.upMoves).toBe(3);
      expect(stats.downMoves).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.analyzed).toBe(2);
      expect(stats.actioned).toBe(1);
    });

    it('should return 0 avgMovePercent when no opportunities', () => {
      const store = useMissedOpportunityStore();

      const stats = store.opportunityStats;

      expect(stats.total).toBe(0);
      expect(stats.avgMovePercent).toBe(0);
    });
  });

  describe('Filter Operations', () => {
    const mockOpportunities: MissedOpportunity[] = [
      {
        id: 'opp-1',
        targetId: 'target-1',
        analysisStatus: 'pending',
        direction: 'up',
        movePercent: 5,
      } as MissedOpportunity,
      {
        id: 'opp-2',
        targetId: 'target-2',
        analysisStatus: 'analyzed',
        direction: 'down',
        movePercent: 3,
      } as MissedOpportunity,
      {
        id: 'opp-3',
        targetId: 'target-1',
        analysisStatus: 'pending',
        direction: 'up',
        movePercent: 7,
      } as MissedOpportunity,
    ];

    it('should filter by targetId', () => {
      const store = useMissedOpportunityStore();
      store.setOpportunities(mockOpportunities);

      store.setFilters({ targetId: 'target-1' });

      expect(store.filteredOpportunities).toHaveLength(2);
      expect(store.filteredOpportunities.every((o) => o.targetId === 'target-1')).toBe(true);
    });

    it('should filter by analysisStatus', () => {
      const store = useMissedOpportunityStore();
      store.setOpportunities(mockOpportunities);

      store.setFilters({ analysisStatus: 'pending' });

      expect(store.filteredOpportunities).toHaveLength(2);
      expect(store.filteredOpportunities.every((o) => o.analysisStatus === 'pending')).toBe(true);
    });

    it('should filter by direction', () => {
      const store = useMissedOpportunityStore();
      store.setOpportunities(mockOpportunities);

      store.setFilters({ direction: 'up' });

      expect(store.filteredOpportunities).toHaveLength(2);
      expect(store.filteredOpportunities.every((o) => o.direction === 'up')).toBe(true);
    });

    it('should filter by minMovePercent', () => {
      const store = useMissedOpportunityStore();
      store.setOpportunities(mockOpportunities);

      store.setFilters({ minMovePercent: 5 });

      expect(store.filteredOpportunities).toHaveLength(2);
      expect(store.filteredOpportunities.every((o) => o.movePercent >= 5)).toBe(true);
    });

    it('should combine multiple filters', () => {
      const store = useMissedOpportunityStore();
      store.setOpportunities(mockOpportunities);

      store.setFilters({ targetId: 'target-1', direction: 'up', minMovePercent: 5 });

      expect(store.filteredOpportunities).toHaveLength(2);
      expect(store.filteredOpportunities.every((o) =>
        o.targetId === 'target-1' && o.direction === 'up' && o.movePercent >= 5
      )).toBe(true);
    });

    it('should clear filters', () => {
      const store = useMissedOpportunityStore();
      store.setOpportunities(mockOpportunities);

      store.setFilters({ targetId: 'target-1', direction: 'up' });
      store.clearFilters();

      expect(store.filters.targetId).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.analysisStatus).toBeNull();
      expect(store.filters.direction).toBeNull();
      expect(store.filters.minMovePercent).toBeNull();
    });
  });

  describe('Pagination Operations', () => {
    it('should set page', () => {
      const store = useMissedOpportunityStore();

      store.setPage(3);

      expect(store.page).toBe(3);
    });

    it('should set page size', () => {
      const store = useMissedOpportunityStore();

      store.setPageSize(50);

      expect(store.pageSize).toBe(50);
    });

    it('should set total count', () => {
      const store = useMissedOpportunityStore();

      store.setTotalCount(150);

      expect(store.totalCount).toBe(150);
    });
  });

  describe('Getter Functions', () => {
    it('should get opportunity by ID', () => {
      const store = useMissedOpportunityStore();

      const opportunity: MissedOpportunity = {
        id: 'opp-1',
        targetName: 'AAPL',
      } as MissedOpportunity;

      store.setOpportunities([opportunity]);

      expect(store.getOpportunityById('opp-1')).toEqual(opportunity);
      expect(store.getOpportunityById('non-existent')).toBeUndefined();
    });

    it('should get opportunities for target', () => {
      const store = useMissedOpportunityStore();

      store.setOpportunities([
        { id: 'opp-1', targetId: 'target-1' } as MissedOpportunity,
        { id: 'opp-2', targetId: 'target-2' } as MissedOpportunity,
        { id: 'opp-3', targetId: 'target-1' } as MissedOpportunity,
      ]);

      const opportunities = store.getOpportunitiesForTarget('target-1');

      expect(opportunities).toHaveLength(2);
      expect(opportunities.every((o) => o.targetId === 'target-1')).toBe(true);
    });
  });

  describe('Loading and Error States', () => {
    it('should set loading state', () => {
      const store = useMissedOpportunityStore();

      store.setLoading(true);
      expect(store.isLoading).toBe(true);

      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });

    it('should set loading analysis state', () => {
      const store = useMissedOpportunityStore();

      store.setLoadingAnalysis(true);
      expect(store.isLoadingAnalysis).toBe(true);

      store.setLoadingAnalysis(false);
      expect(store.isLoadingAnalysis).toBe(false);
    });

    it('should set error message', () => {
      const store = useMissedOpportunityStore();

      store.setError('Something went wrong');
      expect(store.error).toBe('Something went wrong');
    });

    it('should clear error', () => {
      const store = useMissedOpportunityStore();

      store.setError('Error message');
      store.clearError();

      expect(store.error).toBeNull();
    });
  });

  describe('Reset State', () => {
    it('should reset all state to initial values', () => {
      const store = useMissedOpportunityStore();

      // Set various state
      store.setOpportunities([{ id: 'opp-1' } as MissedOpportunity]);
      store.setCurrentAnalysis({ id: 'analysis-1' } as MissedOpportunityAnalysis);
      store.selectOpportunity('opp-1');
      store.setFilters({ targetId: 'target-1', direction: 'up' });
      store.setPage(5);
      store.setPageSize(50);
      store.setTotalCount(250);
      store.setError('Some error');
      store.setLoading(true);
      store.setLoadingAnalysis(true);

      // Reset
      store.resetState();

      // Verify all reset
      expect(store.opportunities).toEqual([]);
      expect(store.currentAnalysis).toBeNull();
      expect(store.selectedOpportunityId).toBeNull();
      expect(store.filters.targetId).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.analysisStatus).toBeNull();
      expect(store.filters.direction).toBeNull();
      expect(store.filters.minMovePercent).toBeNull();
      expect(store.page).toBe(1);
      expect(store.pageSize).toBe(20);
      expect(store.totalCount).toBe(0);
      expect(store.error).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.isLoadingAnalysis).toBe(false);
    });
  });
});
