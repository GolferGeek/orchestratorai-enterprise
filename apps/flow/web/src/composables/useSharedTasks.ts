/**
 * useSharedTasks Composable
 *
 * Wraps the tasks store with polling and filtering for shared tasks (Kanban board).
 * Polls every 5 seconds and delegates all mutations to the store.
 */
import { computed, onMounted, onUnmounted, watch, type Ref } from 'vue';
import { useTasksStore } from '@/stores/tasks.store';
import type { SharedTaskStatus } from '@/types/flow';

interface UseSharedTasksOptions {
  teamId: Ref<string | null>;
  filterUserId?: Ref<string | null>;
  includeCollaborated?: Ref<boolean>;
  filterProjectId?: Ref<string | null>;
}

const POLL_INTERVAL_MS = 5000;

export function useSharedTasks(options: UseSharedTasksOptions) {
  const { teamId, filterUserId, includeCollaborated, filterProjectId } = options;
  const store = useTasksStore();

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function buildLoadOpts() {
    return {
      userId: filterUserId?.value ?? undefined,
      includeCollaborated: includeCollaborated?.value ?? undefined,
      projectId: filterProjectId?.value ?? undefined,
    };
  }

  async function load() {
    if (!teamId.value) return;
    await store.loadSharedTasks(teamId.value, buildLoadOpts());
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      load();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onMounted(async () => {
    if (teamId.value) {
      await load();
      startPolling();
    }
  });

  onUnmounted(() => {
    stopPolling();
  });

  watch(teamId, async (newId) => {
    stopPolling();
    if (newId) {
      await load();
      startPolling();
    }
  });

  // Computed properties — re-expose from store with local filter awareness
  const rootTasks = computed(() => store.rootTasks);

  const tasksByStatus = computed(() => store.tasksByStatus);

  const sharedPoolTasks = computed(() =>
    store.sharedTasks.filter((t) => t.userId === null),
  );

  // ============================================================================
  // Action delegates
  // ============================================================================

  async function addTask(
    title: string,
    status: SharedTaskStatus = 'today',
    opts?: {
      userId?: string;
      assignedTo?: string;
      projectId?: string;
      sprintId?: string;
      parentTaskId?: string;
    },
  ) {
    if (!teamId.value) return;
    await store.createSharedTask(teamId.value, title, status, opts);
  }

  async function updateTaskStatus(taskId: string, status: SharedTaskStatus) {
    if (!teamId.value) return;
    await store.updateTaskStatus(teamId.value, taskId, status);
  }

  async function toggleTask(taskId: string, isCompleted: boolean) {
    if (!teamId.value) return;
    await store.toggleTask(teamId.value, taskId, isCompleted);
  }

  async function deleteTask(taskId: string) {
    if (!teamId.value) return;
    await store.deleteSharedTask(teamId.value, taskId);
  }

  async function assignTask(taskId: string, userId: string, assignedTo: string) {
    if (!teamId.value) return;
    await store.updateSharedTask(teamId.value, taskId, { userId, assignedTo });
  }

  async function incrementPomodoro(taskId: string) {
    if (!teamId.value) return;
    await store.incrementPomodoro(teamId.value, taskId);
  }

  async function updateTaskSprint(taskId: string, sprintId: string | null) {
    if (!teamId.value) return;
    await store.updateSharedTask(teamId.value, taskId, { sprintId });
  }

  async function updateTaskDueDate(taskId: string, dueDate: string | null) {
    if (!teamId.value) return;
    await store.updateSharedTask(teamId.value, taskId, {
      dueDate: dueDate ?? undefined,
    });
  }

  return {
    // State
    sharedTasks: computed(() => store.sharedTasks),
    loading: computed(() => store.loadingShared),

    // Computed
    rootTasks,
    tasksByStatus,
    sharedPoolTasks,

    // Actions
    addTask,
    updateTaskStatus,
    toggleTask,
    deleteTask,
    assignTask,
    incrementPomodoro,
    updateTaskSprint,
    updateTaskDueDate,
    reload: load,
  };
}
