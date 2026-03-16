import { describe, expect, it } from 'vitest';
import { router } from '../index';

describe('router matrix route', () => {
  it('registers /matrix route', () => {
    const matrixRoute = router.getRoutes().find((route) => route.path === '/matrix');
    expect(matrixRoute).toBeTruthy();
    expect(matrixRoute?.name).toBe('matrix');
  });
});
