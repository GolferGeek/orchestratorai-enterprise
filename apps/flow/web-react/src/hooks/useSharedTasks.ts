import { useState, useEffect, useCallback } from 'react';
import { flowApiService, SharedTaskResponseDto, SharedTaskStatus, CreateSharedTaskDto, UpdateSharedTaskDto } from '@/services/flowApiService';

export type TaskStatus = 'projects' | 'this_week' | 'today' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  is_completed: boolean;
  assigned_to: string | null;
  user_id: string | null;
  status: TaskStatus;
  created_at: string;
  parent_task_id: string | null;
  pomodoro_count: number;
  project_id: string | null;
  sprint_id: string | null;
  due_date: string | null;
  team_id: string | null;
}

// Map API response to Task interface
function mapTaskResponse(task: SharedTaskResponseDto): Task {
  return {
    id: task.id,
    title: task.title,
    is_completed: task.isCompleted,
    assigned_to: task.assignedTo,
    user_id: task.userId,
    status: task.status as TaskStatus,
    created_at: task.createdAt,
    parent_task_id: task.parentTaskId,
    pomodoro_count: task.pomodoroCount,
    project_id: task.projectId,
    sprint_id: task.sprintId,
    due_date: task.dueDate,
    team_id: task.teamId,
  };
}

