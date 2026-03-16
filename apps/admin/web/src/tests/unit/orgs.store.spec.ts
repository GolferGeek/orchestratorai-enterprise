/**
 * orgs.store.spec.ts
 *
 * Unit tests for the Admin orgs Pinia store.
 * No API calls — the store is state-only by design.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useOrgsStore } from '@/stores/orgs.store';
import type { Organization } from '@/services/auth-api.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrg(slug: string, name?: string): Organization {
  return {
    slug,
    name: name ?? slug,
    description: `${slug} description`,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useOrgsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty orgs list', () => {
      const store = useOrgsStore();
      expect(store.orgs).toEqual([]);
    });

    it('starts with no selected org', () => {
      const store = useOrgsStore();
      expect(store.selectedOrgSlug).toBeNull();
    });

    it('starts not loading', () => {
      const store = useOrgsStore();
      expect(store.loading).toBe(false);
    });

    it('starts with no error', () => {
      const store = useOrgsStore();
      expect(store.error).toBeNull();
    });
  });

  // ─── setOrgs ──────────────────────────────────────────────────────────

  describe('setOrgs', () => {
    it('populates the orgs list', () => {
      const store = useOrgsStore();
      const orgs = [makeOrg('acme'), makeOrg('globex')];
      store.setOrgs(orgs);
      expect(store.orgs).toEqual(orgs);
    });

    it('replaces an existing orgs list', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('old')]);
      store.setOrgs([makeOrg('new-1'), makeOrg('new-2')]);
      expect(store.orgs).toHaveLength(2);
    });
  });

  // ─── addOrg ───────────────────────────────────────────────────────────

  describe('addOrg', () => {
    it('appends a new org to the list', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme')]);
      store.addOrg(makeOrg('globex'));
      expect(store.orgs).toHaveLength(2);
      expect(store.orgs[1].slug).toBe('globex');
    });
  });

  // ─── updateOrg ────────────────────────────────────────────────────────

  describe('updateOrg', () => {
    it('updates an existing org in-place', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme', 'Acme Corp')]);
      store.updateOrg({ ...makeOrg('acme'), name: 'Acme Inc' });
      expect(store.orgs[0].name).toBe('Acme Inc');
    });

    it('does nothing when slug does not match any existing org', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme')]);
      store.updateOrg(makeOrg('nonexistent'));
      expect(store.orgs).toHaveLength(1);
      expect(store.orgs[0].slug).toBe('acme');
    });
  });

  // ─── removeOrg ────────────────────────────────────────────────────────

  describe('removeOrg', () => {
    it('removes the org with the matching slug', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme'), makeOrg('globex')]);
      store.removeOrg('acme');
      expect(store.orgs).toHaveLength(1);
      expect(store.orgs[0].slug).toBe('globex');
    });

    it('clears selectedOrgSlug when the selected org is removed', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme'), makeOrg('globex')]);
      store.selectOrg('acme');
      store.removeOrg('acme');
      expect(store.selectedOrgSlug).toBeNull();
    });

    it('does not affect selectedOrgSlug when a different org is removed', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme'), makeOrg('globex')]);
      store.selectOrg('acme');
      store.removeOrg('globex');
      expect(store.selectedOrgSlug).toBe('acme');
    });
  });

  // ─── selectOrg ────────────────────────────────────────────────────────

  describe('selectOrg', () => {
    it('sets the selected org slug', () => {
      const store = useOrgsStore();
      store.selectOrg('acme');
      expect(store.selectedOrgSlug).toBe('acme');
    });

    it('accepts null to deselect', () => {
      const store = useOrgsStore();
      store.selectOrg('acme');
      store.selectOrg(null);
      expect(store.selectedOrgSlug).toBeNull();
    });
  });

  // ─── selectedOrg (computed) ───────────────────────────────────────────

  describe('selectedOrg (computed)', () => {
    it('returns the org object for the selected slug', () => {
      const store = useOrgsStore();
      const acme = makeOrg('acme', 'Acme Corp');
      store.setOrgs([acme, makeOrg('globex')]);
      store.selectOrg('acme');
      expect(store.selectedOrg).toEqual(acme);
    });

    it('returns null when no org is selected', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme')]);
      expect(store.selectedOrg).toBeNull();
    });

    it('returns null when selectedOrgSlug does not match any org', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme')]);
      store.selectOrg('nonexistent');
      expect(store.selectedOrg).toBeNull();
    });
  });

  // ─── sortedOrgs (computed) ────────────────────────────────────────────

  describe('sortedOrgs (computed)', () => {
    it('returns orgs sorted alphabetically by name', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('z-org', 'Zebra'), makeOrg('a-org', 'Apple'), makeOrg('m-org', 'Mango')]);
      const names = store.sortedOrgs.map((o) => o.name);
      expect(names).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('does not mutate the original orgs array', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('z-org', 'Zebra'), makeOrg('a-org', 'Apple')]);
      // Access sortedOrgs
      store.sortedOrgs;
      // The internal orgs order should be unchanged
      expect(store.orgs[0].slug).toBe('z-org');
    });

    it('returns an empty array when there are no orgs', () => {
      const store = useOrgsStore();
      expect(store.sortedOrgs).toEqual([]);
    });
  });

  // ─── setLoading / setError ────────────────────────────────────────────

  describe('setLoading', () => {
    it('sets loading to true', () => {
      const store = useOrgsStore();
      store.setLoading(true);
      expect(store.loading).toBe(true);
    });

    it('sets loading to false', () => {
      const store = useOrgsStore();
      store.setLoading(true);
      store.setLoading(false);
      expect(store.loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('records an error string', () => {
      const store = useOrgsStore();
      store.setError('Auth API error');
      expect(store.error).toBe('Auth API error');
    });

    it('clears error with null', () => {
      const store = useOrgsStore();
      store.setError('err');
      store.setError(null);
      expect(store.error).toBeNull();
    });
  });

  // ─── reset ────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const store = useOrgsStore();
      store.setOrgs([makeOrg('acme')]);
      store.selectOrg('acme');
      store.setLoading(true);
      store.setError('err');

      store.reset();

      expect(store.orgs).toEqual([]);
      expect(store.selectedOrgSlug).toBeNull();
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });
  });
});
