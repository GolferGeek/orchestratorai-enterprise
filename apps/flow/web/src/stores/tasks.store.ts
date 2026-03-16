/**
 * Tasks Store
 *
 * State layer for shared tasks (Kanban board) and hierarchy tasks.
 * All API calls go through flow-api.service.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type {
  SharedTaskResponseDto,
  SharedTaskStatus,
  UpdateSharedTaskDto,
  TaskResponse,
  EffortResponse,
  ProjectResponse,
} from '@/types/flow';

export const useTasksStore = defineStore('tasks', () => {
  // Shared tasks (Kanban)
  const sharedTasks = ref<SharedTaskResponseDto[]>([]);
  const loadingShared = ref(false);

  // Hierarchy: efforts, projects, tasks
  const efforts = ref<EffortResponse[]>([]);
  const projects = ref<ProjectResponse[]>([]);
  const hierarchyTasks = ref<TaskResponse[]>([]);
  const loadingHierarchy = ref(false);

  const myTasks = ref<SharedTaskResponseDto[]>([]);

  const rootTasks = computed(() =>
    sharedTasks.value.filter((t) => !t.parentTaskId),
  );

  const tasksByStatus = computed(() => {
    const groups: Record<SharedTaskStatus, SharedTaskResponseDto[]> = {
      projects: [],
      this_week: [],
      today: [],
      in_progress: [],
      done: [],
    };
    rootTasks.value.forEach((t) => {
      if (groups[t.status]) groups[t.status].push(t);
    });
    return groups;
  });

  function subtasksFor(parentId: string): SharedTaskResponseDto[] {
    return sharedTasks.value.filter((t) => t.parentTaskId === parentId);
  }

  // ============================================================================
  // Shared Tasks
  // ============================================================================

  async function loadSharedTasks(
    teamId: string,
    opts?: { userId?: string; includeCollaborated?: boolean; projectId?: string },
  ) {
    loadingShared.value = true;
    try {
      sharedTasks.value = await flowApiService.getSharedTasks(teamId, opts);
    } finally {
      loadingShared.value = false;
    }
  }

  async function createSharedTask(
    teamId: string,
    title: string,
    status: SharedTaskStatus = 'today',
    opts?: { userId?: string; assignedTo?: string; projectId?: string; sprintId?: string; parentTaskId?: string },
  ): Promise<SharedTaskResponseDto> {
    const task = await flowApiService.createSharedTask(teamId, {
      title,
      status,
      teamId,
      ...opts,
    });
    sharedTasks.value.push(task);
    return task;
  }

  async function updateSharedTask(
    teamId: string,
    taskId: string,
    updates: UpdateSharedTaskDto,
  ): Promise<void> {
    const updated = await flowApiService.updateSharedTask(teamId, taskId, updates);
    const idx = sharedTasks.value.findIndex((t) => t.id === taskId);
    if (idx !== -1) sharedTasks.value[idx] = updated;
  }

  async function updateTaskStatus(teamId: string, taskId: string, status: SharedTaskStatus): Promise<void> {
    await updateSharedTask(teamId, taskId, { status });
  }

  async function toggleTask(teamId: string, taskId: string, isCompleted: boolean): Promise<void> {
    await updateSharedTask(teamId, taskId, { isCompleted: !isCompleted });
  }

  async function deleteSharedTask(teamId: string, taskId: string): Promise<void> {
    await flowApiService.deleteSharedTask(teamId, taskId);
    sharedTasks.value = sharedTasks.value.filter((t) => t.id !== taskId);
  }

  async function incrementPomodoro(teamId: string, taskId: string): Promise<void> {
    const task = sharedTasks.value.find((t) => t.id === taskId);
    if (!task) return;
    await updateSharedTask(teamId, taskId, { pomodoroCount: task.pomodoroCount + 1 });
  }

  async function loadMyTasks(): Promise<void> {
    myTasks.value = await flowApiService.getMyTasks();
  }

  // ============================================================================
  // Hierarchy (Efforts / Projects / Tasks)
  // ============================================================================

  async function loadEfforts(teamId: string) {
    loadingHierarchy.value = true;
    try {
      efforts.value = await flowApiService.getEfforts(teamId);
    } finally {
      loadingHierarchy.value = false;
    }
  }

  async function loadProjects(teamId: string, effortId?: string) {
    projects.value = await flowApiService.getProjects(teamId, effortId);
  }

  async function loadHierarchyTasks(teamId: string, projectId?: string) {
    hierarchyTasks.value = await flowApiService.getTasks(teamId, projectId);
  }

  async function createEffort(teamId: string, name: string, description?: string): Promise<EffortResponse> {
    const effort = await flowApiService.createEffort(teamId, { name, description });
    efforts.value.push(effort);
    return effort;
  }

  async function createProject(teamId: string, effortId: string, name: string, description?: string): Promise<ProjectResponse> {
    const project = await flowApiService.createProject(teamId, { effortId, name, description });
    projects.value.push(project);
    return project;
  }

  async function createHierarchyTask(teamId: string, projectId: string, title: string, description?: string): Promise<TaskResponse> {
    const task = await flowApiService.createTask(teamId, { projectId, title, description });
    hierarchyTasks.value.push(task);
    return task;
  }

  async function updateEffort(teamId: string, effortId: string, updates: Partial<EffortResponse>): Promise<void> {
    const updated = await flowApiService.updateEffort(teamId, effortId, updates);
    const idx = efforts.value.findIndex((e) => e.id === effortId);
    if (idx !== -1) efforts.value[idx] = updated;
  }

  async function updateProject(teamId: string, projectId: string, updates: Partial<ProjectResponse>): Promise<void> {
    const updated = await flowApiService.updateProject(teamId, projectId, updates);
    const idx = projects.value.findIndex((p) => p.id === projectId);
    if (idx !== -1) projects.value[idx] = updated;
  }

  async function updateHierarchyTask(teamId: string, taskId: string, updates: Partial<TaskResponse>): Promise<void> {
    const updated = await flowApiService.updateTask(teamId, taskId, updates);
    const idx = hierarchyTasks.value.findIndex((t) => t.id === taskId);
    if (idx !== -1) hierarchyTasks.value[idx] = updated;
  }

  async function deleteEffort(teamId: string, effortId: string): Promise<void> {
    await flowApiService.deleteEffort(teamId, effortId);
    efforts.value = efforts.value.filter((e) => e.id !== effortId);
  }

  async function deleteProject(teamId: string, projectId: string): Promise<void> {
    await flowApiService.deleteProject(teamId, projectId);
    projects.value = projects.value.filter((p) => p.id !== projectId);
  }

  async function deleteHierarchyTask(teamId: string, taskId: string): Promise<void> {
    await flowApiService.deleteTask(teamId, taskId);
    hierarchyTasks.value = hierarchyTasks.value.filter((t) => t.id !== taskId);
  }

  return {
    sharedTasks,
    loadingShared,
    efforts,
    projects,
    hierarchyTasks,
    loadingHierarchy,
    myTasks,
    rootTasks,
    tasksByStatus,
    subtasksFor,
    loadSharedTasks,
    createSharedTask,
    updateSharedTask,
    updateTaskStatus,
    toggleTask,
    deleteSharedTask,
    incrementPomodoro,
    loadMyTasks,
    loadEfforts,
    loadProjects,
    loadHierarchyTasks,
    createEffort,
    createProject,
    createHierarchyTask,
    updateEffort,
    updateProject,
    updateHierarchyTask,
    deleteEffort,
    deleteProject,
    deleteHierarchyTask,
  };
});
