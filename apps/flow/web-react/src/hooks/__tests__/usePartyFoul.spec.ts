import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePartyFoul } from '../usePartyFoul';

// Mock flowApiService - prevents singleton instantiation that requires env vars
vi.mock('@/services/flowApiService', () => ({
  flowApiService: {
    getSharedTasks: vi.fn(() => Promise.resolve([])),
  },
}));


// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('usePartyFoul', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return checkForPartyFouls function', () => {
    const { result } = renderHook(() => usePartyFoul());
    expect(result.current.checkForPartyFouls).toBeDefined();
    expect(typeof result.current.checkForPartyFouls).toBe('function');
  });

  it('checkForPartyFouls should be a stable callback', () => {
    const { result, rerender } = renderHook(() => usePartyFoul());
    const firstCallback = result.current.checkForPartyFouls;

    rerender();

    const secondCallback = result.current.checkForPartyFouls;
    expect(firstCallback).toBe(secondCallback);
  });
});
