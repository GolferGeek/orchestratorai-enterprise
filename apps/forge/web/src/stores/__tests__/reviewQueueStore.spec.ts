/**
 * Unit Tests for Review Queue Store
 * Tests pure state management for HITL review queue
 *
 * Key Testing Areas:
 * - Store initialization
 * - State mutations (setters)
 * - Computed properties and getters
 * - Item filtering by status/target/disposition
 * - Pagination
 * - Review statistics
 * - Loading and error states
 * - Reset operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReviewQueueStore } from '../reviewQueueStore';
import type { ReviewQueueItem } from '../reviewQueueStore';

describe('ReviewQueueStore', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('should initialize with empty state', () => {
      const store = useReviewQueueStore();

      expect(store.items).toEqual([]);
      expect(store.selectedItemId).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should have default filter values', () => {
      const store = useReviewQueueStore();

      expect(store.filters).toEqual({
        status: null,
        targetId: null,
        universeId: null,
        disposition: null,
      });
    });

    it('should have default pagination values', () => {
      const store = useReviewQueueStore();

      expect(store.page).toBe(1);
      expect(store.pageSize).toBe(20);
      expect(store.totalCount).toBe(0);
    });
  });

  describe('Item Mutations', () => {
    it('should set items', () => {
      const store = useReviewQueueStore();

      const items: ReviewQueueItem[] = [
        {
          id: 'item-1',
          targetId: 'target-1',
          targetName: 'AAPL',
          targetSymbol: 'AAPL',
          signalId: 'signal-1',
          signalContent: 'Bullish signal',
          sourceName: 'Bloomberg',
          sourceType: 'rss',
          receivedAt: '2026-01-09T10:00:00Z',
          aiDisposition: 'bullish',
          aiStrength: 0.8,
          aiReasoning: 'Strong momentum',
          aiConfidence: 0.85,
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: null,
          finalDisposition: null,
          finalStrength: null,
          createdAt: '2026-01-09T10:00:00Z',
        },
      ];

      store.setItems(items);

      expect(store.items).toHaveLength(1);
      expect(store.items[0].id).toBe('item-1');
    });

    it('should add new item at beginning', () => {
      const store = useReviewQueueStore();

      const item: ReviewQueueItem = {
        id: 'item-1',
        targetId: 'target-1',
        targetName: 'AAPL',
        targetSymbol: 'AAPL',
        signalId: 'signal-1',
        signalContent: 'Bullish signal',
        sourceName: 'Bloomberg',
        sourceType: 'rss',
        receivedAt: '2026-01-09T10:00:00Z',
        aiDisposition: 'bullish',
        aiStrength: 0.8,
        aiReasoning: 'Strong momentum',
        aiConfidence: 0.85,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        finalDisposition: null,
        finalStrength: null,
        createdAt: '2026-01-09T10:00:00Z',
      };

      store.addItem(item);

      expect(store.items).toHaveLength(1);
      expect(store.items[0]).toEqual(item);
    });

    it('should add new item at beginning of existing list', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1', createdAt: '2026-01-09T10:00:00Z' } as ReviewQueueItem,
      ]);

      store.addItem({
        id: 'item-2',
        createdAt: '2026-01-09T11:00:00Z',
      } as ReviewQueueItem);

      expect(store.items).toHaveLength(2);
      expect(store.items[0].id).toBe('item-2'); // New item first
    });

    it('should update existing item when adding with same ID', () => {
      const store = useReviewQueueStore();

      const item: ReviewQueueItem = {
        id: 'item-1',
        status: 'pending',
      } as ReviewQueueItem;

      store.addItem(item);
      store.addItem({ ...item, status: 'approved' });

      expect(store.items).toHaveLength(1);
      expect(store.items[0].status).toBe('approved');
    });

    it('should update item', () => {
      const store = useReviewQueueStore();

      const item: ReviewQueueItem = {
        id: 'item-1',
        status: 'pending',
        reviewedBy: null,
      } as ReviewQueueItem;

      store.addItem(item);
      store.updateItem('item-1', {
        status: 'approved',
        reviewedBy: 'user-1',
        reviewNotes: 'Looks good',
      });

      expect(store.items[0].status).toBe('approved');
      expect(store.items[0].reviewedBy).toBe('user-1');
      expect(store.items[0].reviewNotes).toBe('Looks good');
    });

    it('should not update non-existent item', () => {
      const store = useReviewQueueStore();

      store.updateItem('non-existent', { status: 'approved' });

      expect(store.items).toHaveLength(0);
    });

    it('should remove item', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1' } as ReviewQueueItem,
        { id: 'item-2' } as ReviewQueueItem,
      ]);

      store.removeItem('item-1');

      expect(store.items).toHaveLength(1);
      expect(store.items[0].id).toBe('item-2');
    });

    it('should clear selected item when removing it', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1' } as ReviewQueueItem,
      ]);
      store.selectItem('item-1');

      store.removeItem('item-1');

      expect(store.selectedItemId).toBeNull();
    });
  });

  describe('Selection Operations', () => {
    it('should select item', () => {
      const store = useReviewQueueStore();

      store.selectItem('item-1');

      expect(store.selectedItemId).toBe('item-1');
    });

    it('should clear selection', () => {
      const store = useReviewQueueStore();

      store.selectItem('item-1');
      store.selectItem(null);

      expect(store.selectedItemId).toBeNull();
    });
  });

  describe('Computed Properties', () => {
    it('should compute selectedItem', () => {
      const store = useReviewQueueStore();

      const item: ReviewQueueItem = {
        id: 'item-1',
        targetName: 'AAPL',
      } as ReviewQueueItem;

      store.setItems([item]);
      store.selectItem('item-1');

      expect(store.selectedItem).toEqual(item);
    });

    it('should return undefined for non-existent selected item', () => {
      const store = useReviewQueueStore();

      store.selectItem('non-existent');

      expect(store.selectedItem).toBeUndefined();
    });

    it('should compute pendingItems', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1', status: 'pending' } as ReviewQueueItem,
        { id: 'item-2', status: 'approved' } as ReviewQueueItem,
        { id: 'item-3', status: 'pending' } as ReviewQueueItem,
      ]);

      expect(store.pendingItems).toHaveLength(2);
      expect(store.pendingItems.every((i) => i.status === 'pending')).toBe(true);
    });

    it('should compute pendingCount', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1', status: 'pending' } as ReviewQueueItem,
        { id: 'item-2', status: 'approved' } as ReviewQueueItem,
        { id: 'item-3', status: 'pending' } as ReviewQueueItem,
      ]);

      expect(store.pendingCount).toBe(2);
    });

    it('should compute itemsByStatus', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1', status: 'pending' } as ReviewQueueItem,
        { id: 'item-2', status: 'approved' } as ReviewQueueItem,
        { id: 'item-3', status: 'pending' } as ReviewQueueItem,
        { id: 'item-4', status: 'rejected' } as ReviewQueueItem,
      ]);

      const grouped = store.itemsByStatus;

      expect(grouped.pending).toHaveLength(2);
      expect(grouped.approved).toHaveLength(1);
      expect(grouped.rejected).toHaveLength(1);
      expect(grouped.modified).toHaveLength(0);
    });

    it('should compute itemsByTarget', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1', targetId: 'target-1' } as ReviewQueueItem,
        { id: 'item-2', targetId: 'target-2' } as ReviewQueueItem,
        { id: 'item-3', targetId: 'target-1' } as ReviewQueueItem,
      ]);

      const grouped = store.itemsByTarget;

      expect(grouped['target-1']).toHaveLength(2);
      expect(grouped['target-2']).toHaveLength(1);
    });

    it('should compute totalPages', () => {
      const store = useReviewQueueStore();

      store.setTotalCount(55);
      store.setPageSize(20);

      expect(store.totalPages).toBe(3); // ceil(55/20) = 3
    });

    it('should compute hasMore', () => {
      const store = useReviewQueueStore();

      store.setTotalCount(55);
      store.setPageSize(20);
      store.setPage(1);

      expect(store.hasMore).toBe(true);

      store.setPage(3);

      expect(store.hasMore).toBe(false);
    });
  });

  describe('Review Statistics', () => {
    it('should compute reviewStats', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1', status: 'pending' } as ReviewQueueItem,
        { id: 'item-2', status: 'approved' } as ReviewQueueItem,
        { id: 'item-3', status: 'approved' } as ReviewQueueItem,
        { id: 'item-4', status: 'rejected' } as ReviewQueueItem,
        { id: 'item-5', status: 'modified' } as ReviewQueueItem,
      ]);

      const stats = store.reviewStats;

      expect(stats.total).toBe(5);
      expect(stats.approved).toBe(2);
      expect(stats.rejected).toBe(1);
      expect(stats.modified).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.approvalRate).toBeCloseTo(60, 0); // (2 approved + 1 modified) / 5 = 60%
    });

    it('should return 0 approval rate when no items', () => {
      const store = useReviewQueueStore();

      const stats = store.reviewStats;

      expect(stats.total).toBe(0);
      expect(stats.approvalRate).toBe(0);
    });
  });

  describe('Filter Operations', () => {
    const mockItems: ReviewQueueItem[] = [
      {
        id: 'item-1',
        status: 'pending',
        targetId: 'target-1',
        aiDisposition: 'bullish',
      } as ReviewQueueItem,
      {
        id: 'item-2',
        status: 'approved',
        targetId: 'target-2',
        aiDisposition: 'bearish',
      } as ReviewQueueItem,
      {
        id: 'item-3',
        status: 'pending',
        targetId: 'target-1',
        aiDisposition: 'bullish',
      } as ReviewQueueItem,
    ];

    it('should filter by status', () => {
      const store = useReviewQueueStore();
      store.setItems(mockItems);

      store.setFilters({ status: 'pending' });

      expect(store.filteredItems).toHaveLength(2);
      expect(store.filteredItems.every((i) => i.status === 'pending')).toBe(true);
    });

    it('should filter by targetId', () => {
      const store = useReviewQueueStore();
      store.setItems(mockItems);

      store.setFilters({ targetId: 'target-1' });

      expect(store.filteredItems).toHaveLength(2);
      expect(store.filteredItems.every((i) => i.targetId === 'target-1')).toBe(true);
    });

    it('should filter by disposition', () => {
      const store = useReviewQueueStore();
      store.setItems(mockItems);

      store.setFilters({ disposition: 'bullish' });

      expect(store.filteredItems).toHaveLength(2);
      expect(store.filteredItems.every((i) => i.aiDisposition === 'bullish')).toBe(true);
    });

    it('should combine multiple filters', () => {
      const store = useReviewQueueStore();
      store.setItems(mockItems);

      store.setFilters({ status: 'pending', targetId: 'target-1' });

      expect(store.filteredItems).toHaveLength(2);
      expect(store.filteredItems.every((i) =>
        i.status === 'pending' && i.targetId === 'target-1'
      )).toBe(true);
    });

    it('should clear filters', () => {
      const store = useReviewQueueStore();
      store.setItems(mockItems);

      store.setFilters({ status: 'pending', targetId: 'target-1' });
      store.clearFilters();

      expect(store.filters.status).toBeNull();
      expect(store.filters.targetId).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.disposition).toBeNull();
    });
  });

  describe('Pagination Operations', () => {
    it('should set page', () => {
      const store = useReviewQueueStore();

      store.setPage(3);

      expect(store.page).toBe(3);
    });

    it('should set page size', () => {
      const store = useReviewQueueStore();

      store.setPageSize(50);

      expect(store.pageSize).toBe(50);
    });

    it('should set total count', () => {
      const store = useReviewQueueStore();

      store.setTotalCount(150);

      expect(store.totalCount).toBe(150);
    });
  });

  describe('Getter Functions', () => {
    it('should get item by ID', () => {
      const store = useReviewQueueStore();

      const item: ReviewQueueItem = {
        id: 'item-1',
        targetName: 'AAPL',
      } as ReviewQueueItem;

      store.setItems([item]);

      expect(store.getItemById('item-1')).toEqual(item);
      expect(store.getItemById('non-existent')).toBeUndefined();
    });

    it('should get items for target', () => {
      const store = useReviewQueueStore();

      store.setItems([
        { id: 'item-1', targetId: 'target-1' } as ReviewQueueItem,
        { id: 'item-2', targetId: 'target-2' } as ReviewQueueItem,
        { id: 'item-3', targetId: 'target-1' } as ReviewQueueItem,
      ]);

      const items = store.getItemsForTarget('target-1');

      expect(items).toHaveLength(2);
      expect(items.every((i) => i.targetId === 'target-1')).toBe(true);
    });
  });

  describe('Loading and Error States', () => {
    it('should set loading state', () => {
      const store = useReviewQueueStore();

      store.setLoading(true);
      expect(store.isLoading).toBe(true);

      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });

    it('should set error message', () => {
      const store = useReviewQueueStore();

      store.setError('Something went wrong');
      expect(store.error).toBe('Something went wrong');
    });

    it('should clear error', () => {
      const store = useReviewQueueStore();

      store.setError('Error message');
      store.clearError();

      expect(store.error).toBeNull();
    });
  });

  describe('Reset State', () => {
    it('should reset all state to initial values', () => {
      const store = useReviewQueueStore();

      // Set various state
      store.setItems([{ id: 'item-1' } as ReviewQueueItem]);
      store.selectItem('item-1');
      store.setFilters({ status: 'pending', targetId: 'target-1' });
      store.setPage(5);
      store.setPageSize(50);
      store.setTotalCount(250);
      store.setError('Some error');
      store.setLoading(true);

      // Reset
      store.resetState();

      // Verify all reset
      expect(store.items).toEqual([]);
      expect(store.selectedItemId).toBeNull();
      expect(store.filters.status).toBeNull();
      expect(store.filters.targetId).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.disposition).toBeNull();
      expect(store.page).toBe(1);
      expect(store.pageSize).toBe(20);
      expect(store.totalCount).toBe(0);
      expect(store.error).toBeNull();
      expect(store.isLoading).toBe(false);
    });
  });
});
