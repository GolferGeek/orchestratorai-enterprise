/**
 * useHierarchy Composable
 *
 * Manages the effort/project/task hierarchy. Loads efforts, then for each
 * effort loads its projects, and for each project loads its tasks.
 * Delegates all mutations to the tasks store.
 */
import { computed, onMounted, watch, type Ref } from 'vue';
import { useTasksStore } from '@/stores/tasks.store';
import type { EffortResponse, ProjectResponse } from '@/types/flow';

export function useHierarchy(teamId: Ref<string | null>) {
  const store = useTasksStore();

  async function loadAll(id: string) {
    await store.loadEfforts(id);
    const effortIds = store.efforts.map((e) => e.id);
    for (const effortId of effortIds) {
      await store.loadProjects(id, effortId);
    }
    const projectIds = store.projects.map((p) => p.id);
    for (const projectId of projectIds) {
      await store.loadHierarchyTasks(id, projectId);
    }
  }

  onMounted(async () => {
    if (teamId.value) {
      await loadAll(teamId.value);
    }
  });

  watch(teamId, async (newId) => {
    if (newId) {
      await loadAll(newId);
    }
  });

  // ============================================================================
  // Effort mutations
  // ============================================================================

  async function addEffort(name: string, description?: string): Promise<EffortResponse | undefined> {
    if (!teamId.value) return;
    return store.createEffort(teamId.value, name, description);
  }

  async function updateEffort(effortId: string, updates: Partial<EffortResponse>): Promise<void> {
    if (!teamId.value) return;
    await store.updateEffort(teamId.value, effortId, updates);
  }

  async function deleteEffort(effortId: string): Promise<void> {
    if (!teamId.value) return;
    await store.deleteEffort(teamId.value, effortId);
  }

  // ============================================================================
  // Project mutations
  // ============================================================================

  async function addProject(
    effortId: string,
    name: string,
    description?: string,
  ): Promise<ProjectResponse | undefined> {
    if (!teamId.value) return;
    return store.createProject(teamId.value, effortId, name, description);
  }

  async function updateProject(
    projectId: string,
    updates: Partial<ProjectResponse>,
  ): Promise<void> {
    if (!teamId.value) return;
    await store.updateProject(teamId.value, projectId, updates);
  }

  async function deleteProject(projectId: string): Promise<void> {
    if (!teamId.value) return;
    await store.deleteProject(teamId.value, projectId);
  }

  // ============================================================================
  // Task mutations
  // ============================================================================

  async function addTask(
    projectId: string,
    title: string,
    description?: string,
  ) {
    if (!teamId.value) return;
    return store.createHierarchyTask(teamId.value, projectId, title, description);
  }

  return {
    // State
    efforts: computed(() => store.efforts),
    projects: computed(() => store.projects),
    hierarchyTasks: computed(() => store.hierarchyTasks),
    loading: computed(() => store.loadingHierarchy),

    // Load
    loadAll,

    // Effort mutations
    addEffort,
    updateEffort,
    deleteEffort,

    // Project mutations
    addProject,
    updateProject,
    deleteProject,

    // Task mutations
    addTask,
  };
}
