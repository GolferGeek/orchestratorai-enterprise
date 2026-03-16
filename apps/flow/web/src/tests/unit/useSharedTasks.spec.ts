/**
 * useSharedTasks.spec.ts
 *
 * Unit tests for the useSharedTasks composable.
 * The tasks store is fully mocked so no HTTP calls are made.
 * vi.useFakeTimers() is used to control the 5-second polling interval.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useSharedTasks } from '@/composables/useSharedTasks';
import type { SharedTaskResponseDto, SharedTaskStatus } from '@/types/flow';

// ─── Mock tasks store ─────────────────────────────────────────────────────────

vi.mock('@/stores/tasks.store', () => ({
  useTasksStore: vi.fn(),
}));

import { useTasksStore } from '@/stores/tasks.store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withSetup(composable: () => any) {
  let result: any;
  const Comp = defineComponent({
    setup() {
      result = composable();
      return () => null;
    },
  });
  const wrapper = mount(Comp);
  return { result, wrapper };
}

function makeTask(
  id: string,
  userId: string | null = 'user-001',
  status: SharedTaskStatus = 'today',
): SharedTaskResponseDto {
  return {
    id,
    title: `Task ${id}`,
    isCompleted: false,
    assignedTo: null,
    userId,
    status,
    createdAt: '2024-01-01T00:00:00.000Z',
    parentTaskId: null,
    pomodoroCount: 0,
    projectId: null,
    sprintId: null,
    dueDate: null,
    teamId: 'team-001',
  };
}

// ─── Mock store factory ───────────────────────────────────────────────────────

function makeMockStore(sharedTasks: SharedTaskResponseDto[] = []) {
  return {
    sharedTasks,
    loadingShared: false,
    rootTasks: sharedTasks.filter((t) => t.parentTaskId === null),
    tasksByStatus: {} as Record<string, SharedTaskResponseDto[]>,
    loadSharedTasks: vi.fn().mockResolvedValue(undefined),
    createSharedTask: vi.fn().mockResolvedValue(makeTask('new-task')),
    updateSharedTask: vi.fn().mockResolvedValue(undefined),
    updateTaskStatus: vi.fn().mockResolvedValue(undefined),
    toggleTask: vi.fn().mockResolvedValue(undefined),
    deleteSharedTask: vi.fn().mockResolvedValue(undefined),
    incrementPomodoro: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSharedTasks', () => {
  let mockStore: ReturnType<typeof makeMockStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    mockStore = makeMockStore();
    (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ─── Polling — starts on mount ─────────────────────────────────────────

  describe('polling', () => {
    it('loads data on mount when teamId is set', async () => {
      const teamId = ref('team-001');
      const { wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadSharedTasks).toHaveBeenCalledWith('team-001', {
        userId: undefined,
        includeCollaborated: undefined,
        projectId: undefined,
      });
    });

    it('does not load on mount when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadSharedTasks).not.toHaveBeenCalled();
    });

    it('polls every 5 seconds after mount', async () => {
      const teamId = ref('team-001');
      const { wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      // Initial load called once on mount
      const callsAfterMount = mockStore.loadSharedTasks.mock.calls.length;

      // advanceTimersByTimeAsync advances timers by the given ms and awaits async callbacks
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockStore.loadSharedTasks.mock.calls.length).toBe(callsAfterMount + 1);

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockStore.loadSharedTasks.mock.calls.length).toBe(callsAfterMount + 2);
    });

    it('stops polling on unmount', async () => {
      const teamId = ref('team-001');
      const { wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const callsBeforeUnmount = mockStore.loadSharedTasks.mock.calls.length;

      wrapper.unmount();

      vi.advanceTimersByTime(15000);
      await Promise.resolve();

      // No additional calls after unmount
      expect(mockStore.loadSharedTasks.mock.calls.length).toBe(callsBeforeUnmount);
    });

    it('reloads and restarts polling when teamId changes', async () => {
      const teamId = ref<string | null>('team-001');
      const { wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const callsAfterFirstMount = mockStore.loadSharedTasks.mock.calls.length;

      // Change teamId
      teamId.value = 'team-002';
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadSharedTasks.mock.calls.length).toBeGreaterThan(callsAfterFirstMount);
      const lastCall = mockStore.loadSharedTasks.mock.calls[mockStore.loadSharedTasks.mock.calls.length - 1];
      expect(lastCall[0]).toBe('team-002');
    });

    it('stops polling when teamId changes to null', async () => {
      const teamId = ref<string | null>('team-001');
      const { wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const callsBeforeChange = mockStore.loadSharedTasks.mock.calls.length;

      teamId.value = null;
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      vi.advanceTimersByTime(15000);
      await Promise.resolve();

      expect(mockStore.loadSharedTasks.mock.calls.length).toBe(callsBeforeChange);
    });
  });

  // ─── Action delegates ──────────────────────────────────────────────────

  describe('addTask', () => {
    it('delegates to store.createSharedTask with teamId, title, and status', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.addTask('My task', 'in_progress');

      expect(mockStore.createSharedTask).toHaveBeenCalledWith(
        'team-001',
        'My task',
        'in_progress',
        undefined,
      );
    });

    it('defaults status to today when not specified', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.addTask('My task');

      expect(mockStore.createSharedTask).toHaveBeenCalledWith(
        'team-001',
        'My task',
        'today',
        undefined,
      );
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.addTask('My task');

      expect(mockStore.createSharedTask).not.toHaveBeenCalled();
    });
  });

  describe('updateTaskStatus', () => {
    it('delegates to store.updateTaskStatus with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.updateTaskStatus('task-1', 'done');

      expect(mockStore.updateTaskStatus).toHaveBeenCalledWith('team-001', 'task-1', 'done');
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.updateTaskStatus('task-1', 'done');

      expect(mockStore.updateTaskStatus).not.toHaveBeenCalled();
    });
  });

  describe('toggleTask', () => {
    it('delegates to store.toggleTask with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.toggleTask('task-1', false);

      expect(mockStore.toggleTask).toHaveBeenCalledWith('team-001', 'task-1', false);
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.toggleTask('task-1', false);

      expect(mockStore.toggleTask).not.toHaveBeenCalled();
    });
  });

  describe('deleteTask', () => {
    it('delegates to store.deleteSharedTask with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.deleteTask('task-1');

      expect(mockStore.deleteSharedTask).toHaveBeenCalledWith('team-001', 'task-1');
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.deleteTask('task-1');

      expect(mockStore.deleteSharedTask).not.toHaveBeenCalled();
    });
  });

  describe('assignTask', () => {
    it('calls store.updateSharedTask with userId and assignedTo', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.assignTask('task-1', 'user-abc', 'user-xyz');

      expect(mockStore.updateSharedTask).toHaveBeenCalledWith('team-001', 'task-1', {
        userId: 'user-abc',
        assignedTo: 'user-xyz',
      });
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.assignTask('task-1', 'user-abc', 'user-xyz');

      expect(mockStore.updateSharedTask).not.toHaveBeenCalled();
    });
  });

  describe('incrementPomodoro', () => {
    it('delegates to store.incrementPomodoro with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.incrementPomodoro('task-1');

      expect(mockStore.incrementPomodoro).toHaveBeenCalledWith('team-001', 'task-1');
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      await result.incrementPomodoro('task-1');

      expect(mockStore.incrementPomodoro).not.toHaveBeenCalled();
    });
  });

  // ─── sharedPoolTasks computed ──────────────────────────────────────────

  describe('sharedPoolTasks', () => {
    it('filters to tasks where userId is null', async () => {
      const poolTask1 = makeTask('pool-1', null);
      const poolTask2 = makeTask('pool-2', null);
      const ownedTask = makeTask('owned-1', 'user-001');

      const storeWithTasks = makeMockStore([poolTask1, poolTask2, ownedTask]);
      (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(storeWithTasks);

      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      expect(result.sharedPoolTasks.value).toHaveLength(2);
      expect(result.sharedPoolTasks.value.map((t: SharedTaskResponseDto) => t.id)).toEqual([
        'pool-1',
        'pool-2',
      ]);
    });

    it('returns empty array when all tasks have a userId', async () => {
      const storeWithOwnedTasks = makeMockStore([
        makeTask('t1', 'user-001'),
        makeTask('t2', 'user-002'),
      ]);
      (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(storeWithOwnedTasks);

      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useSharedTasks({ teamId }));
      await wrapper.vm.$nextTick();

      expect(result.sharedPoolTasks.value).toHaveLength(0);
    });
  });

  // ─── Optional filter options ───────────────────────────────────────────

  describe('optional filter options', () => {
    it('passes filterUserId to loadSharedTasks', async () => {
      const teamId = ref('team-001');
      const filterUserId = ref('user-abc');
      const { wrapper } = withSetup(() => useSharedTasks({ teamId, filterUserId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadSharedTasks).toHaveBeenCalledWith('team-001', {
        userId: 'user-abc',
        includeCollaborated: undefined,
        projectId: undefined,
      });
    });

    it('passes includeCollaborated to loadSharedTasks', async () => {
      const teamId = ref('team-001');
      const includeCollaborated = ref(true);
      const { wrapper } = withSetup(() => useSharedTasks({ teamId, includeCollaborated }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadSharedTasks).toHaveBeenCalledWith('team-001', {
        userId: undefined,
        includeCollaborated: true,
        projectId: undefined,
      });
    });

    it('passes filterProjectId to loadSharedTasks', async () => {
      const teamId = ref('team-001');
      const filterProjectId = ref('proj-123');
      const { wrapper } = withSetup(() => useSharedTasks({ teamId, filterProjectId }));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadSharedTasks).toHaveBeenCalledWith('team-001', {
        userId: undefined,
        includeCollaborated: undefined,
        projectId: 'proj-123',
      });
    });
  });
});
