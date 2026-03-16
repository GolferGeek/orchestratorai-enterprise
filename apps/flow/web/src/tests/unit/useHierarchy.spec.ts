/**
 * useHierarchy.spec.ts
 *
 * Unit tests for the useHierarchy composable.
 * The tasks store is fully mocked so no HTTP calls are made.
 * The composable loads efforts, then projects per effort, then tasks per project.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useHierarchy } from '@/composables/useHierarchy';
import type { EffortResponse, ProjectResponse } from '@/types/flow';

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEffort(id: string): EffortResponse {
  return {
    id,
    name: `Effort ${id}`,
    status: 'active',
    orderIndex: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeProject(id: string, effortId: string): ProjectResponse {
  return {
    id,
    effortId,
    name: `Project ${id}`,
    status: 'active',
    orderIndex: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

// ─── Mock store factory ───────────────────────────────────────────────────────

function makeMockStore(
  efforts: EffortResponse[] = [],
  projects: ProjectResponse[] = [],
) {
  return {
    efforts,
    projects,
    hierarchyTasks: [],
    loadingHierarchy: false,
    loadEfforts: vi.fn().mockResolvedValue(undefined),
    loadProjects: vi.fn().mockResolvedValue(undefined),
    loadHierarchyTasks: vi.fn().mockResolvedValue(undefined),
    createEffort: vi.fn().mockResolvedValue(makeEffort('new-effort')),
    updateEffort: vi.fn().mockResolvedValue(undefined),
    deleteEffort: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn().mockResolvedValue(makeProject('new-project', 'e1')),
    updateProject: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    createHierarchyTask: vi.fn().mockResolvedValue({ id: 'new-task', title: 'New Task' }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useHierarchy', () => {
  let mockStore: ReturnType<typeof makeMockStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockStore = makeMockStore();
    (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── Loading on mount ──────────────────────────────────────────────────

  describe('initial load', () => {
    it('loads efforts on mount when teamId is set', async () => {
      const teamId = ref('team-001');
      const { wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadEfforts).toHaveBeenCalledWith('team-001');
    });

    it('does not load when teamId is null on mount', async () => {
      const teamId = ref<string | null>(null);
      const { wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadEfforts).not.toHaveBeenCalled();
    });

    it('loads projects for each effort after loading efforts', async () => {
      const efforts = [makeEffort('e1'), makeEffort('e2')];
      // The store object must be mutable so that loadAll can read .efforts after loadEfforts resolves
      const storeWithEfforts = makeMockStore();
      storeWithEfforts.loadEfforts.mockImplementation(async () => {
        storeWithEfforts.efforts.push(...efforts);
      });
      (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(storeWithEfforts);

      const teamId = ref('team-001');
      const { result } = withSetup(() => useHierarchy(teamId));
      // loadAll is async — wait for it to fully complete
      await result.loadAll('team-001');

      expect(storeWithEfforts.loadProjects).toHaveBeenCalledWith('team-001', 'e1');
      expect(storeWithEfforts.loadProjects).toHaveBeenCalledWith('team-001', 'e2');
    });

    it('loads hierarchy tasks for each project after loading projects', async () => {
      const efforts = [makeEffort('e1')];
      const projects = [makeProject('p1', 'e1'), makeProject('p2', 'e1')];
      const storeWithProjects = makeMockStore();
      storeWithProjects.loadEfforts.mockImplementation(async () => {
        storeWithProjects.efforts.push(...efforts);
      });
      storeWithProjects.loadProjects.mockImplementation(async () => {
        if (storeWithProjects.projects.length === 0) {
          storeWithProjects.projects.push(...projects);
        }
      });
      (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(storeWithProjects);

      const teamId = ref('team-001');
      const { result } = withSetup(() => useHierarchy(teamId));
      await result.loadAll('team-001');

      expect(storeWithProjects.loadHierarchyTasks).toHaveBeenCalledWith('team-001', 'p1');
      expect(storeWithProjects.loadHierarchyTasks).toHaveBeenCalledWith('team-001', 'p2');
    });
  });

  // ─── Reload on teamId change ───────────────────────────────────────────

  describe('teamId watch', () => {
    it('reloads when teamId changes', async () => {
      const teamId = ref<string | null>('team-001');
      const { wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const callsAfterFirstMount = mockStore.loadEfforts.mock.calls.length;

      teamId.value = 'team-002';
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadEfforts.mock.calls.length).toBeGreaterThan(callsAfterFirstMount);
      const lastCall = mockStore.loadEfforts.mock.calls[mockStore.loadEfforts.mock.calls.length - 1];
      expect(lastCall[0]).toBe('team-002');
    });

    it('does not reload when teamId changes to null', async () => {
      const teamId = ref<string | null>('team-001');
      const { wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const callsBeforeChange = mockStore.loadEfforts.mock.calls.length;

      teamId.value = null;
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockStore.loadEfforts.mock.calls.length).toBe(callsBeforeChange);
    });
  });

  // ─── Effort mutations ──────────────────────────────────────────────────

  describe('addEffort', () => {
    it('delegates to store.createEffort with teamId, name, and description', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.addEffort('Sprint Alpha', 'First sprint');

      expect(mockStore.createEffort).toHaveBeenCalledWith(
        'team-001',
        'Sprint Alpha',
        'First sprint',
      );
    });

    it('delegates to store.createEffort without description when omitted', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.addEffort('Sprint Alpha');

      expect(mockStore.createEffort).toHaveBeenCalledWith(
        'team-001',
        'Sprint Alpha',
        undefined,
      );
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      const returned = await result.addEffort('Sprint Alpha');

      expect(mockStore.createEffort).not.toHaveBeenCalled();
      expect(returned).toBeUndefined();
    });
  });

  describe('updateEffort', () => {
    it('delegates to store.updateEffort with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.updateEffort('e1', { name: 'Updated Name' });

      expect(mockStore.updateEffort).toHaveBeenCalledWith('team-001', 'e1', {
        name: 'Updated Name',
      });
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.updateEffort('e1', { name: 'Updated' });

      expect(mockStore.updateEffort).not.toHaveBeenCalled();
    });
  });

  describe('deleteEffort', () => {
    it('delegates to store.deleteEffort with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.deleteEffort('e1');

      expect(mockStore.deleteEffort).toHaveBeenCalledWith('team-001', 'e1');
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.deleteEffort('e1');

      expect(mockStore.deleteEffort).not.toHaveBeenCalled();
    });
  });

  // ─── Project mutations ─────────────────────────────────────────────────

  describe('addProject', () => {
    it('delegates to store.createProject with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.addProject('e1', 'My Project', 'Project description');

      expect(mockStore.createProject).toHaveBeenCalledWith(
        'team-001',
        'e1',
        'My Project',
        'Project description',
      );
    });

    it('delegates to store.createProject without description when omitted', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.addProject('e1', 'My Project');

      expect(mockStore.createProject).toHaveBeenCalledWith(
        'team-001',
        'e1',
        'My Project',
        undefined,
      );
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      const returned = await result.addProject('e1', 'My Project');

      expect(mockStore.createProject).not.toHaveBeenCalled();
      expect(returned).toBeUndefined();
    });
  });

  describe('deleteProject', () => {
    it('delegates to store.deleteProject with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.deleteProject('p1');

      expect(mockStore.deleteProject).toHaveBeenCalledWith('team-001', 'p1');
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.deleteProject('p1');

      expect(mockStore.deleteProject).not.toHaveBeenCalled();
    });
  });

  // ─── Task mutations ────────────────────────────────────────────────────

  describe('addTask', () => {
    it('delegates to store.createHierarchyTask with correct args', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.addTask('p1', 'My Task', 'Task description');

      expect(mockStore.createHierarchyTask).toHaveBeenCalledWith(
        'team-001',
        'p1',
        'My Task',
        'Task description',
      );
    });

    it('delegates to store.createHierarchyTask without description when omitted', async () => {
      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      await result.addTask('p1', 'My Task');

      expect(mockStore.createHierarchyTask).toHaveBeenCalledWith(
        'team-001',
        'p1',
        'My Task',
        undefined,
      );
    });

    it('does not call store when teamId is null', async () => {
      const teamId = ref<string | null>(null);
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      const returned = await result.addTask('p1', 'My Task');

      expect(mockStore.createHierarchyTask).not.toHaveBeenCalled();
      expect(returned).toBeUndefined();
    });
  });

  // ─── Exposed state ─────────────────────────────────────────────────────

  describe('exposed state', () => {
    it('exposes efforts from the store', async () => {
      const efforts = [makeEffort('e1'), makeEffort('e2')];
      const storeWithEfforts = makeMockStore(efforts);
      (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(storeWithEfforts);

      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      expect(result.efforts.value).toEqual(efforts);
    });

    it('exposes projects from the store', async () => {
      const projects = [makeProject('p1', 'e1')];
      const storeWithProjects = makeMockStore([], projects);
      (useTasksStore as ReturnType<typeof vi.fn>).mockReturnValue(storeWithProjects);

      const teamId = ref('team-001');
      const { result, wrapper } = withSetup(() => useHierarchy(teamId));
      await wrapper.vm.$nextTick();

      expect(result.projects.value).toEqual(projects);
    });
  });
});
