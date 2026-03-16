/**
 * Unit Tests for Tool Request Store
 * Tests pure state management for tool wishlist/requests
 *
 * Key Testing Areas:
 * - Store initialization
 * - State mutations (setters)
 * - Computed properties and getters
 * - Request filtering by universe/type/status/priority
 * - Pagination
 * - Request statistics
 * - Loading and error states
 * - Reset operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useToolRequestStore } from '../toolRequestStore';
import type {
  ToolRequest,
} from '../toolRequestStore';

describe('ToolRequestStore', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('should initialize with empty state', () => {
      const store = useToolRequestStore();

      expect(store.requests).toEqual([]);
      expect(store.selectedRequestId).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should have default filter values', () => {
      const store = useToolRequestStore();

      expect(store.filters).toEqual({
        universeId: null,
        targetId: null,
        requestType: null,
        status: null,
        priority: null,
      });
    });

    it('should have default pagination values', () => {
      const store = useToolRequestStore();

      expect(store.page).toBe(1);
      expect(store.pageSize).toBe(20);
      expect(store.totalCount).toBe(0);
    });
  });

  describe('Request Mutations', () => {
    it('should set requests', () => {
      const store = useToolRequestStore();

      const requests: ToolRequest[] = [
        {
          id: 'request-1',
          universeId: 'universe-1',
          universeName: 'Tech Stocks',
          targetId: 'target-1',
          targetName: 'AAPL',
          requestType: 'source',
          title: 'Add SEC filings source',
          description: 'Need real-time SEC filings',
          priority: 'high',
          status: 'wishlist',
          sourceType: 'api',
          sourceMissedOpportunityId: undefined,
          statusNotes: undefined,
          createdAt: '2026-01-09T10:00:00Z',
          updatedAt: '2026-01-09T10:00:00Z',
        },
      ];

      store.setRequests(requests);

      expect(store.requests).toHaveLength(1);
      expect(store.requests[0].id).toBe('request-1');
    });

    it('should add new request at beginning', () => {
      const store = useToolRequestStore();

      const request: ToolRequest = {
        id: 'request-1',
        universeId: 'universe-1',
        universeName: 'Tech Stocks',
        targetId: 'target-1',
        targetName: 'AAPL',
        requestType: 'source',
        title: 'Add SEC filings source',
        description: 'Need real-time SEC filings',
        priority: 'high',
        status: 'wishlist',
        sourceType: 'api',
        sourceMissedOpportunityId: undefined,
        statusNotes: undefined,
        createdAt: '2026-01-09T10:00:00Z',
        updatedAt: '2026-01-09T10:00:00Z',
      };

      store.addRequest(request);

      expect(store.requests).toHaveLength(1);
      expect(store.requests[0]).toEqual(request);
    });

    it('should add new request at beginning of existing list', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', createdAt: '2026-01-09T10:00:00Z' } as ToolRequest,
      ]);

      store.addRequest({
        id: 'request-2',
        createdAt: '2026-01-09T11:00:00Z',
      } as ToolRequest);

      expect(store.requests).toHaveLength(2);
      expect(store.requests[0].id).toBe('request-2'); // New request first
    });

    it('should update existing request when adding with same ID', () => {
      const store = useToolRequestStore();

      const request: ToolRequest = {
        id: 'request-1',
        status: 'wishlist',
      } as ToolRequest;

      store.addRequest(request);
      store.addRequest({ ...request, status: 'planned' });

      expect(store.requests).toHaveLength(1);
      expect(store.requests[0].status).toBe('planned');
    });

    it('should update request', () => {
      const store = useToolRequestStore();

      const request: ToolRequest = {
        id: 'request-1',
        status: 'wishlist',
        priority: 'low',
      } as ToolRequest;

      store.addRequest(request);
      store.updateRequest('request-1', {
        status: 'planned',
        priority: 'high',
        statusNotes: 'Approved for development',
      });

      expect(store.requests[0].status).toBe('planned');
      expect(store.requests[0].priority).toBe('high');
      expect(store.requests[0].statusNotes).toBe('Approved for development');
    });

    it('should not update non-existent request', () => {
      const store = useToolRequestStore();

      store.updateRequest('non-existent', { status: 'planned' });

      expect(store.requests).toHaveLength(0);
    });

    it('should remove request', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1' } as ToolRequest,
        { id: 'request-2' } as ToolRequest,
      ]);

      store.removeRequest('request-1');

      expect(store.requests).toHaveLength(1);
      expect(store.requests[0].id).toBe('request-2');
    });

    it('should clear selected request when removing it', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1' } as ToolRequest,
      ]);
      store.selectRequest('request-1');

      store.removeRequest('request-1');

      expect(store.selectedRequestId).toBeNull();
    });
  });

  describe('Selection Operations', () => {
    it('should select request', () => {
      const store = useToolRequestStore();

      store.selectRequest('request-1');

      expect(store.selectedRequestId).toBe('request-1');
    });

    it('should clear selection', () => {
      const store = useToolRequestStore();

      store.selectRequest('request-1');
      store.selectRequest(null);

      expect(store.selectedRequestId).toBeNull();
    });
  });

  describe('Computed Properties', () => {
    it('should compute selectedRequest', () => {
      const store = useToolRequestStore();

      const request: ToolRequest = {
        id: 'request-1',
        title: 'Request 1',
      } as ToolRequest;

      store.setRequests([request]);
      store.selectRequest('request-1');

      expect(store.selectedRequest).toEqual(request);
    });

    it('should return undefined for non-existent selected request', () => {
      const store = useToolRequestStore();

      store.selectRequest('non-existent');

      expect(store.selectedRequest).toBeUndefined();
    });

    it('should compute activeRequests', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', status: 'wishlist' } as ToolRequest,
        { id: 'request-2', status: 'done' } as ToolRequest,
        { id: 'request-3', status: 'planned' } as ToolRequest,
        { id: 'request-4', status: 'rejected' } as ToolRequest,
      ]);

      expect(store.activeRequests).toHaveLength(2);
      expect(store.activeRequests.every((r) => !['done', 'rejected'].includes(r.status))).toBe(true);
    });

    it('should compute wishlistRequests', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', status: 'wishlist' } as ToolRequest,
        { id: 'request-2', status: 'planned' } as ToolRequest,
        { id: 'request-3', status: 'wishlist' } as ToolRequest,
      ]);

      expect(store.wishlistRequests).toHaveLength(2);
      expect(store.wishlistRequests.every((r) => r.status === 'wishlist')).toBe(true);
    });

    it('should compute requestsByStatus', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', status: 'wishlist' } as ToolRequest,
        { id: 'request-2', status: 'planned' } as ToolRequest,
        { id: 'request-3', status: 'wishlist' } as ToolRequest,
        { id: 'request-4', status: 'done' } as ToolRequest,
      ]);

      const grouped = store.requestsByStatus;

      expect(grouped.wishlist).toHaveLength(2);
      expect(grouped.planned).toHaveLength(1);
      expect(grouped.done).toHaveLength(1);
      expect(grouped.in_progress).toHaveLength(0);
      expect(grouped.rejected).toHaveLength(0);
    });

    it('should compute requestsByType', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', requestType: 'source' } as ToolRequest,
        { id: 'request-2', requestType: 'integration' } as ToolRequest,
        { id: 'request-3', requestType: 'source' } as ToolRequest,
        { id: 'request-4', requestType: 'feature' } as ToolRequest,
      ]);

      const grouped = store.requestsByType;

      expect(grouped.source).toHaveLength(2);
      expect(grouped.integration).toHaveLength(1);
      expect(grouped.feature).toHaveLength(1);
    });

    it('should compute requestsByPriority', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', priority: 'high' } as ToolRequest,
        { id: 'request-2', priority: 'medium' } as ToolRequest,
        { id: 'request-3', priority: 'high' } as ToolRequest,
        { id: 'request-4', priority: 'low' } as ToolRequest,
      ]);

      const grouped = store.requestsByPriority;

      expect(grouped.high).toHaveLength(2);
      expect(grouped.medium).toHaveLength(1);
      expect(grouped.low).toHaveLength(1);
    });

    it('should compute totalPages', () => {
      const store = useToolRequestStore();

      store.setTotalCount(55);
      store.setPageSize(20);

      expect(store.totalPages).toBe(3); // ceil(55/20) = 3
    });

    it('should compute hasMore', () => {
      const store = useToolRequestStore();

      store.setTotalCount(55);
      store.setPageSize(20);
      store.setPage(1);

      expect(store.hasMore).toBe(true);

      store.setPage(3);

      expect(store.hasMore).toBe(false);
    });
  });

  describe('Request Statistics', () => {
    it('should compute requestStats', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', status: 'wishlist', priority: 'high' } as ToolRequest,
        { id: 'request-2', status: 'planned', priority: 'medium' } as ToolRequest,
        { id: 'request-3', status: 'in_progress', priority: 'high' } as ToolRequest,
        { id: 'request-4', status: 'done', priority: 'low' } as ToolRequest,
        { id: 'request-5', status: 'rejected', priority: 'low' } as ToolRequest,
      ]);

      const stats = store.requestStats;

      expect(stats.total).toBe(5);
      expect(stats.wishlist).toBe(1);
      expect(stats.planned).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.done).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.highPriority).toBe(2);
      expect(stats.completionRate).toBeCloseTo(20, 0); // 1 done / 5 total = 20%
    });

    it('should return 0 completion rate when no requests', () => {
      const store = useToolRequestStore();

      const stats = store.requestStats;

      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
    });
  });

  describe('Filter Operations', () => {
    const mockRequests: ToolRequest[] = [
      {
        id: 'request-1',
        universeId: 'universe-1',
        targetId: 'target-1',
        requestType: 'source',
        status: 'wishlist',
        priority: 'high',
      } as ToolRequest,
      {
        id: 'request-2',
        universeId: 'universe-2',
        targetId: 'target-2',
        requestType: 'integration',
        status: 'planned',
        priority: 'medium',
      } as ToolRequest,
      {
        id: 'request-3',
        universeId: 'universe-1',
        targetId: 'target-1',
        requestType: 'source',
        status: 'wishlist',
        priority: 'high',
      } as ToolRequest,
    ];

    it('should filter by universeId', () => {
      const store = useToolRequestStore();
      store.setRequests(mockRequests);

      store.setFilters({ universeId: 'universe-1' });

      expect(store.filteredRequests).toHaveLength(2);
      expect(store.filteredRequests.every((r) => r.universeId === 'universe-1')).toBe(true);
    });

    it('should filter by targetId', () => {
      const store = useToolRequestStore();
      store.setRequests(mockRequests);

      store.setFilters({ targetId: 'target-1' });

      expect(store.filteredRequests).toHaveLength(2);
      expect(store.filteredRequests.every((r) => r.targetId === 'target-1')).toBe(true);
    });

    it('should filter by requestType', () => {
      const store = useToolRequestStore();
      store.setRequests(mockRequests);

      store.setFilters({ requestType: 'source' });

      expect(store.filteredRequests).toHaveLength(2);
      expect(store.filteredRequests.every((r) => r.requestType === 'source')).toBe(true);
    });

    it('should filter by status', () => {
      const store = useToolRequestStore();
      store.setRequests(mockRequests);

      store.setFilters({ status: 'wishlist' });

      expect(store.filteredRequests).toHaveLength(2);
      expect(store.filteredRequests.every((r) => r.status === 'wishlist')).toBe(true);
    });

    it('should filter by priority', () => {
      const store = useToolRequestStore();
      store.setRequests(mockRequests);

      store.setFilters({ priority: 'high' });

      expect(store.filteredRequests).toHaveLength(2);
      expect(store.filteredRequests.every((r) => r.priority === 'high')).toBe(true);
    });

    it('should combine multiple filters', () => {
      const store = useToolRequestStore();
      store.setRequests(mockRequests);

      store.setFilters({ universeId: 'universe-1', requestType: 'source', status: 'wishlist' });

      expect(store.filteredRequests).toHaveLength(2);
      expect(store.filteredRequests.every((r) =>
        r.universeId === 'universe-1' && r.requestType === 'source' && r.status === 'wishlist'
      )).toBe(true);
    });

    it('should clear filters', () => {
      const store = useToolRequestStore();
      store.setRequests(mockRequests);

      store.setFilters({ universeId: 'universe-1', requestType: 'source' });
      store.clearFilters();

      expect(store.filters.universeId).toBeNull();
      expect(store.filters.targetId).toBeNull();
      expect(store.filters.requestType).toBeNull();
      expect(store.filters.status).toBeNull();
      expect(store.filters.priority).toBeNull();
    });
  });

  describe('Pagination Operations', () => {
    it('should set page', () => {
      const store = useToolRequestStore();

      store.setPage(3);

      expect(store.page).toBe(3);
    });

    it('should set page size', () => {
      const store = useToolRequestStore();

      store.setPageSize(50);

      expect(store.pageSize).toBe(50);
    });

    it('should set total count', () => {
      const store = useToolRequestStore();

      store.setTotalCount(150);

      expect(store.totalCount).toBe(150);
    });
  });

  describe('Getter Functions', () => {
    it('should get request by ID', () => {
      const store = useToolRequestStore();

      const request: ToolRequest = {
        id: 'request-1',
        title: 'Request 1',
      } as ToolRequest;

      store.setRequests([request]);

      expect(store.getRequestById('request-1')).toEqual(request);
      expect(store.getRequestById('non-existent')).toBeUndefined();
    });

    it('should get requests for universe', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', universeId: 'universe-1' } as ToolRequest,
        { id: 'request-2', universeId: 'universe-2' } as ToolRequest,
        { id: 'request-3', universeId: 'universe-1' } as ToolRequest,
      ]);

      const requests = store.getRequestsForUniverse('universe-1');

      expect(requests).toHaveLength(2);
      expect(requests.every((r) => r.universeId === 'universe-1')).toBe(true);
    });

    it('should get requests for target', () => {
      const store = useToolRequestStore();

      store.setRequests([
        { id: 'request-1', targetId: 'target-1' } as ToolRequest,
        { id: 'request-2', targetId: 'target-2' } as ToolRequest,
        { id: 'request-3', targetId: 'target-1' } as ToolRequest,
      ]);

      const requests = store.getRequestsForTarget('target-1');

      expect(requests).toHaveLength(2);
      expect(requests.every((r) => r.targetId === 'target-1')).toBe(true);
    });
  });

  describe('Loading and Error States', () => {
    it('should set loading state', () => {
      const store = useToolRequestStore();

      store.setLoading(true);
      expect(store.isLoading).toBe(true);

      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });

    it('should set error message', () => {
      const store = useToolRequestStore();

      store.setError('Something went wrong');
      expect(store.error).toBe('Something went wrong');
    });

    it('should clear error', () => {
      const store = useToolRequestStore();

      store.setError('Error message');
      store.clearError();

      expect(store.error).toBeNull();
    });
  });

  describe('Reset State', () => {
    it('should reset all state to initial values', () => {
      const store = useToolRequestStore();

      // Set various state
      store.setRequests([{ id: 'request-1' } as ToolRequest]);
      store.selectRequest('request-1');
      store.setFilters({ universeId: 'universe-1', status: 'wishlist' });
      store.setPage(5);
      store.setPageSize(50);
      store.setTotalCount(250);
      store.setError('Some error');
      store.setLoading(true);

      // Reset
      store.resetState();

      // Verify all reset
      expect(store.requests).toEqual([]);
      expect(store.selectedRequestId).toBeNull();
      expect(store.filters.universeId).toBeNull();
      expect(store.filters.targetId).toBeNull();
      expect(store.filters.requestType).toBeNull();
      expect(store.filters.status).toBeNull();
      expect(store.filters.priority).toBeNull();
      expect(store.page).toBe(1);
      expect(store.pageSize).toBe(20);
      expect(store.totalCount).toBe(0);
      expect(store.error).toBeNull();
      expect(store.isLoading).toBe(false);
    });
  });
});
