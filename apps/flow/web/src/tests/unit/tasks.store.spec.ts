/**
 * tasks.store.spec.ts
 *
 * Unit tests for the Flow tasks Pinia store.
 * The store calls flowApiService for all async operations.
 * flowApiService is fully mocked so no HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTasksStore } from '@/stores/tasks.store';
import type { SharedTaskResponseDto, SharedTaskStatus } from '@/types/flow';

// ─── Mock flowApiService ──────────────────────────────────────────────────────

vi.mock('@/services/flow-api.service', () => ({
  flowApiService: {
    getSharedTasks: vi.fn(),
    createSharedTask: vi.fn(),
    updateSharedTask: vi.fn(),
    deleteSharedTask: vi.fn(),
    getMyTasks: vi.fn(),
    getEfforts: vi.fn(),
    getProjects: vi.fn(),
    getTasks: vi.fn(),
    createEffort: vi.fn(),
    createProject: vi.fn(),
    createTask: vi.fn(),
    updateEffort: vi.fn(),
    updateProject: vi.fn(),
    updateTask: vi.fn(),
    deleteEffort: vi.fn(),
    deleteProject: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

// ─── Import mock after vi.mock ─────────────────────────────────────────────────

import { flowApiService } from '@/services/flow-api.service';

const mockApi = flowApiService as unknown as {
  getSharedTasks: ReturnType<typeof vi.fn>;
  createSharedTask: ReturnType<typeof vi.fn>;
  updateSharedTask: ReturnType<typeof vi.fn>;
  deleteSharedTask: ReturnType<typeof vi.fn>;
  getMyTasks: ReturnType<typeof vi.fn>;
  getEfforts: ReturnType<typeof vi.fn>;
  getProjects: ReturnType<typeof vi.fn>;
  getTasks: ReturnType<typeof vi.fn>;
  createEffort: ReturnType<typeof vi.fn>;
  createProject: ReturnType<typeof vi.fn>;
  createTask: ReturnType<typeof vi.fn>;
  updateEffort: ReturnType<typeof vi.fn>;
  updateProject: ReturnType<typeof vi.fn>;
  updateTask: ReturnType<typeof vi.fn>;
  deleteEffort: ReturnType<typeof vi.fn>;
  deleteProject: ReturnType<typeof vi.fn>;
  deleteTask: ReturnType<typeof vi.fn>;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-001';

function makeTask(
  id: string,
  status: SharedTaskStatus = 'today',
  parentTaskId: string | null = null,
): SharedTaskResponseDto {
  return {
    id,
    title: `Task ${id}`,
    isCompleted: false,
    assignedTo: null,
    userId: 'user-001',
    status,
    createdAt: '2024-01-01T00:00:00.000Z',
    parentTaskId,
    pomodoroCount: 0,
    projectId: null,
    sprintId: null,
    dueDate: null,
    teamId: TEAM_ID,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTasksStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty sharedTasks', () => {
      const store = useTasksStore();
      expect(store.sharedTasks).toEqual([]);
    });

    it('starts not loading shared tasks', () => {
      const store = useTasksStore();
      expect(store.loadingShared).toBe(false);
    });

    it('starts with empty efforts, projects, hierarchyTasks', () => {
      const store = useTasksStore();
      expect(store.efforts).toEqual([]);
      expect(store.projects).toEqual([]);
      expect(store.hierarchyTasks).toEqual([]);
    });

    it('starts not loading hierarchy', () => {
      const store = useTasksStore();
      expect(store.loadingHierarchy).toBe(false);
    });

    it('starts with empty myTasks', () => {
      const store = useTasksStore();
      expect(store.myTasks).toEqual([]);
    });
  });

  // ─── loadSharedTasks ──────────────────────────────────────────────────

  describe('loadSharedTasks', () => {
    it('fetches tasks from the API and stores them', async () => {
      const tasks = [makeTask('t1'), makeTask('t2')];
      mockApi.getSharedTasks.mockResolvedValueOnce(tasks);

      const store = useTasksStore();
      await store.loadSharedTasks(TEAM_ID);

      expect(mockApi.getSharedTasks).toHaveBeenCalledWith(TEAM_ID, undefined);
      expect(store.sharedTasks).toEqual(tasks);
    });

    it('sets loadingShared to true during fetch and false after', async () => {
      let capturedLoading = false;
      mockApi.getSharedTasks.mockImplementationOnce(async () => {
        capturedLoading = true; // inside the promise means loading should be true
        return [];
      });

      const store = useTasksStore();
      const promise = store.loadSharedTasks(TEAM_ID);
      expect(store.loadingShared).toBe(true);
      await promise;
      expect(store.loadingShared).toBe(false);
      expect(capturedLoading).toBe(true);
    });

    it('sets loadingShared to false even when API throws', async () => {
      mockApi.getSharedTasks.mockRejectedValueOnce(new Error('Network error'));

      const store = useTasksStore();
      await expect(store.loadSharedTasks(TEAM_ID)).rejects.toThrow('Network error');
      expect(store.loadingShared).toBe(false);
    });

    it('forwards optional filters to the API', async () => {
      mockApi.getSharedTasks.mockResolvedValueOnce([]);
      const store = useTasksStore();
      await store.loadSharedTasks(TEAM_ID, { userId: 'u1', includeCollaborated: true });
      expect(mockApi.getSharedTasks).toHaveBeenCalledWith(TEAM_ID, {
        userId: 'u1',
        includeCollaborated: true,
      });
    });
  });

  // ─── createSharedTask ─────────────────────────────────────────────────

  describe('createSharedTask', () => {
    it('calls the API and appends the new task to sharedTasks', async () => {
      const newTask = makeTask('new-task', 'today');
      mockApi.createSharedTask.mockResolvedValueOnce(newTask);

      const store = useTasksStore();
      const result = await store.createSharedTask(TEAM_ID, 'New Task');

      expect(mockApi.createSharedTask).toHaveBeenCalled();
      expect(store.sharedTasks).toContainEqual(newTask);
      expect(result).toEqual(newTask);
    });

    it('uses today as the default status', async () => {
      const task = makeTask('t1', 'today');
      mockApi.createSharedTask.mockResolvedValueOnce(task);

      const store = useTasksStore();
      await store.createSharedTask(TEAM_ID, 'My Task');

      const callArg = mockApi.createSharedTask.mock.calls[0][1];
      expect(callArg.status).toBe('today');
    });
  });

  // ─── updateSharedTask ─────────────────────────────────────────────────

  describe('updateSharedTask', () => {
    it('calls the API and updates the task in the local list', async () => {
      const original = makeTask('t1', 'today');
      const updated = { ...original, title: 'Updated title' };
      mockApi.updateSharedTask.mockResolvedValueOnce(updated);

      const store = useTasksStore();
      store.sharedTasks.push(original);
      await store.updateSharedTask(TEAM_ID, 't1', { title: 'Updated title' });

      expect(store.sharedTasks[0].title).toBe('Updated title');
    });

    it('does not crash when the task id is not in the local list', async () => {
      const updated = makeTask('ghost', 'done');
      mockApi.updateSharedTask.mockResolvedValueOnce(updated);

      const store = useTasksStore();
      await expect(
        store.updateSharedTask(TEAM_ID, 'ghost', { status: 'done' }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── updateTaskStatus ─────────────────────────────────────────────────

  describe('updateTaskStatus', () => {
    it('delegates to updateSharedTask with just the status field', async () => {
      const task = makeTask('t1', 'today');
      const updated = { ...task, status: 'done' as SharedTaskStatus };
      mockApi.updateSharedTask.mockResolvedValueOnce(updated);

      const store = useTasksStore();
      store.sharedTasks.push(task);
      await store.updateTaskStatus(TEAM_ID, 't1', 'done');

      expect(mockApi.updateSharedTask).toHaveBeenCalledWith(TEAM_ID, 't1', { status: 'done' });
    });
  });

  // ─── toggleTask ───────────────────────────────────────────────────────

  describe('toggleTask', () => {
    it('flips isCompleted from false to true', async () => {
      const task = makeTask('t1');
      const toggled = { ...task, isCompleted: true };
      mockApi.updateSharedTask.mockResolvedValueOnce(toggled);

      const store = useTasksStore();
      store.sharedTasks.push(task);
      await store.toggleTask(TEAM_ID, 't1', false);

      expect(mockApi.updateSharedTask).toHaveBeenCalledWith(TEAM_ID, 't1', {
        isCompleted: true,
      });
    });

    it('flips isCompleted from true to false', async () => {
      const task = { ...makeTask('t1'), isCompleted: true };
      const toggled = { ...task, isCompleted: false };
      mockApi.updateSharedTask.mockResolvedValueOnce(toggled);

      const store = useTasksStore();
      store.sharedTasks.push(task);
      await store.toggleTask(TEAM_ID, 't1', true);

      expect(mockApi.updateSharedTask).toHaveBeenCalledWith(TEAM_ID, 't1', {
        isCompleted: false,
      });
    });
  });

  // ─── deleteSharedTask ─────────────────────────────────────────────────

  describe('deleteSharedTask', () => {
    it('calls the API and removes the task from the local list', async () => {
      mockApi.deleteSharedTask.mockResolvedValueOnce(undefined);

      const store = useTasksStore();
      store.sharedTasks.push(makeTask('t1'), makeTask('t2'));
      await store.deleteSharedTask(TEAM_ID, 't1');

      expect(store.sharedTasks).toHaveLength(1);
      expect(store.sharedTasks[0].id).toBe('t2');
    });
  });

  // ─── incrementPomodoro ────────────────────────────────────────────────

  describe('incrementPomodoro', () => {
    it('increments pomodoroCount by 1', async () => {
      const task = makeTask('t1');
      const incremented = { ...task, pomodoroCount: 1 };
      mockApi.updateSharedTask.mockResolvedValueOnce(incremented);

      const store = useTasksStore();
      store.sharedTasks.push(task);
      await store.incrementPomodoro(TEAM_ID, 't1');

      expect(mockApi.updateSharedTask).toHaveBeenCalledWith(TEAM_ID, 't1', {
        pomodoroCount: 1,
      });
    });

    it('is a no-op when task does not exist locally', async () => {
      const store = useTasksStore();
      await store.incrementPomodoro(TEAM_ID, 'ghost');
      expect(mockApi.updateSharedTask).not.toHaveBeenCalled();
    });
  });

  // ─── loadMyTasks ──────────────────────────────────────────────────────

  describe('loadMyTasks', () => {
    it('fetches and stores my tasks', async () => {
      const tasks = [makeTask('my-1'), makeTask('my-2')];
      mockApi.getMyTasks.mockResolvedValueOnce(tasks);

      const store = useTasksStore();
      await store.loadMyTasks();

      expect(store.myTasks).toEqual(tasks);
    });
  });

  // ─── rootTasks (computed) ─────────────────────────────────────────────

  describe('rootTasks (computed)', () => {
    it('returns only tasks without a parentTaskId', () => {
      const store = useTasksStore();
      store.sharedTasks.push(
        makeTask('root-1', 'today', null),
        makeTask('child-1', 'today', 'root-1'),
        makeTask('root-2', 'done', null),
      );
      expect(store.rootTasks).toHaveLength(2);
      expect(store.rootTasks.map((t) => t.id)).toEqual(['root-1', 'root-2']);
    });
  });

  // ─── tasksByStatus (computed) ─────────────────────────────────────────

  describe('tasksByStatus (computed)', () => {
    it('groups root tasks by their status', () => {
      const store = useTasksStore();
      store.sharedTasks.push(
        makeTask('t1', 'today'),
        makeTask('t2', 'today'),
        makeTask('t3', 'done'),
        makeTask('t4', 'in_progress'),
        makeTask('t5', 'this_week'),
        makeTask('t6', 'projects'),
      );

      const groups = store.tasksByStatus;
      expect(groups.today).toHaveLength(2);
      expect(groups.done).toHaveLength(1);
      expect(groups.in_progress).toHaveLength(1);
      expect(groups.this_week).toHaveLength(1);
      expect(groups.projects).toHaveLength(1);
    });

    it('child tasks (with parentTaskId) are not included in grouped status', () => {
      const store = useTasksStore();
      store.sharedTasks.push(
        makeTask('root', 'today', null),
        makeTask('child', 'today', 'root'), // child — should not appear in rootTasks
      );
      expect(store.tasksByStatus.today).toHaveLength(1);
      expect(store.tasksByStatus.today[0].id).toBe('root');
    });
  });

  // ─── subtasksFor ──────────────────────────────────────────────────────

  describe('subtasksFor', () => {
    it('returns children of the given parent id', () => {
      const store = useTasksStore();
      store.sharedTasks.push(
        makeTask('root', 'today', null),
        makeTask('child-1', 'today', 'root'),
        makeTask('child-2', 'done', 'root'),
        makeTask('other', 'today', null),
      );

      const subtasks = store.subtasksFor('root');
      expect(subtasks).toHaveLength(2);
      expect(subtasks.map((t) => t.id)).toEqual(['child-1', 'child-2']);
    });

    it('returns empty array when no children exist', () => {
      const store = useTasksStore();
      store.sharedTasks.push(makeTask('root', 'today'));
      expect(store.subtasksFor('root')).toEqual([]);
    });
  });

  // ─── Hierarchy — loadEfforts ──────────────────────────────────────────

  describe('loadEfforts', () => {
    it('fetches efforts and stores them', async () => {
      const efforts = [
        { id: 'e1', name: 'Effort 1', status: 'active', orderIndex: 0, createdAt: '', updatedAt: '' },
      ];
      mockApi.getEfforts.mockResolvedValueOnce(efforts);

      const store = useTasksStore();
      await store.loadEfforts(TEAM_ID);

      expect(store.efforts).toEqual(efforts);
    });

    it('sets loadingHierarchy to false after fetch completes', async () => {
      mockApi.getEfforts.mockResolvedValueOnce([]);
      const store = useTasksStore();
      await store.loadEfforts(TEAM_ID);
      expect(store.loadingHierarchy).toBe(false);
    });
  });

  // ─── createEffort ─────────────────────────────────────────────────────

  describe('createEffort', () => {
    it('calls API and appends new effort', async () => {
      const effort = { id: 'e1', name: 'Sprint Alpha', status: 'active', orderIndex: 0, createdAt: '', updatedAt: '' };
      mockApi.createEffort.mockResolvedValueOnce(effort);

      const store = useTasksStore();
      const result = await store.createEffort(TEAM_ID, 'Sprint Alpha');

      expect(store.efforts).toContainEqual(effort);
      expect(result).toEqual(effort);
    });
  });

  // ─── updateEffort ────────────────────────────────────────────────────

  describe('updateEffort', () => {
    it('calls API and updates the effort in local state', async () => {
      const effort = { id: 'e1', name: 'Sprint Alpha', status: 'active', orderIndex: 0, createdAt: '', updatedAt: '' };
      const updated = { ...effort, name: 'Sprint Beta' };
      mockApi.updateEffort.mockResolvedValueOnce(updated);

      const store = useTasksStore();
      store.efforts.push(effort);
      await store.updateEffort(TEAM_ID, 'e1', { name: 'Sprint Beta' });

      expect(store.efforts[0].name).toBe('Sprint Beta');
    });
  });

  // ─── updateProject ────────────────────────────────────────────────────

  describe('updateProject', () => {
    it('calls API and updates the project in local state', async () => {
      const project = { id: 'p1', effortId: 'e1', name: 'Old Name', status: 'active', orderIndex: 0, createdAt: '', updatedAt: '' };
      const updated = { ...project, name: 'New Name' };
      mockApi.updateProject.mockResolvedValueOnce(updated);

      const store = useTasksStore();
      store.projects.push(project);
      await store.updateProject(TEAM_ID, 'p1', { name: 'New Name' });

      expect(store.projects[0].name).toBe('New Name');
    });
  });

  // ─── updateHierarchyTask ──────────────────────────────────────────────

  describe('updateHierarchyTask', () => {
    it('calls API and updates the task in local state', async () => {
      const task = { id: 't1', projectId: 'p1', title: 'Old', status: 'todo', orderIndex: 0, isMilestone: false, createdAt: '', updatedAt: '' };
      const updated = { ...task, title: 'New' };
      mockApi.updateTask.mockResolvedValueOnce(updated);

      const store = useTasksStore();
      store.hierarchyTasks.push(task);
      await store.updateHierarchyTask(TEAM_ID, 't1', { title: 'New' });

      expect(store.hierarchyTasks[0].title).toBe('New');
    });
  });

  // ─── deleteEffort ─────────────────────────────────────────────────────

  describe('deleteEffort', () => {
    it('calls API and removes the effort from local state', async () => {
      const effort = { id: 'e1', name: 'Sprint Alpha', status: 'active', orderIndex: 0, createdAt: '', updatedAt: '' };
      mockApi.deleteEffort.mockResolvedValueOnce(undefined);

      const store = useTasksStore();
      store.efforts.push(effort);
      await store.deleteEffort(TEAM_ID, 'e1');

      expect(store.efforts).toHaveLength(0);
    });
  });
});
