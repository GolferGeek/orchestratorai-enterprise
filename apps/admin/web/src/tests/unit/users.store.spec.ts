/**
 * users.store.spec.ts
 *
 * Unit tests for the Admin users Pinia store.
 * No API calls — the store is state-only by design.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUsersStore } from '@/stores/users.store';
import type { AdminUser } from '@/services/auth-api.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeUser(id: string, status = 'active', displayName?: string): AdminUser {
  return {
    id,
    email: `${id}@example.com`,
    displayName,
    roles: [{ name: 'member', displayName: 'Member' }],
    status,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useUsersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty users list', () => {
      const store = useUsersStore();
      expect(store.users).toEqual([]);
    });

    it('starts with no selected user', () => {
      const store = useUsersStore();
      expect(store.selectedUserId).toBeNull();
    });

    it('starts with no currentOrgSlug', () => {
      const store = useUsersStore();
      expect(store.currentOrgSlug).toBeNull();
    });

    it('starts not loading', () => {
      const store = useUsersStore();
      expect(store.loading).toBe(false);
    });

    it('starts with no error', () => {
      const store = useUsersStore();
      expect(store.error).toBeNull();
    });
  });

  // ─── setUsers ─────────────────────────────────────────────────────────

  describe('setUsers', () => {
    it('populates the users list', () => {
      const store = useUsersStore();
      const users = [makeUser('u1'), makeUser('u2')];
      store.setUsers(users);
      expect(store.users).toEqual(users);
    });

    it('replaces an existing users list', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('old')]);
      store.setUsers([makeUser('new-1'), makeUser('new-2')]);
      expect(store.users).toHaveLength(2);
    });
  });

  // ─── addUser ──────────────────────────────────────────────────────────

  describe('addUser', () => {
    it('appends a user to the list', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1')]);
      store.addUser(makeUser('u2'));
      expect(store.users).toHaveLength(2);
      expect(store.users[1].id).toBe('u2');
    });
  });

  // ─── updateUser ───────────────────────────────────────────────────────

  describe('updateUser', () => {
    it('updates an existing user in-place', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1', 'active', 'Alice')]);
      store.updateUser({ ...makeUser('u1'), displayName: 'Alice Updated' });
      expect(store.users[0].displayName).toBe('Alice Updated');
    });

    it('does nothing when user id does not match', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1')]);
      store.updateUser(makeUser('nonexistent'));
      expect(store.users).toHaveLength(1);
      expect(store.users[0].id).toBe('u1');
    });
  });

  // ─── removeUser ───────────────────────────────────────────────────────

  describe('removeUser', () => {
    it('removes the user with the matching id', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1'), makeUser('u2')]);
      store.removeUser('u1');
      expect(store.users).toHaveLength(1);
      expect(store.users[0].id).toBe('u2');
    });

    it('clears selectedUserId when the selected user is removed', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1'), makeUser('u2')]);
      store.selectUser('u1');
      store.removeUser('u1');
      expect(store.selectedUserId).toBeNull();
    });

    it('does not affect selectedUserId when a different user is removed', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1'), makeUser('u2')]);
      store.selectUser('u1');
      store.removeUser('u2');
      expect(store.selectedUserId).toBe('u1');
    });
  });

  // ─── deactivateUser ───────────────────────────────────────────────────

  describe('deactivateUser', () => {
    it('sets the user status to deactivated', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1', 'active')]);
      store.deactivateUser('u1');
      expect(store.users[0].status).toBe('deactivated');
    });

    it('clears selectedUserId after deactivating the selected user', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1')]);
      store.selectUser('u1');
      store.deactivateUser('u1');
      expect(store.selectedUserId).toBeNull();
    });

    it('does nothing when user id does not match any user', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1', 'active')]);
      store.deactivateUser('nonexistent');
      expect(store.users[0].status).toBe('active');
    });
  });

  // ─── selectUser ───────────────────────────────────────────────────────

  describe('selectUser', () => {
    it('sets the selected user id', () => {
      const store = useUsersStore();
      store.selectUser('u1');
      expect(store.selectedUserId).toBe('u1');
    });

    it('accepts null to deselect', () => {
      const store = useUsersStore();
      store.selectUser('u1');
      store.selectUser(null);
      expect(store.selectedUserId).toBeNull();
    });
  });

  // ─── setCurrentOrg ────────────────────────────────────────────────────

  describe('setCurrentOrg', () => {
    it('sets the current org slug', () => {
      const store = useUsersStore();
      store.setCurrentOrg('acme');
      expect(store.currentOrgSlug).toBe('acme');
    });

    it('accepts null to clear the current org', () => {
      const store = useUsersStore();
      store.setCurrentOrg('acme');
      store.setCurrentOrg(null);
      expect(store.currentOrgSlug).toBeNull();
    });
  });

  // ─── selectedUser (computed) ──────────────────────────────────────────

  describe('selectedUser (computed)', () => {
    it('returns the user object matching selectedUserId', () => {
      const store = useUsersStore();
      const alice = makeUser('u1', 'active', 'Alice');
      store.setUsers([alice, makeUser('u2')]);
      store.selectUser('u1');
      expect(store.selectedUser).toEqual(alice);
    });

    it('returns null when no user is selected', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1')]);
      expect(store.selectedUser).toBeNull();
    });

    it('returns null when selectedUserId does not match any user', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1')]);
      store.selectUser('ghost');
      expect(store.selectedUser).toBeNull();
    });
  });

  // ─── activeUsers (computed) ───────────────────────────────────────────

  describe('activeUsers (computed)', () => {
    it('returns only users whose status is not deactivated', () => {
      const store = useUsersStore();
      store.setUsers([
        makeUser('u1', 'active'),
        makeUser('u2', 'deactivated'),
        makeUser('u3', 'pending'),
        makeUser('u4', 'deactivated'),
      ]);
      const active = store.activeUsers;
      expect(active).toHaveLength(2);
      expect(active.map((u) => u.id)).toEqual(['u1', 'u3']);
    });

    it('returns all users when none are deactivated', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1', 'active'), makeUser('u2', 'active')]);
      expect(store.activeUsers).toHaveLength(2);
    });

    it('returns empty array when all users are deactivated', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1', 'deactivated'), makeUser('u2', 'deactivated')]);
      expect(store.activeUsers).toHaveLength(0);
    });
  });

  // ─── sortedUsers (computed) ───────────────────────────────────────────

  describe('sortedUsers (computed)', () => {
    it('sorts users alphabetically by displayName when present', () => {
      const store = useUsersStore();
      store.setUsers([
        makeUser('u1', 'active', 'Zoe'),
        makeUser('u2', 'active', 'Alice'),
        makeUser('u3', 'active', 'Mia'),
      ]);
      const names = store.sortedUsers.map((u) => u.displayName);
      expect(names).toEqual(['Alice', 'Mia', 'Zoe']);
    });

    it('falls back to email for sorting when displayName is absent', () => {
      const store = useUsersStore();
      store.setUsers([
        { ...makeUser('u1'), email: 'zoe@example.com', displayName: undefined },
        { ...makeUser('u2'), email: 'alice@example.com', displayName: undefined },
      ]);
      const emails = store.sortedUsers.map((u) => u.email);
      expect(emails).toEqual(['alice@example.com', 'zoe@example.com']);
    });

    it('does not mutate the original users array', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('z-user', 'active', 'Zoe'), makeUser('a-user', 'active', 'Alice')]);
      store.sortedUsers;
      expect(store.users[0].id).toBe('z-user');
    });
  });

  // ─── setLoading / setError ────────────────────────────────────────────

  describe('setLoading', () => {
    it('sets loading to true', () => {
      const store = useUsersStore();
      store.setLoading(true);
      expect(store.loading).toBe(true);
    });

    it('sets loading to false', () => {
      const store = useUsersStore();
      store.setLoading(true);
      store.setLoading(false);
      expect(store.loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('records an error string', () => {
      const store = useUsersStore();
      store.setError('User load failed');
      expect(store.error).toBe('User load failed');
    });

    it('clears error with null', () => {
      const store = useUsersStore();
      store.setError('err');
      store.setError(null);
      expect(store.error).toBeNull();
    });
  });

  // ─── reset ────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const store = useUsersStore();
      store.setUsers([makeUser('u1')]);
      store.selectUser('u1');
      store.setCurrentOrg('acme');
      store.setLoading(true);
      store.setError('err');

      store.reset();

      expect(store.users).toEqual([]);
      expect(store.selectedUserId).toBeNull();
      expect(store.currentOrgSlug).toBeNull();
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });
  });
});
