/**
 * Unit Tests for Learning Store
 * Tests pure state management for prediction learnings and queue
 *
 * Key Testing Areas:
 * - Store initialization
 * - Learning mutations (setters)
 * - Queue mutations (setters)
 * - Computed properties and getters
 * - Learning filtering by scope/type/status
 * - Queue filtering
 * - Loading and error states
 * - Reset operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLearningStore } from '../learningStore';
import type {
  PredictionLearning,
  LearningQueueItem,
} from '../learningStore';

describe('LearningStore', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('should initialize with empty state', () => {
      const store = useLearningStore();

      expect(store.learnings).toEqual([]);
      expect(store.learningQueue).toEqual([]);
      expect(store.selectedLearningId).toBeNull();
      expect(store.selectedQueueItemId).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.isLoadingQueue).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should have default filter values', () => {
      const store = useLearningStore();

      expect(store.filters).toEqual({
        scopeLevel: null,
        learningType: null,
        sourceType: null,
        status: null,
        universeId: null,
        targetId: null,
        analystId: null,
      });
    });

    it('should have default queue filter values', () => {
      const store = useLearningStore();

      expect(store.queueFilters).toEqual({
        status: null,
        universeId: null,
        targetId: null,
      });
    });
  });

  describe('Learning Mutations', () => {
    it('should set learnings', () => {
      const store = useLearningStore();

      const learnings: PredictionLearning[] = [
        {
          id: 'learning-1',
          title: 'Pattern learning',
          scopeLevel: 'universe',
          domain: 'stocks',
          universeId: 'universe-1',
          targetId: null,
          analystId: 'analyst-1',
          learningType: 'pattern',
          content: 'Pattern content',
          sourceType: 'human',
          status: 'active',
          supersededBy: null,
          createdAt: '2026-01-09T10:00:00Z',
          updatedAt: '2026-01-09T10:00:00Z',
        },
      ];

      store.setLearnings(learnings);

      expect(store.learnings).toHaveLength(1);
      expect(store.learnings[0].id).toBe('learning-1');
    });

    it('should add new learning', () => {
      const store = useLearningStore();

      const learning: PredictionLearning = {
        id: 'learning-1',
        title: 'Pattern learning',
        scopeLevel: 'universe',
        domain: 'stocks',
        universeId: 'universe-1',
        targetId: null,
        analystId: 'analyst-1',
        learningType: 'pattern',
        content: 'Pattern content',
        sourceType: 'human',
        status: 'active',
        supersededBy: null,
        createdAt: '2026-01-09T10:00:00Z',
        updatedAt: '2026-01-09T10:00:00Z',
      };

      store.addLearning(learning);

      expect(store.learnings).toHaveLength(1);
      expect(store.learnings[0]).toEqual(learning);
    });

    it('should update existing learning when adding with same ID', () => {
      const store = useLearningStore();

      const learning: PredictionLearning = {
        id: 'learning-1',
        title: 'Pattern learning',
        status: 'active',
      } as PredictionLearning;

      store.addLearning(learning);
      store.addLearning({ ...learning, title: 'Updated Learning' });

      expect(store.learnings).toHaveLength(1);
      expect(store.learnings[0].title).toBe('Updated Learning');
    });

    it('should update learning', () => {
      const store = useLearningStore();

      const learning: PredictionLearning = {
        id: 'learning-1',
        title: 'Pattern learning',
        status: 'active',
      } as PredictionLearning;

      store.addLearning(learning);
      store.updateLearning('learning-1', { title: 'Modified Learning', status: 'superseded' });

      expect(store.learnings[0].title).toBe('Modified Learning');
      expect(store.learnings[0].status).toBe('superseded');
    });

    it('should not update non-existent learning', () => {
      const store = useLearningStore();

      store.updateLearning('non-existent', { title: 'New Title' });

      expect(store.learnings).toHaveLength(0);
    });

    it('should remove learning', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', title: 'Learning 1' } as PredictionLearning,
        { id: 'learning-2', title: 'Learning 2' } as PredictionLearning,
      ]);

      store.removeLearning('learning-1');

      expect(store.learnings).toHaveLength(1);
      expect(store.learnings[0].id).toBe('learning-2');
    });

    it('should clear selected learning when removing it', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', title: 'Learning 1' } as PredictionLearning,
      ]);
      store.selectLearning('learning-1');

      store.removeLearning('learning-1');

      expect(store.selectedLearningId).toBeNull();
    });
  });

  describe('Queue Mutations', () => {
    it('should set learning queue', () => {
      const store = useLearningStore();

      const queue: LearningQueueItem[] = [
        {
          id: 'queue-1',
          suggestedTitle: 'Suggested learning',
          suggestedContent: 'Content',
          suggestedLearningType: 'pattern',
          suggestedScopeLevel: 'universe',
          suggestedDomain: 'stocks',
          suggestedUniverseId: 'universe-1',
          suggestedTargetId: null,
          suggestedAnalystId: 'analyst-1',
          sourceEvaluationId: null,
          sourceMissedOpportunityId: null,
          confidence: 0.85,
          reasoning: 'Good pattern',
          status: 'pending',
          finalLearningId: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: null,
          createdAt: '2026-01-09T10:00:00Z',
        },
      ];

      store.setLearningQueue(queue);

      expect(store.learningQueue).toHaveLength(1);
      expect(store.learningQueue[0].id).toBe('queue-1');
    });

    it('should add new queue item', () => {
      const store = useLearningStore();

      const item: LearningQueueItem = {
        id: 'queue-1',
        suggestedTitle: 'Suggested learning',
        suggestedContent: 'Content',
        suggestedLearningType: 'pattern',
        suggestedScopeLevel: 'universe',
        suggestedDomain: 'stocks',
        suggestedUniverseId: 'universe-1',
        suggestedTargetId: null,
        suggestedAnalystId: 'analyst-1',
        sourceEvaluationId: null,
        sourceMissedOpportunityId: null,
        confidence: 0.85,
        reasoning: 'Good pattern',
        status: 'pending',
        finalLearningId: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: '2026-01-09T10:00:00Z',
      };

      store.addQueueItem(item);

      expect(store.learningQueue).toHaveLength(1);
      expect(store.learningQueue[0]).toEqual(item);
    });

    it('should update existing queue item when adding with same ID', () => {
      const store = useLearningStore();

      const item: LearningQueueItem = {
        id: 'queue-1',
        suggestedTitle: 'Suggested learning',
        status: 'pending',
      } as LearningQueueItem;

      store.addQueueItem(item);
      store.addQueueItem({ ...item, status: 'approved' });

      expect(store.learningQueue).toHaveLength(1);
      expect(store.learningQueue[0].status).toBe('approved');
    });

    it('should update queue item', () => {
      const store = useLearningStore();

      const item: LearningQueueItem = {
        id: 'queue-1',
        status: 'pending',
      } as LearningQueueItem;

      store.addQueueItem(item);
      store.updateQueueItem('queue-1', { status: 'approved', reviewedBy: 'user-1' });

      expect(store.learningQueue[0].status).toBe('approved');
      expect(store.learningQueue[0].reviewedBy).toBe('user-1');
    });

    it('should not update non-existent queue item', () => {
      const store = useLearningStore();

      store.updateQueueItem('non-existent', { status: 'approved' });

      expect(store.learningQueue).toHaveLength(0);
    });

    it('should remove queue item', () => {
      const store = useLearningStore();

      store.setLearningQueue([
        { id: 'queue-1' } as LearningQueueItem,
        { id: 'queue-2' } as LearningQueueItem,
      ]);

      store.removeQueueItem('queue-1');

      expect(store.learningQueue).toHaveLength(1);
      expect(store.learningQueue[0].id).toBe('queue-2');
    });

    it('should clear selected queue item when removing it', () => {
      const store = useLearningStore();

      store.setLearningQueue([
        { id: 'queue-1' } as LearningQueueItem,
      ]);
      store.selectQueueItem('queue-1');

      store.removeQueueItem('queue-1');

      expect(store.selectedQueueItemId).toBeNull();
    });
  });

  describe('Selection Operations', () => {
    it('should select learning', () => {
      const store = useLearningStore();

      store.selectLearning('learning-1');

      expect(store.selectedLearningId).toBe('learning-1');
    });

    it('should clear learning selection', () => {
      const store = useLearningStore();

      store.selectLearning('learning-1');
      store.selectLearning(null);

      expect(store.selectedLearningId).toBeNull();
    });

    it('should select queue item', () => {
      const store = useLearningStore();

      store.selectQueueItem('queue-1');

      expect(store.selectedQueueItemId).toBe('queue-1');
    });

    it('should clear queue item selection', () => {
      const store = useLearningStore();

      store.selectQueueItem('queue-1');
      store.selectQueueItem(null);

      expect(store.selectedQueueItemId).toBeNull();
    });
  });

  describe('Computed Properties', () => {
    it('should compute selectedLearning', () => {
      const store = useLearningStore();

      const learning: PredictionLearning = {
        id: 'learning-1',
        title: 'Learning 1',
      } as PredictionLearning;

      store.setLearnings([learning]);
      store.selectLearning('learning-1');

      expect(store.selectedLearning).toEqual(learning);
    });

    it('should return undefined for non-existent selected learning', () => {
      const store = useLearningStore();

      store.selectLearning('non-existent');

      expect(store.selectedLearning).toBeUndefined();
    });

    it('should compute selectedQueueItem', () => {
      const store = useLearningStore();

      const item: LearningQueueItem = {
        id: 'queue-1',
        suggestedTitle: 'Queue 1',
      } as LearningQueueItem;

      store.setLearningQueue([item]);
      store.selectQueueItem('queue-1');

      expect(store.selectedQueueItem).toEqual(item);
    });

    it('should return undefined for non-existent selected queue item', () => {
      const store = useLearningStore();

      store.selectQueueItem('non-existent');

      expect(store.selectedQueueItem).toBeUndefined();
    });

    it('should compute activeLearnings', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', status: 'active' } as PredictionLearning,
        { id: 'learning-2', status: 'superseded' } as PredictionLearning,
        { id: 'learning-3', status: 'active' } as PredictionLearning,
      ]);

      expect(store.activeLearnings).toHaveLength(2);
      expect(store.activeLearnings.every((l) => l.status === 'active')).toBe(true);
    });

    it('should compute pendingQueueItems', () => {
      const store = useLearningStore();

      store.setLearningQueue([
        { id: 'queue-1', status: 'pending' } as LearningQueueItem,
        { id: 'queue-2', status: 'approved' } as LearningQueueItem,
        { id: 'queue-3', status: 'pending' } as LearningQueueItem,
      ]);

      expect(store.pendingQueueItems).toHaveLength(2);
      expect(store.pendingQueueItems.every((q) => q.status === 'pending')).toBe(true);
    });

    it('should compute learningsByType', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', learningType: 'rule' } as PredictionLearning,
        { id: 'learning-2', learningType: 'pattern' } as PredictionLearning,
        { id: 'learning-3', learningType: 'rule' } as PredictionLearning,
        { id: 'learning-4', learningType: 'avoid' } as PredictionLearning,
      ]);

      const grouped = store.learningsByType;

      expect(grouped.rule).toHaveLength(2);
      expect(grouped.pattern).toHaveLength(1);
      expect(grouped.avoid).toHaveLength(1);
      expect(grouped.weight_adjustment).toHaveLength(0);
    });

    it('should compute learningsByScopeLevel', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', scopeLevel: 'runner' } as PredictionLearning,
        { id: 'learning-2', scopeLevel: 'universe' } as PredictionLearning,
        { id: 'learning-3', scopeLevel: 'runner' } as PredictionLearning,
        { id: 'learning-4', scopeLevel: 'target' } as PredictionLearning,
      ]);

      const grouped = store.learningsByScopeLevel;

      expect(grouped.runner).toHaveLength(2);
      expect(grouped.universe).toHaveLength(1);
      expect(grouped.target).toHaveLength(1);
      expect(grouped.domain).toHaveLength(0);
    });
  });

  describe('Learning Filter Operations', () => {
    const mockLearnings: PredictionLearning[] = [
      {
        id: 'learning-1',
        scopeLevel: 'runner',
        learningType: 'rule',
        sourceType: 'human',
        status: 'active',
        universeId: 'universe-1',
        targetId: 'target-1',
        analystId: 'analyst-1',
      } as PredictionLearning,
      {
        id: 'learning-2',
        scopeLevel: 'universe',
        learningType: 'pattern',
        sourceType: 'ai_suggested',
        status: 'superseded',
        universeId: 'universe-2',
        targetId: null,
        analystId: 'analyst-2',
      } as PredictionLearning,
      {
        id: 'learning-3',
        scopeLevel: 'runner',
        learningType: 'rule',
        sourceType: 'human',
        status: 'active',
        universeId: 'universe-1',
        targetId: 'target-1',
        analystId: 'analyst-1',
      } as PredictionLearning,
    ];

    it('should filter by scopeLevel', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ scopeLevel: 'runner' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) => l.scopeLevel === 'runner')).toBe(true);
    });

    it('should filter by learningType', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ learningType: 'rule' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) => l.learningType === 'rule')).toBe(true);
    });

    it('should filter by sourceType', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ sourceType: 'human' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) => l.sourceType === 'human')).toBe(true);
    });

    it('should filter by status', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ status: 'active' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) => l.status === 'active')).toBe(true);
    });

    it('should filter by universeId', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ universeId: 'universe-1' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) => l.universeId === 'universe-1')).toBe(true);
    });

    it('should filter by targetId', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ targetId: 'target-1' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) => l.targetId === 'target-1')).toBe(true);
    });

    it('should filter by analystId', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ analystId: 'analyst-1' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) => l.analystId === 'analyst-1')).toBe(true);
    });

    it('should combine multiple filters', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ scopeLevel: 'runner', learningType: 'rule', status: 'active' });

      expect(store.filteredLearnings).toHaveLength(2);
      expect(store.filteredLearnings.every((l) =>
        l.scopeLevel === 'runner' && l.learningType === 'rule' && l.status === 'active'
      )).toBe(true);
    });

    it('should clear filters', () => {
      const store = useLearningStore();
      store.setLearnings(mockLearnings);

      store.setFilters({ scopeLevel: 'runner', learningType: 'rule' });
      store.clearFilters();

      expect(store.filters.scopeLevel).toBeNull();
      expect(store.filters.learningType).toBeNull();
      expect(store.filters.sourceType).toBeNull();
      expect(store.filters.status).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.targetId).toBeNull();
      expect(store.filters.analystId).toBeNull();
    });
  });

  describe('Queue Filter Operations', () => {
    const mockQueue: LearningQueueItem[] = [
      {
        id: 'queue-1',
        status: 'pending',
        suggestedUniverseId: 'universe-1',
        suggestedTargetId: 'target-1',
      } as LearningQueueItem,
      {
        id: 'queue-2',
        status: 'approved',
        suggestedUniverseId: 'universe-2',
        suggestedTargetId: null,
      } as LearningQueueItem,
      {
        id: 'queue-3',
        status: 'pending',
        suggestedUniverseId: 'universe-1',
        suggestedTargetId: 'target-1',
      } as LearningQueueItem,
    ];

    it('should filter queue by status', () => {
      const store = useLearningStore();
      store.setLearningQueue(mockQueue);

      store.setQueueFilters({ status: 'pending' });

      expect(store.filteredLearningQueue).toHaveLength(2);
      expect(store.filteredLearningQueue.every((q) => q.status === 'pending')).toBe(true);
    });

    it('should filter queue by universeId', () => {
      const store = useLearningStore();
      store.setLearningQueue(mockQueue);

      store.setQueueFilters({ universeId: 'universe-1' });

      expect(store.filteredLearningQueue).toHaveLength(2);
      expect(store.filteredLearningQueue.every((q) => q.suggestedUniverseId === 'universe-1')).toBe(true);
    });

    it('should filter queue by targetId', () => {
      const store = useLearningStore();
      store.setLearningQueue(mockQueue);

      store.setQueueFilters({ targetId: 'target-1' });

      expect(store.filteredLearningQueue).toHaveLength(2);
      expect(store.filteredLearningQueue.every((q) => q.suggestedTargetId === 'target-1')).toBe(true);
    });

    it('should combine queue filters', () => {
      const store = useLearningStore();
      store.setLearningQueue(mockQueue);

      store.setQueueFilters({ status: 'pending', universeId: 'universe-1' });

      expect(store.filteredLearningQueue).toHaveLength(2);
    });

    it('should clear queue filters', () => {
      const store = useLearningStore();
      store.setLearningQueue(mockQueue);

      store.setQueueFilters({ status: 'pending', universeId: 'universe-1' });
      store.clearQueueFilters();

      expect(store.queueFilters.status).toBeNull();
      expect(store.queueFilters.universeId).toBeNull();
      expect(store.queueFilters.targetId).toBeNull();
    });
  });

  describe('Getter Functions', () => {
    it('should get learning by ID', () => {
      const store = useLearningStore();

      const learning: PredictionLearning = {
        id: 'learning-1',
        title: 'Learning 1',
      } as PredictionLearning;

      store.setLearnings([learning]);

      expect(store.getLearningById('learning-1')).toEqual(learning);
      expect(store.getLearningById('non-existent')).toBeUndefined();
    });

    it('should get queue item by ID', () => {
      const store = useLearningStore();

      const item: LearningQueueItem = {
        id: 'queue-1',
        suggestedTitle: 'Queue 1',
      } as LearningQueueItem;

      store.setLearningQueue([item]);

      expect(store.getQueueItemById('queue-1')).toEqual(item);
      expect(store.getQueueItemById('non-existent')).toBeUndefined();
    });

    it('should get learnings for universe', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', universeId: 'universe-1' } as PredictionLearning,
        { id: 'learning-2', universeId: 'universe-2' } as PredictionLearning,
        { id: 'learning-3', universeId: 'universe-1' } as PredictionLearning,
      ]);

      const learnings = store.getLearningsForUniverse('universe-1');

      expect(learnings).toHaveLength(2);
      expect(learnings.every((l) => l.universeId === 'universe-1')).toBe(true);
    });

    it('should get learnings for target', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', targetId: 'target-1' } as PredictionLearning,
        { id: 'learning-2', targetId: 'target-2' } as PredictionLearning,
        { id: 'learning-3', targetId: 'target-1' } as PredictionLearning,
      ]);

      const learnings = store.getLearningsForTarget('target-1');

      expect(learnings).toHaveLength(2);
      expect(learnings.every((l) => l.targetId === 'target-1')).toBe(true);
    });

    it('should get learnings for analyst', () => {
      const store = useLearningStore();

      store.setLearnings([
        { id: 'learning-1', analystId: 'analyst-1' } as PredictionLearning,
        { id: 'learning-2', analystId: 'analyst-2' } as PredictionLearning,
        { id: 'learning-3', analystId: 'analyst-1' } as PredictionLearning,
      ]);

      const learnings = store.getLearningsForAnalyst('analyst-1');

      expect(learnings).toHaveLength(2);
      expect(learnings.every((l) => l.analystId === 'analyst-1')).toBe(true);
    });
  });

  describe('Loading and Error States', () => {
    it('should set loading state', () => {
      const store = useLearningStore();

      store.setLoading(true);
      expect(store.isLoading).toBe(true);

      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });

    it('should set loading queue state', () => {
      const store = useLearningStore();

      store.setLoadingQueue(true);
      expect(store.isLoadingQueue).toBe(true);

      store.setLoadingQueue(false);
      expect(store.isLoadingQueue).toBe(false);
    });

    it('should set error message', () => {
      const store = useLearningStore();

      store.setError('Something went wrong');
      expect(store.error).toBe('Something went wrong');
    });

    it('should clear error', () => {
      const store = useLearningStore();

      store.setError('Error message');
      store.clearError();

      expect(store.error).toBeNull();
    });
  });

  describe('Reset State', () => {
    it('should reset all state to initial values', () => {
      const store = useLearningStore();

      // Set various state
      store.setLearnings([{ id: 'learning-1' } as PredictionLearning]);
      store.setLearningQueue([{ id: 'queue-1' } as LearningQueueItem]);
      store.selectLearning('learning-1');
      store.selectQueueItem('queue-1');
      store.setFilters({ scopeLevel: 'runner', learningType: 'rule' });
      store.setQueueFilters({ status: 'pending' });
      store.setError('Some error');
      store.setLoading(true);
      store.setLoadingQueue(true);

      // Reset
      store.resetState();

      // Verify all reset
      expect(store.learnings).toEqual([]);
      expect(store.learningQueue).toEqual([]);
      expect(store.selectedLearningId).toBeNull();
      expect(store.selectedQueueItemId).toBeNull();
      expect(store.filters.scopeLevel).toBeNull();
      expect(store.filters.learningType).toBeNull();
      expect(store.queueFilters.status).toBeNull();
      expect(store.error).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.isLoadingQueue).toBe(false);
    });
  });
});
