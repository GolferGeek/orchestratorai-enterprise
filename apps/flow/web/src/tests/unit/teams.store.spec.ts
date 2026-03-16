/**
 * teams.store.spec.ts
 *
 * Unit tests for the Flow teams Pinia store.
 * flowApiService is fully mocked so no HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTeamsStore } from '@/stores/teams.store';
import type { ApiTeam, ApiTeamMember } from '@/types/flow';

// ─── Mock flowApiService ──────────────────────────────────────────────────────

vi.mock('@/services/flow-api.service', () => ({
  flowApiService: {
    getTeamsByOrg: vi.fn(),
    getTeam: vi.fn(),
    getTeamMembers: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    addTeamMember: vi.fn(),
    updateTeamMember: vi.fn(),
    removeTeamMember: vi.fn(),
  },
}));

import { flowApiService } from '@/services/flow-api.service';

const mockApi = flowApiService as unknown as {
  getTeamsByOrg: ReturnType<typeof vi.fn>;
  getTeam: ReturnType<typeof vi.fn>;
  getTeamMembers: ReturnType<typeof vi.fn>;
  createTeam: ReturnType<typeof vi.fn>;
  updateTeam: ReturnType<typeof vi.fn>;
  deleteTeam: ReturnType<typeof vi.fn>;
  addTeamMember: ReturnType<typeof vi.fn>;
  updateTeamMember: ReturnType<typeof vi.fn>;
  removeTeamMember: ReturnType<typeof vi.fn>;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_SLUG = 'acme';

function makeTeam(id: string, name?: string): ApiTeam {
  return {
    id,
    orgSlug: ORG_SLUG,
    name: name ?? `Team ${id}`,
    memberCount: 3,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeMember(userId: string): ApiTeamMember {
  return {
    id: `member-${userId}`,
    userId,
    email: `${userId}@example.com`,
    role: 'member',
    joinedAt: '2024-01-01T00:00:00.000Z',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTeamsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty teams list', () => {
      const store = useTeamsStore();
      expect(store.teams).toEqual([]);
    });

    it('starts with no currentTeam', () => {
      const store = useTeamsStore();
      expect(store.currentTeam).toBeNull();
    });

    it('starts with an empty members list', () => {
      const store = useTeamsStore();
      expect(store.members).toEqual([]);
    });

    it('starts not loading', () => {
      const store = useTeamsStore();
      expect(store.loading).toBe(false);
    });

    it('starts with membersLoading false', () => {
      const store = useTeamsStore();
      expect(store.membersLoading).toBe(false);
    });
  });

  // ─── currentTeamId (computed) ─────────────────────────────────────────

  describe('currentTeamId (computed)', () => {
    it('returns the id of the currentTeam', () => {
      const store = useTeamsStore();
      store.currentTeam = makeTeam('t1');
      expect(store.currentTeamId).toBe('t1');
    });

    it('returns null when currentTeam is null', () => {
      const store = useTeamsStore();
      expect(store.currentTeamId).toBeNull();
    });
  });

  // ─── loadTeams ────────────────────────────────────────────────────────

  describe('loadTeams', () => {
    it('fetches teams and stores them', async () => {
      const teams = [makeTeam('t1'), makeTeam('t2')];
      mockApi.getTeamsByOrg.mockResolvedValueOnce(teams);

      const store = useTeamsStore();
      await store.loadTeams(ORG_SLUG);

      expect(mockApi.getTeamsByOrg).toHaveBeenCalledWith(ORG_SLUG);
      expect(store.teams).toEqual(teams);
    });

    it('sets currentTeam to the first team when none is selected', async () => {
      const teams = [makeTeam('t1'), makeTeam('t2')];
      mockApi.getTeamsByOrg.mockResolvedValueOnce(teams);

      const store = useTeamsStore();
      await store.loadTeams(ORG_SLUG);

      expect(store.currentTeam?.id).toBe('t1');
    });

    it('does not override an already-selected currentTeam', async () => {
      const teams = [makeTeam('t1'), makeTeam('t2')];
      mockApi.getTeamsByOrg.mockResolvedValueOnce(teams);

      const store = useTeamsStore();
      store.currentTeam = makeTeam('t2', 'Previously selected');
      await store.loadTeams(ORG_SLUG);

      expect(store.currentTeam?.id).toBe('t2');
    });

    it('sets loading to true during fetch and false after', async () => {
      mockApi.getTeamsByOrg.mockResolvedValueOnce([]);
      const store = useTeamsStore();
      const promise = store.loadTeams(ORG_SLUG);
      expect(store.loading).toBe(true);
      await promise;
      expect(store.loading).toBe(false);
    });

    it('sets loading to false even when the API throws', async () => {
      mockApi.getTeamsByOrg.mockRejectedValueOnce(new Error('Net error'));
      const store = useTeamsStore();
      await expect(store.loadTeams(ORG_SLUG)).rejects.toThrow('Net error');
      expect(store.loading).toBe(false);
    });
  });

  // ─── selectTeam ───────────────────────────────────────────────────────

  describe('selectTeam', () => {
    it('selects a team from the local list without an API call for the team itself', async () => {
      const team = makeTeam('t1');
      mockApi.getTeamMembers.mockResolvedValueOnce([]);

      const store = useTeamsStore();
      store.teams.push(team);
      await store.selectTeam('t1');

      expect(mockApi.getTeam).not.toHaveBeenCalled();
      expect(store.currentTeam).toEqual(team);
    });

    it('fetches the team from API when it is not in the local list', async () => {
      const team = makeTeam('t-remote');
      mockApi.getTeam.mockResolvedValueOnce(team);
      mockApi.getTeamMembers.mockResolvedValueOnce([]);

      const store = useTeamsStore();
      await store.selectTeam('t-remote');

      expect(mockApi.getTeam).toHaveBeenCalledWith('t-remote');
      expect(store.currentTeam).toEqual(team);
    });

    it('loads members for the selected team', async () => {
      const members = [makeMember('u1'), makeMember('u2')];
      const team = makeTeam('t1');
      mockApi.getTeamMembers.mockResolvedValueOnce(members);

      const store = useTeamsStore();
      store.teams.push(team);
      await store.selectTeam('t1');

      expect(mockApi.getTeamMembers).toHaveBeenCalledWith('t1');
      expect(store.members).toEqual(members);
    });
  });

  // ─── loadMembers ──────────────────────────────────────────────────────

  describe('loadMembers', () => {
    it('fetches and stores team members', async () => {
      const members = [makeMember('u1')];
      mockApi.getTeamMembers.mockResolvedValueOnce(members);

      const store = useTeamsStore();
      await store.loadMembers('t1');

      expect(store.members).toEqual(members);
    });

    it('sets membersLoading to false after fetch', async () => {
      mockApi.getTeamMembers.mockResolvedValueOnce([]);
      const store = useTeamsStore();
      const promise = store.loadMembers('t1');
      expect(store.membersLoading).toBe(true);
      await promise;
      expect(store.membersLoading).toBe(false);
    });

    it('sets membersLoading to false even when the API throws', async () => {
      mockApi.getTeamMembers.mockRejectedValueOnce(new Error('Failed'));
      const store = useTeamsStore();
      await expect(store.loadMembers('t1')).rejects.toThrow('Failed');
      expect(store.membersLoading).toBe(false);
    });
  });

  // ─── createTeam ───────────────────────────────────────────────────────

  describe('createTeam', () => {
    it('calls the API and appends the new team to the list', async () => {
      const newTeam = makeTeam('new-team', 'New Team');
      mockApi.createTeam.mockResolvedValueOnce(newTeam);

      const store = useTeamsStore();
      const result = await store.createTeam(ORG_SLUG, 'New Team');

      expect(mockApi.createTeam).toHaveBeenCalledWith(ORG_SLUG, 'New Team', undefined);
      expect(store.teams).toContainEqual(newTeam);
      expect(result).toEqual(newTeam);
    });
  });

  // ─── updateTeam ───────────────────────────────────────────────────────

  describe('updateTeam', () => {
    it('calls the API and updates the team in the local list', async () => {
      const original = makeTeam('t1', 'Original');
      const updated = { ...original, name: 'Updated' };
      mockApi.updateTeam.mockResolvedValueOnce(updated);

      const store = useTeamsStore();
      store.teams.push(original);
      await store.updateTeam('t1', { name: 'Updated' });

      expect(store.teams[0].name).toBe('Updated');
    });

    it('updates currentTeam when it matches the updated team', async () => {
      const team = makeTeam('t1', 'Original');
      const updated = { ...team, name: 'Updated' };
      mockApi.updateTeam.mockResolvedValueOnce(updated);

      const store = useTeamsStore();
      store.teams.push(team);
      store.currentTeam = team;
      await store.updateTeam('t1', { name: 'Updated' });

      expect(store.currentTeam?.name).toBe('Updated');
    });
  });

  // ─── deleteTeam ───────────────────────────────────────────────────────

  describe('deleteTeam', () => {
    it('calls the API and removes the team from the local list', async () => {
      mockApi.deleteTeam.mockResolvedValueOnce(undefined);

      const store = useTeamsStore();
      store.teams.push(makeTeam('t1'), makeTeam('t2'));
      await store.deleteTeam('t1');

      expect(store.teams).toHaveLength(1);
      expect(store.teams[0].id).toBe('t2');
    });

    it('sets currentTeam to the first remaining team when currentTeam is deleted', async () => {
      mockApi.deleteTeam.mockResolvedValueOnce(undefined);

      const store = useTeamsStore();
      store.teams.push(makeTeam('t1'), makeTeam('t2'));
      store.currentTeam = makeTeam('t1');
      await store.deleteTeam('t1');

      expect(store.currentTeam?.id).toBe('t2');
    });

    it('sets currentTeam to null when the last team is deleted', async () => {
      mockApi.deleteTeam.mockResolvedValueOnce(undefined);

      const store = useTeamsStore();
      store.teams.push(makeTeam('t1'));
      store.currentTeam = makeTeam('t1');
      await store.deleteTeam('t1');

      expect(store.currentTeam).toBeNull();
    });
  });

  // ─── addMember ───────────────────────────────────────────────────────

  describe('addMember', () => {
    it('calls the API and appends the member to the local list', async () => {
      const newMember = makeMember('u3');
      mockApi.addTeamMember.mockResolvedValueOnce(newMember);

      const store = useTeamsStore();
      store.members.push(makeMember('u1'));
      const result = await store.addMember('t1', 'u3', 'member');

      expect(mockApi.addTeamMember).toHaveBeenCalledWith('t1', 'u3', 'member');
      expect(store.members).toHaveLength(2);
      expect(result.userId).toBe('u3');
    });
  });

  // ─── updateMember ──────────────────────────────────────────────────────

  describe('updateMember', () => {
    it('calls the API and updates the member role in the local list', async () => {
      const updated = { ...makeMember('u1'), role: 'lead' as const };
      mockApi.updateTeamMember.mockResolvedValueOnce(updated);

      const store = useTeamsStore();
      store.members.push(makeMember('u1'));
      await store.updateMember('t1', 'u1', 'lead');

      expect(mockApi.updateTeamMember).toHaveBeenCalledWith('t1', 'u1', { role: 'lead' });
      expect(store.members[0].role).toBe('lead');
    });
  });

  // ─── removeMember ─────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('calls the API and removes the member from the local list', async () => {
      mockApi.removeTeamMember.mockResolvedValueOnce(undefined);

      const store = useTeamsStore();
      store.members.push(makeMember('u1'), makeMember('u2'));
      await store.removeMember('t1', 'u1');

      expect(mockApi.removeTeamMember).toHaveBeenCalledWith('t1', 'u1');
      expect(store.members).toHaveLength(1);
      expect(store.members[0].userId).toBe('u2');
    });
  });
});
