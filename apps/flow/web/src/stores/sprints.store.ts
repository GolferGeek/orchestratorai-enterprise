/**
 * Sprints Store
 *
 * State layer for sprint management.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type { SprintResponse } from '@/types/flow';

export const useSprintsStore = defineStore('sprints', () => {
  const sprints = ref<SprintResponse[]>([]);
  const loading = ref(false);

  const activeSprint = computed(() => sprints.value.find((s) => s.isActive) ?? null);

  async function loadSprints(teamId: string) {
    loading.value = true;
    try {
      sprints.value = await flowApiService.getSprints(teamId);
    } finally {
      loading.value = false;
    }
  }

  async function createSprint(teamId: string, name: string, opts?: {
    description?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
  }): Promise<SprintResponse> {
    const sprint = await flowApiService.createSprint(teamId, { name, ...opts });
    sprints.value.push(sprint);
    return sprint;
  }

  async function updateSprint(teamId: string, sprintId: string, updates: Partial<SprintResponse>): Promise<void> {
    const updated = await flowApiService.updateSprint(teamId, sprintId, updates);
    const idx = sprints.value.findIndex((s) => s.id === sprintId);
    if (idx !== -1) sprints.value[idx] = updated;
  }

  async function setActiveSprint(teamId: string, sprintId: string): Promise<void> {
    // Deactivate all sprints first, then activate the target
    for (const sprint of sprints.value) {
      if (sprint.isActive && sprint.id !== sprintId) {
        await updateSprint(teamId, sprint.id, { isActive: false });
      }
    }
    await updateSprint(teamId, sprintId, { isActive: true });
  }

  async function deleteSprint(teamId: string, sprintId: string): Promise<void> {
    await flowApiService.deleteSprint(teamId, sprintId);
    sprints.value = sprints.value.filter((s) => s.id !== sprintId);
  }

  return {
    sprints,
    loading,
    activeSprint,
    loadSprints,
    createSprint,
    updateSprint,
    setActiveSprint,
    deleteSprint,
  };
});
