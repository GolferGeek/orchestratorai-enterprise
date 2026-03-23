/**
 * entitlements.store.spec.ts
 *
 * Unit tests for the Command entitlements Pinia store.
 * Verifies that entitlements-based filtering of products works correctly,
 * all mutations behave as documented, and the store resets cleanly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useEntitlementsStore,
  type ProductEntitlement,
} from '@/stores/entitlementsStore';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntitlement(
  productSlug: string,
  hasAccess: boolean,
  port = 6000,
): ProductEntitlement {
  return {
    productSlug,
    productName: productSlug,
    description: `${productSlug} description`,
    port,
    icon: 'cube-outline',
    hasAccess,
  };
}

const ALL_PRODUCTS: ProductEntitlement[] = [
  makeEntitlement('forge', true, 6201),
  makeEntitlement('compose', true, 6301),
  makeEntitlement('protocol-lab', false, 6400),
  makeEntitlement('admin', false, 6101),
  makeEntitlement('pulse', true, 6501),
  makeEntitlement('bridge', false, 6601),
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useEntitlementsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty entitlements list', () => {
      const store = useEntitlementsStore();
      expect(store.entitlements).toEqual([]);
    });

    it('starts as not loaded', () => {
      const store = useEntitlementsStore();
      expect(store.isLoaded).toBe(false);
    });

    it('starts as not loading', () => {
      const store = useEntitlementsStore();
      expect(store.isLoading).toBe(false);
    });

    it('starts with no error', () => {
      const store = useEntitlementsStore();
      expect(store.error).toBeNull();
    });
  });

  // ─── setEntitlements ──────────────────────────────────────────────────

  describe('setEntitlements', () => {
    it('stores the provided product entitlements', () => {
      const store = useEntitlementsStore();
      store.setEntitlements(ALL_PRODUCTS);
      expect(store.entitlements).toEqual(ALL_PRODUCTS);
    });

    it('marks the store as loaded after setting entitlements', () => {
      const store = useEntitlementsStore();
      store.setEntitlements(ALL_PRODUCTS);
      expect(store.isLoaded).toBe(true);
    });

    it('clears any existing error when entitlements are set', () => {
      const store = useEntitlementsStore();
      store.setError('Previous error');
      store.setEntitlements(ALL_PRODUCTS);
      expect(store.error).toBeNull();
    });

    it('accepts an empty array (no products entitled)', () => {
      const store = useEntitlementsStore();
      store.setEntitlements([]);
      expect(store.entitlements).toEqual([]);
      expect(store.isLoaded).toBe(true);
    });
  });

  // ─── accessibleProducts (computed) ───────────────────────────────────

  describe('accessibleProducts (computed)', () => {
    it('returns only products where hasAccess is true', () => {
      const store = useEntitlementsStore();
      store.setEntitlements(ALL_PRODUCTS);

      const accessible = store.accessibleProducts;
      expect(accessible.every((p) => p.hasAccess)).toBe(true);
    });

    it('returns forge, compose, and pulse — the three granted products', () => {
      const store = useEntitlementsStore();
      store.setEntitlements(ALL_PRODUCTS);

      const slugs = store.accessibleProducts.map((p) => p.productSlug).sort();
      expect(slugs).toEqual(['compose', 'forge', 'pulse']);
    });

    it('returns an empty list when no products have access', () => {
      const store = useEntitlementsStore();
      store.setEntitlements([
        makeEntitlement('forge', false),
        makeEntitlement('compose', false),
      ]);
      expect(store.accessibleProducts).toHaveLength(0);
    });

    it('returns all products when all have access', () => {
      const store = useEntitlementsStore();
      const allGranted = ALL_PRODUCTS.map((p) => ({ ...p, hasAccess: true }));
      store.setEntitlements(allGranted);
      expect(store.accessibleProducts).toHaveLength(allGranted.length);
    });

    it('returns empty array before entitlements are loaded', () => {
      const store = useEntitlementsStore();
      expect(store.accessibleProducts).toEqual([]);
    });

    it('does not include a product after its hasAccess is false', () => {
      const store = useEntitlementsStore();
      store.setEntitlements([
        makeEntitlement('forge', true),
        makeEntitlement('protocol-lab', false),
      ]);
      const slugs = store.accessibleProducts.map((p) => p.productSlug);
      expect(slugs).not.toContain('protocol-lab');
      expect(slugs).toContain('forge');
    });
  });

  // ─── setLoading ───────────────────────────────────────────────────────

  describe('setLoading', () => {
    it('sets isLoading to true', () => {
      const store = useEntitlementsStore();
      store.setLoading(true);
      expect(store.isLoading).toBe(true);
    });

    it('sets isLoading to false', () => {
      const store = useEntitlementsStore();
      store.setLoading(true);
      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });
  });

  // ─── setError ─────────────────────────────────────────────────────────

  describe('setError', () => {
    it('records an error message', () => {
      const store = useEntitlementsStore();
      store.setError('Auth API unavailable');
      expect(store.error).toBe('Auth API unavailable');
    });

    it('sets isLoading to false when error occurs', () => {
      const store = useEntitlementsStore();
      store.setLoading(true);
      store.setError('Network error');
      expect(store.isLoading).toBe(false);
    });

    it('does not mark the store as loaded on error', () => {
      const store = useEntitlementsStore();
      store.setError('Failed');
      expect(store.isLoaded).toBe(false);
    });
  });

  // ─── reset ────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all state back to initial values', () => {
      const store = useEntitlementsStore();
      store.setEntitlements(ALL_PRODUCTS);
      store.setLoading(true);
      store.setError('some error');

      store.reset();

      expect(store.entitlements).toEqual([]);
      expect(store.isLoaded).toBe(false);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('accessibleProducts returns empty after reset', () => {
      const store = useEntitlementsStore();
      store.setEntitlements(ALL_PRODUCTS);
      store.reset();
      expect(store.accessibleProducts).toEqual([]);
    });
  });

  // ─── Navigation filtering behaviour ──────────────────────────────────

  describe('navigation filtering behaviour', () => {
    it('a user with only Forge access sees only Forge in accessible products', () => {
      const store = useEntitlementsStore();
      store.setEntitlements([
        makeEntitlement('forge', true),
        makeEntitlement('compose', false),
        makeEntitlement('protocol-lab', false),
      ]);
      expect(store.accessibleProducts.map((p) => p.productSlug)).toEqual(['forge']);
    });

    it('a user with no products sees an empty navigation', () => {
      const store = useEntitlementsStore();
      store.setEntitlements(
        ['forge', 'compose', 'pulse', 'admin'].map((s) => makeEntitlement(s, false)),
      );
      expect(store.accessibleProducts).toHaveLength(0);
    });

    it('entitlement port is preserved so navigation links can use the correct port', () => {
      const store = useEntitlementsStore();
      store.setEntitlements([makeEntitlement('forge', true, 6201)]);
      const forge = store.accessibleProducts.find((p) => p.productSlug === 'forge');
      expect(forge?.port).toBe(6201);
    });
  });
});