export function useSharedTasks(filterUserId?: string, includeCollaborated?: boolean, filterProjectId?: string | null, teamId?: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [collaboratedTaskIds, setCollaboratedTaskIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Fetch collaborated task IDs for the user
  // TODO: Create API endpoint for task_collaborators
  useEffect(() => {
    if (!filterUserId || !includeCollaborated || !teamId) return;
    
    // For now, we'll fetch this separately when we have an endpoint
    // For now, set empty set
    setCollaboratedTaskIds(new Set());
  }, [filterUserId, includeCollaborated, teamId]);

  // Fetch initial tasks
  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    const fetchTasks = async () => {
      try {
        const data = await flowApiService.getSharedTasks(
          teamId,
          filterUserId,
          includeCollaborated,
          filterProjectId || undefined,
        );
        setTasks(data.map(mapTaskResponse));
      } catch (error) {
        console.error('Error fetching tasks:', error);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();

    // Poll for updates every 5 seconds (realtime subscriptions removed)
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [filterUserId, includeCollaborated, teamId, filterProjectId]);

  // Filter tasks based on user ownership OR collaboration AND project
  let filteredTasks = filterUserId && includeCollaborated
    ? tasks.filter(t => t.user_id === filterUserId || collaboratedTaskIds.has(t.id))
    : filterUserId
    ? tasks.filter(t => t.user_id === filterUserId)
    : tasks;

  // Further filter by project if specified
  if (filterProjectId !== undefined && filterProjectId !== null) {
    filteredTasks = filteredTasks.filter(t => t.project_id === filterProjectId);
  }

  // Get shared pool tasks (no user assigned)
  const sharedPoolTasks = tasks.filter(t => !t.user_id && (filterProjectId === undefined || filterProjectId === null || t.project_id === filterProjectId));

  const addTask = useCallback(async (title: string, status: TaskStatus = 'today', assignedTo?: string, userId?: string, parentTaskId?: string, projectId?: string | null, sprintId?: string | null, taskTeamId?: string | null) => {
    if (!teamId) {
      console.error('Cannot add task: teamId is required');
      return;
    }

    const isCompleted = status === 'done';
    const dto: CreateSharedTaskDto = {
      title,
      status: status as SharedTaskStatus,
      userId: userId || undefined,
      assignedTo: assignedTo || undefined,
      projectId: projectId || undefined,
      sprintId: sprintId || undefined,
      teamId: taskTeamId || teamId || undefined,
      parentTaskId: parentTaskId || undefined,
    };

    try {
      const newTask = await flowApiService.createSharedTask(teamId, dto);
      setTasks(prev => [mapTaskResponse(newTask), ...prev]);
    } catch (error) {
      console.error('Error adding task:', error);
    }
  }, [teamId]);

  const updateTaskStatus = useCallback(async (id: string, status: TaskStatus) => {
    if (!teamId) {
      console.error('Cannot update task: teamId is required');
      return;
    }

    const isCompleted = status === 'done';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, is_completed: isCompleted } : t));

    const dto: UpdateSharedTaskDto = {
      status: status as SharedTaskStatus,
      isCompleted,
    };

    try {
      await flowApiService.updateSharedTask(teamId, id, dto);
    } catch (error) {
      console.error('Error updating task status:', error);
      // Revert optimistic update
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status, is_completed: t.is_completed } : t));
    }
  }, [teamId]);

  const toggleTask = useCallback(async (id: string, isCompleted: boolean) => {
    if (!teamId) {
      console.error('Cannot toggle task: teamId is required');
      return;
    }

    const newStatus = !isCompleted ? 'done' : 'today';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: !isCompleted, status: newStatus } : t));

    const dto: UpdateSharedTaskDto = {
      isCompleted: !isCompleted,
      status: newStatus as SharedTaskStatus,
    };

    try {
      await flowApiService.updateSharedTask(teamId, id, dto);
    } catch (error) {
      console.error('Error toggling task:', error);
      // Revert optimistic update
      setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: t.is_completed, status: t.status } : t));
    }
  }, [teamId]);

  const deleteTask = useCallback(async (id: string) => {
    if (!teamId) {
      console.error('Cannot delete task: teamId is required');
      return;
    }

    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== id));

    try {
      await flowApiService.deleteSharedTask(teamId, id);
    } catch (error) {
      console.error('Error deleting task:', error);
      // Revert by refetching
      const data = await flowApiService.getSharedTasks(teamId, filterUserId, includeCollaborated, filterProjectId || undefined);
      setTasks(data.map(mapTaskResponse));
    }
  }, [teamId, filterUserId, includeCollaborated, filterProjectId]);

  const assignTask = useCallback(async (id: string, userId: string | null, assignedTo: string | null) => {
    if (!teamId) {
      console.error('Cannot assign task: teamId is required');
      return;
    }

    const existingTask = tasks.find(t => t.id === id);
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, user_id: userId, assigned_to: assignedTo } : t));

    const dto: UpdateSharedTaskDto = {
      userId: userId,
      assignedTo: assignedTo,
    };

    try {
      await flowApiService.updateSharedTask(teamId, id, dto);
    } catch (error) {
      console.error('Error assigning task:', error);
      // Revert optimistic update to previous values
      if (existingTask) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, user_id: existingTask.user_id, assigned_to: existingTask.assigned_to } : t));
      }
    }
  }, [teamId, tasks]);

  const incrementPomodoro = useCallback(async (id: string) => {
    if (!teamId) {
      console.error('Cannot increment pomodoro: teamId is required');
      return;
    }

    const task = tasks.find(t => t.id === id);
    const newCount = (task?.pomodoro_count || 0) + 1;
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, pomodoro_count: newCount } : t));

    const dto: UpdateSharedTaskDto = {
      pomodoroCount: newCount,
    };

    try {
      await flowApiService.updateSharedTask(teamId, id, dto);
    } catch (error) {
      console.error('Error incrementing pomodoro:', error);
      // Revert optimistic update
      setTasks(prev => prev.map(t => t.id === id ? { ...t, pomodoro_count: t.pomodoro_count } : t));
    }
  }, [tasks, teamId]);

  const updateTaskSprint = useCallback(async (id: string, sprintId: string | null) => {
    if (!teamId) {
      console.error('Cannot update task sprint: teamId is required');
      return;
    }

    const existingTask = tasks.find(t => t.id === id);
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, sprint_id: sprintId } : t));

    const dto: UpdateSharedTaskDto = {
      sprintId: sprintId,
    };

    try {
      await flowApiService.updateSharedTask(teamId, id, dto);
    } catch (error) {
      console.error('Error updating task sprint:', error);
      // Revert optimistic update to previous value
      if (existingTask) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, sprint_id: existingTask.sprint_id } : t));
      }
    }
  }, [teamId, tasks]);

  const updateTaskDueDate = useCallback(async (id: string, dueDate: string | null) => {
    if (!teamId) {
      console.error('Cannot update task due date: teamId is required');
      return;
    }

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, due_date: dueDate } : t));

    const dto: UpdateSharedTaskDto = {
      dueDate: dueDate || undefined,
    };

    try {
      await flowApiService.updateSharedTask(teamId, id, dto);
    } catch (error) {
      console.error('Error updating task due date:', error);
      // Revert optimistic update
      setTasks(prev => prev.map(t => t.id === id ? { ...t, due_date: t.due_date } : t));
    }
  }, [teamId]);

  const updateTaskPlacement = useCallback(
    async (
      id: string,
      updates: { status?: TaskStatus; sprintId?: string | null },
    ) => {
      if (!teamId) {
        console.error('Cannot update task placement: teamId is required');
        return;
      }

      const existingTask = tasks.find((t) => t.id === id);
      if (!existingTask) return;

      const nextStatus = updates.status ?? existingTask.status;
      const nextSprintId =
        updates.sprintId !== undefined ? updates.sprintId : existingTask.sprint_id;
      const isCompleted = nextStatus === 'done';

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: nextStatus,
                sprint_id: nextSprintId,
                is_completed: isCompleted,
              }
            : t,
        ),
      );

      const dto: UpdateSharedTaskDto = {
        status: nextStatus as SharedTaskStatus,
        sprintId: nextSprintId,
        isCompleted,
      };

      try {
        await flowApiService.updateSharedTask(teamId, id, dto);
      } catch (error) {
        console.error('Error updating task placement:', error);
        // Revert optimistic update
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: existingTask.status,
                  sprint_id: existingTask.sprint_id,
                  is_completed: existingTask.is_completed,
                }
              : t,
          ),
        );
      }
    },
    [teamId, tasks],
  );

  return {
    tasks: filteredTasks,
    allTasks: tasks,
    sharedPoolTasks,
    collaboratedTaskIds,
    loading,
    addTask,
    updateTaskStatus,
    toggleTask,
    deleteTask,
    assignTask,
    incrementPomodoro,
    updateTaskSprint,
    updateTaskPlacement,
    updateTaskDueDate,
  };
}
