/**
 * agents.store.spec.ts
 *
 * Unit tests for the Compose agents Pinia store.
 * The store is state-only — all mutations are synchronous.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAgentsStore } from '@/stores/agents.store';
import type { ComposeAgent, ComposeRunner } from '@/services/compose-api.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAgent(slug: string): ComposeAgent {
  return {
    id: `agent-${slug}`,
    slug,
    name: slug,
    displayName: `${slug} Agent`,
    agentType: 'compose',
    organizationSlug: 'acme',
  };
}

function makeRunner(id: string, type: ComposeRunner['type'] = 'context'): ComposeRunner {
  return {
    id,
    name: `Runner ${id}`,
    type,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useAgentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty agents list', () => {
      const store = useAgentsStore();
      expect(store.agents).toEqual([]);
    });

    it('starts with an empty runners list', () => {
      const store = useAgentsStore();
      expect(store.runners).toEqual([]);
    });

    it('starts not loading', () => {
      const store = useAgentsStore();
      expect(store.isLoading).toBe(false);
    });

    it('starts with no error', () => {
      const store = useAgentsStore();
      expect(store.error).toBeNull();
    });

    it('starts with no lastLoadedOrgSlug', () => {
      const store = useAgentsStore();
      expect(store.lastLoadedOrgSlug).toBeNull();
    });
  });

  // ─── setAgents ────────────────────────────────────────────────────────

  describe('setAgents', () => {
    it('populates the agents list', () => {
      const store = useAgentsStore();
      const agents = [makeAgent('alpha'), makeAgent('beta')];
      store.setAgents(agents);
      expect(store.agents).toEqual(agents);
    });

    it('replaces an existing agents list', () => {
      const store = useAgentsStore();
      store.setAgents([makeAgent('old')]);
      store.setAgents([makeAgent('new-1'), makeAgent('new-2')]);
      expect(store.agents).toHaveLength(2);
      expect(store.agents[0].slug).toBe('new-1');
    });

    it('accepts an empty array (clear agents)', () => {
      const store = useAgentsStore();
      store.setAgents([makeAgent('alpha')]);
      store.setAgents([]);
      expect(store.agents).toEqual([]);
    });
  });

  // ─── setRunners ───────────────────────────────────────────────────────

  describe('setRunners', () => {
    it('populates the runners list', () => {
      const store = useAgentsStore();
      const runners = [makeRunner('r1'), makeRunner('r2', 'rag')];
      store.setRunners(runners);
      expect(store.runners).toEqual(runners);
    });

    it('replaces the existing runners list', () => {
      const store = useAgentsStore();
      store.setRunners([makeRunner('old')]);
      store.setRunners([makeRunner('new')]);
      expect(store.runners).toHaveLength(1);
      expect(store.runners[0].id).toBe('new');
    });
  });

  // ─── setLoading ───────────────────────────────────────────────────────

  describe('setLoading', () => {
    it('sets isLoading to true', () => {
      const store = useAgentsStore();
      store.setLoading(true);
      expect(store.isLoading).toBe(true);
    });

    it('sets isLoading to false', () => {
      const store = useAgentsStore();
      store.setLoading(true);
      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });
  });

  // ─── setError / clearError ────────────────────────────────────────────

  describe('setError', () => {
    it('records an error string', () => {
      const store = useAgentsStore();
      store.setError('Failed to load agents');
      expect(store.error).toBe('Failed to load agents');
    });

    it('accepts null to clear the error', () => {
      const store = useAgentsStore();
      store.setError('err');
      store.setError(null);
      expect(store.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('resets error to null', () => {
      const store = useAgentsStore();
      store.setError('err');
      store.clearError();
      expect(store.error).toBeNull();
    });
  });

  // ─── setLastLoadedOrgSlug ─────────────────────────────────────────────

  describe('setLastLoadedOrgSlug', () => {
    it('stores the org slug', () => {
      const store = useAgentsStore();
      store.setLastLoadedOrgSlug('acme');
      expect(store.lastLoadedOrgSlug).toBe('acme');
    });

    it('accepts null', () => {
      const store = useAgentsStore();
      store.setLastLoadedOrgSlug('acme');
      store.setLastLoadedOrgSlug(null);
      expect(store.lastLoadedOrgSlug).toBeNull();
    });
  });

  // ─── reset ────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all state back to initial values', () => {
      const store = useAgentsStore();
      store.setAgents([makeAgent('alpha')]);
      store.setRunners([makeRunner('r1')]);
      store.setLoading(true);
      store.setError('err');
      store.setLastLoadedOrgSlug('acme');

      store.reset();

      expect(store.agents).toEqual([]);
      expect(store.runners).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.lastLoadedOrgSlug).toBeNull();
    });
  });

  // ─── hasAgents (computed) ─────────────────────────────────────────────

  describe('hasAgents (computed)', () => {
    it('is false when agents list is empty', () => {
      const store = useAgentsStore();
      expect(store.hasAgents).toBe(false);
    });

    it('is true when agents list has items', () => {
      const store = useAgentsStore();
      store.setAgents([makeAgent('alpha')]);
      expect(store.hasAgents).toBe(true);
    });
  });

  // ─── agentBySlug (getter function) ───────────────────────────────────

  describe('agentBySlug', () => {
    it('returns the agent matching the slug', () => {
      const store = useAgentsStore();
      const agent = makeAgent('my-agent');
      store.setAgents([makeAgent('other'), agent]);
      expect(store.agentBySlug('my-agent')).toEqual(agent);
    });

    it('returns undefined for an unknown slug', () => {
      const store = useAgentsStore();
      store.setAgents([makeAgent('alpha')]);
      expect(store.agentBySlug('nonexistent')).toBeUndefined();
    });
  });

  // ─── runnerById (getter function) ─────────────────────────────────────

  describe('runnerById', () => {
    it('returns the runner matching the id', () => {
      const store = useAgentsStore();
      const runner = makeRunner('r99', 'rag');
      store.setRunners([makeRunner('r1'), runner]);
      expect(store.runnerById('r99')).toEqual(runner);
    });

    it('returns undefined for an unknown id', () => {
      const store = useAgentsStore();
      store.setRunners([makeRunner('r1')]);
      expect(store.runnerById('r-unknown')).toBeUndefined();
    });
  });

  // ─── runnersByType (getter function) ──────────────────────────────────

  describe('runnersByType', () => {
    it('returns only runners of the specified type', () => {
      const store = useAgentsStore();
      store.setRunners([
        makeRunner('r1', 'context'),
        makeRunner('r2', 'rag'),
        makeRunner('r3', 'rag'),
        makeRunner('r4', 'api'),
      ]);

      const ragRunners = store.runnersByType('rag');
      expect(ragRunners).toHaveLength(2);
      expect(ragRunners.every((r) => r.type === 'rag')).toBe(true);
    });

    it('returns an empty array when no runners match the type', () => {
      const store = useAgentsStore();
      store.setRunners([makeRunner('r1', 'context')]);
      expect(store.runnersByType('media')).toEqual([]);
    });
  });
});
