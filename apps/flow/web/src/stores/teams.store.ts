/**
 * Teams Store
 *
 * State layer for teams and members. All API calls go through flow-api.service.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type { ApiTeam, ApiTeamMember } from '@/types/flow';

export const useTeamsStore = defineStore('teams', () => {
  const teams = ref<ApiTeam[]>([]);
  const currentTeam = ref<ApiTeam | null>(null);
  const members = ref<ApiTeamMember[]>([]);
  const loading = ref(false);
  const membersLoading = ref(false);

  const currentTeamId = computed(() => currentTeam.value?.id ?? null);

  async function loadTeams(orgSlug: string) {
    loading.value = true;
    try {
      teams.value = await flowApiService.getTeamsByOrg(orgSlug);
      if (teams.value.length > 0 && !currentTeam.value) {
        currentTeam.value = teams.value[0];
      }
    } finally {
      loading.value = false;
    }
  }

  async function selectTeam(teamId: string) {
    const found = teams.value.find((t) => t.id === teamId);
    if (found) {
      currentTeam.value = found;
    } else {
      const team = await flowApiService.getTeam(teamId);
      currentTeam.value = team;
    }
    await loadMembers(teamId);
  }

  async function loadMembers(teamId: string) {
    membersLoading.value = true;
    try {
      members.value = await flowApiService.getTeamMembers(teamId);
    } finally {
      membersLoading.value = false;
    }
  }

  async function createTeam(orgSlug: string, name: string, description?: string): Promise<ApiTeam> {
    const team = await flowApiService.createTeam(orgSlug, name, description);
    teams.value.push(team);
    return team;
  }

  async function updateTeam(teamId: string, updates: { name?: string; description?: string }): Promise<void> {
    const updated = await flowApiService.updateTeam(teamId, updates);
    const idx = teams.value.findIndex((t) => t.id === teamId);
    if (idx !== -1) teams.value[idx] = updated;
    if (currentTeam.value?.id === teamId) currentTeam.value = updated;
  }

  async function deleteTeam(teamId: string): Promise<void> {
    await flowApiService.deleteTeam(teamId);
    teams.value = teams.value.filter((t) => t.id !== teamId);
    if (currentTeam.value?.id === teamId) {
      currentTeam.value = teams.value[0] ?? null;
    }
  }

  async function addMember(teamId: string, userId: string, role: 'member' | 'lead' | 'admin' = 'member'): Promise<ApiTeamMember> {
    const member = await flowApiService.addTeamMember(teamId, userId, role);
    members.value.push(member);
    return member;
  }

  async function updateMember(teamId: string, userId: string, role: 'member' | 'lead' | 'admin'): Promise<void> {
    const updated = await flowApiService.updateTeamMember(teamId, userId, { role });
    const idx = members.value.findIndex((m) => m.userId === userId);
    if (idx !== -1) members.value[idx] = updated;
  }

  async function removeMember(teamId: string, userId: string): Promise<void> {
    await flowApiService.removeTeamMember(teamId, userId);
    members.value = members.value.filter((m) => m.userId !== userId);
  }

  return {
    teams,
    currentTeam,
    currentTeamId,
    members,
    loading,
    membersLoading,
    loadTeams,
    selectTeam,
    loadMembers,
    createTeam,
    updateTeam,
    deleteTeam,
    addMember,
    updateMember,
    removeMember,
  };
});
