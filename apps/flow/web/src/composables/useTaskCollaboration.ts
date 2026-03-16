/**
 * useTaskCollaboration
 *
 * Loads and manages collaborators, watchers, and update requests for a task.
 * Polls every 10 seconds. Supports both authenticated users and guests.
 */
import { ref, watch, onUnmounted, computed } from 'vue';
import type { Ref } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import { useAuthStore } from '@/stores/auth.store';
import type {
  TaskCollaboratorResponse,
  TaskWatcherResponse,
  TaskUpdateRequestResponse,
  CreateTaskCollaboratorDto,
  CreateTaskWatcherDto,
  CreateTaskUpdateRequestDto,
} from '@/types/flow';

export interface Collaborator {
  id: string;
  task_id: string;
  user_id: string | null;
  guest_name: string | null;
  joined_at: string;
}

export interface Watcher {
  id: string;
  task_id: string;
  user_id: string | null;
  guest_name: string | null;
  created_at: string;
}

export interface UpdateRequest {
  id: string;
  task_id: string;
  requested_by_user_id: string | null;
  requested_by_guest: string | null;
  message: string | null;
  created_at: string;
  is_resolved: boolean;
}

function mapCollaborator(api: TaskCollaboratorResponse): Collaborator {
  return {
    id: api.id,
    task_id: api.taskId,
    user_id: api.userId,
    guest_name: api.guestName,
    joined_at: api.joinedAt,
  };
}

function mapWatcher(api: TaskWatcherResponse): Watcher {
  return {
    id: api.id,
    task_id: api.taskId,
    user_id: api.userId,
    guest_name: api.guestName,
    created_at: api.createdAt,
  };
}

function mapUpdateRequest(api: TaskUpdateRequestResponse): UpdateRequest {
  return {
    id: api.id,
    task_id: api.taskId,
    requested_by_user_id: api.requestedByUserId,
    requested_by_guest: api.requestedByGuest,
    message: api.message,
    created_at: api.createdAt,
    is_resolved: api.isResolved,
  };
}

const POLL_INTERVAL_MS = 10_000;

export function useTaskCollaboration(teamId: Ref<string | null>, taskId: Ref<string | null>) {
  const authStore = useAuthStore();

  const collaborators = ref<Collaborator[]>([]);
  const watchers = ref<Watcher[]>([]);
  const updateRequests = ref<UpdateRequest[]>([]);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function fetchAll() {
    const tid = teamId.value;
    const tskId = taskId.value;
    if (!tid || !tskId) {
      collaborators.value = [];
      watchers.value = [];
      updateRequests.value = [];
      return;
    }
    const [collabData, watchData, requestData] = await Promise.all([
      flowApiService.getTaskCollaborators(tid, tskId),
      flowApiService.getTaskWatchers(tid, tskId),
      flowApiService.getTaskUpdateRequests(tid, tskId),
    ]);
    collaborators.value = collabData.map(mapCollaborator);
    watchers.value = watchData.map(mapWatcher);
    updateRequests.value = requestData.map(mapUpdateRequest);
  }

  function startPolling() {
    stopPolling();
    if (!teamId.value || !taskId.value) return;
    fetchAll();
    pollTimer = setInterval(fetchAll, POLL_INTERVAL_MS);
  }

  watch([teamId, taskId], () => startPolling(), { immediate: true });

  onUnmounted(() => stopPolling());

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function addCollaborator(taskIdParam: string, userId?: string, guestName?: string) {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot add collaborator: teamId is required');
      return;
    }
    const dto: CreateTaskCollaboratorDto = {
      userId: userId ?? null,
      guestName: guestName ?? null,
    };
    await flowApiService.createTaskCollaborator(tid, taskIdParam, dto);
    const data = await flowApiService.getTaskCollaborators(tid, taskIdParam);
    collaborators.value = data.map(mapCollaborator);
  }

  async function removeCollaborator(collaboratorId: string) {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot remove collaborator: teamId is required');
      return;
    }
    await flowApiService.deleteTaskCollaborator(tid, collaboratorId);
    const tskId = taskId.value;
    if (tskId) {
      const data = await flowApiService.getTaskCollaborators(tid, tskId);
      collaborators.value = data.map(mapCollaborator);
    }
  }

  async function addWatcher(taskIdParam: string, userId?: string, guestName?: string) {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot add watcher: teamId is required');
      return;
    }
    const dto: CreateTaskWatcherDto = {
      userId: userId ?? null,
      guestName: guestName ?? null,
    };
    await flowApiService.createTaskWatcher(tid, taskIdParam, dto);
    const data = await flowApiService.getTaskWatchers(tid, taskIdParam);
    watchers.value = data.map(mapWatcher);
  }

  async function removeWatcher(watcherId: string) {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot remove watcher: teamId is required');
      return;
    }
    await flowApiService.deleteTaskWatcher(tid, watcherId);
    const tskId = taskId.value;
    if (tskId) {
      const data = await flowApiService.getTaskWatchers(tid, tskId);
      watchers.value = data.map(mapWatcher);
    }
  }

  async function toggleWatching(taskIdParam: string, guestName?: string) {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot toggle watching: teamId is required');
      return;
    }
    const userId = authStore.user?.id ?? null;
    const currentWatchers = await flowApiService.getTaskWatchers(tid, taskIdParam);
    const existing = currentWatchers.find((w) =>
      (userId && w.userId === userId) || (!userId && guestName && w.guestName === guestName)
    );
    if (existing) {
      await flowApiService.deleteTaskWatcher(tid, existing.id);
    } else {
      const dto: CreateTaskWatcherDto = {
        userId: userId,
        guestName: !userId ? (guestName ?? null) : null,
      };
      await flowApiService.createTaskWatcher(tid, taskIdParam, dto);
    }
    const data = await flowApiService.getTaskWatchers(tid, taskIdParam);
    watchers.value = data.map(mapWatcher);
  }

  function isWatching(guestName?: string): boolean {
    const userId = authStore.user?.id ?? null;
    return watchers.value.some((w) =>
      (userId && w.user_id === userId) || (!userId && guestName && w.guest_name === guestName)
    );
  }

  async function createUpdateRequest(taskIdParam: string, message?: string, guestName?: string) {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot create update request: teamId is required');
      return;
    }
    const userId = authStore.user?.id ?? null;
    const dto: CreateTaskUpdateRequestDto = {
      requestedByUserId: userId,
      requestedByGuest: !userId ? (guestName ?? null) : null,
      message: message ?? null,
    };
    await flowApiService.createTaskUpdateRequest(tid, taskIdParam, dto);
    const data = await flowApiService.getTaskUpdateRequests(tid, taskIdParam);
    updateRequests.value = data.map(mapUpdateRequest);
  }

  async function resolveUpdateRequest(requestId: string) {
    const tid = teamId.value;
    const tskId = taskId.value;
    if (!tid || !tskId) {
      console.error('Cannot resolve request: teamId and taskId are required');
      return;
    }
    await flowApiService.updateTaskUpdateRequest(tid, requestId, { isResolved: true });
    const data = await flowApiService.getTaskUpdateRequests(tid, tskId);
    updateRequests.value = data.map(mapUpdateRequest);
  }

  async function joinTask(taskIdParam: string, guestName?: string) {
    const userId = authStore.user?.id;
    await addCollaborator(taskIdParam, userId, !userId ? guestName : undefined);
  }

  async function leaveTask(taskIdParam: string, guestName?: string) {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot leave task: teamId is required');
      return;
    }
    const userId = authStore.user?.id ?? null;
    const current = await flowApiService.getTaskCollaborators(tid, taskIdParam);
    const mine = current.find((c) =>
      (userId && c.userId === userId) || (!userId && guestName && c.guestName === guestName)
    );
    if (mine) {
      await removeCollaborator(mine.id);
    }
  }

  function isCollaborator(guestName?: string): boolean {
    const userId = authStore.user?.id ?? null;
    return collaborators.value.some((c) =>
      (userId && c.user_id === userId) || (!userId && guestName && c.guest_name === guestName)
    );
  }

  return {
    collaborators,
    watchers,
    updateRequests,
    addCollaborator,
    removeCollaborator,
    addWatcher,
    removeWatcher,
    toggleWatching,
    isWatching,
    createUpdateRequest,
    resolveUpdateRequest,
    joinTask,
    leaveTask,
    isCollaborator,
  };
}
