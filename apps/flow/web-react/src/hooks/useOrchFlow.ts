import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { flowApiService, EffortResponse, ProjectResponse, TaskResponse } from '@/services/flowApiService';

// Types matching the orch_flow schema
export interface Effort {
  id: string;
  organization_slug: string;
  name: string;
  description: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  order_index: number;
  icon: string | null;
  color: string | null;
  estimated_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  effort_id: string;
  name: string;
  description: string | null;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
  assignee_id: string | null;
  due_date: string | null;
  order_index: number;
  documentation_url: string | null;
  is_milestone: boolean;
  created_at: string;
  updated_at: string;
}

// Helper to map API responses to hook interfaces
function mapEffortResponse(api: EffortResponse): Effort {
  return {
    id: api.id,
    organization_slug: '',
    name: api.name,
    description: api.description || null,
    status: api.status as 'not_started' | 'in_progress' | 'completed',
    order_index: api.orderIndex,
    icon: api.icon || null,
    color: api.color || null,
    estimated_days: api.estimatedDays || null,
    created_at: api.createdAt,
    updated_at: api.updatedAt,
  };
}

function mapProjectResponse(api: ProjectResponse): Project {
  return {
    id: api.id,
    effort_id: api.effortId,
    name: api.name,
    description: api.description || null,
    status: api.status as 'not_started' | 'in_progress' | 'completed' | 'blocked',
    order_index: api.orderIndex,
    created_at: api.createdAt,
    updated_at: api.updatedAt,
  };
}

function mapTaskResponse(api: TaskResponse): Task {
  return {
    id: api.id,
    project_id: api.projectId,
    title: api.title,
    description: api.description || null,
    status: api.status as 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped',
    assignee_id: null, // Not in API response yet
    due_date: null, // Not in API response yet
    order_index: api.orderIndex,
    documentation_url: api.documentationUrl || null,
    is_milestone: api.isMilestone,
    created_at: api.createdAt,
    updated_at: api.updatedAt,
  };
}

export function useOrchFlow(teamId?: string | null) {
  const { user } = useAuth();
  const [efforts, setEfforts] = useState<Effort[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all efforts for the team
  const fetchEfforts = useCallback(async () => {
    if (!user || !teamId) return;

    try {
      const data = await flowApiService.getEfforts(teamId);
      setEfforts(data.map(mapEffortResponse));
      setError(null);
    } catch (err) {
      console.error('Error fetching efforts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch efforts');
      setEfforts([]);
    }
  }, [user, teamId]);

  // Fetch projects for a specific effort
  const fetchProjects = useCallback(async (effortId?: string) => {
    if (!user || !teamId) return;

    try {
      const data = await flowApiService.getProjects(teamId, effortId);
      setProjects(data.map(mapProjectResponse));
      setError(null);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      setProjects([]);
    }
  }, [user, teamId]);

  // Fetch tasks for a specific project
  const fetchTasks = useCallback(async (projectId?: string) => {
    if (!user || !teamId) return;

    try {
      const data = await flowApiService.getTasks(teamId, projectId);
      setTasks(data.map(mapTaskResponse));
      setError(null);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
      setTasks([]);
    }
  }, [user, teamId]);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchEfforts(), fetchProjects(), fetchTasks()]);
    setLoading(false);
  }, [fetchEfforts, fetchProjects, fetchTasks]);

  // CRUD for Efforts
  const createEffort = async (effort: Omit<Effort, 'id' | 'created_at' | 'updated_at'>) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      const data = await flowApiService.createEffort(teamId, {
        name: effort.name,
        description: effort.description || undefined,
        status: effort.status,
        orderIndex: effort.order_index,
        icon: effort.icon || undefined,
        color: effort.color || undefined,
        estimatedDays: effort.estimated_days || undefined,
      });
      await fetchEfforts();
      return mapEffortResponse(data);
    } catch (error) {
      console.error('Error creating effort:', error);
      throw error;
    }
  };

  const updateEffort = async (id: string, updates: Partial<Effort>) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      await flowApiService.updateEffort(teamId, id, {
        name: updates.name,
        description: updates.description || undefined,
        status: updates.status,
        orderIndex: updates.order_index,
        icon: updates.icon || undefined,
        color: updates.color || undefined,
        estimatedDays: updates.estimated_days || undefined,
      });
      await fetchEfforts();
    } catch (error) {
      console.error('Error updating effort:', error);
      throw error;
    }
  };

  const deleteEffort = async (id: string) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      await flowApiService.deleteEffort(teamId, id);
      await fetchEfforts();
    } catch (error) {
      console.error('Error deleting effort:', error);
      throw error;
    }
  };

  // CRUD for Projects
  const createProject = async (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      const data = await flowApiService.createProject(teamId, {
        name: project.name,
        effortId: project.effort_id,
        description: project.description || undefined,
        status: project.status,
        orderIndex: project.order_index,
      });
      await fetchProjects();
      return mapProjectResponse(data);
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      await flowApiService.updateProject(teamId, id, {
        name: updates.name,
        description: updates.description || undefined,
        status: updates.status,
        orderIndex: updates.order_index,
      });
      await fetchProjects();
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  };

  const deleteProject = async (id: string) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      await flowApiService.deleteProject(teamId, id);
      await fetchProjects();
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  };

  // CRUD for Tasks
  const createTask = async (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      const data = await flowApiService.createTask(teamId, {
        title: task.title,
        projectId: task.project_id,
        description: task.description || undefined,
        status: task.status,
        orderIndex: task.order_index,
        documentationUrl: task.documentation_url || undefined,
        isMilestone: task.is_milestone,
      });
      await fetchTasks();
      return mapTaskResponse(data);
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      await flowApiService.updateTask(teamId, id, {
        title: updates.title,
        description: updates.description || undefined,
        status: updates.status,
        orderIndex: updates.order_index,
        documentationUrl: updates.documentation_url || undefined,
        isMilestone: updates.is_milestone,
      });
      await fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  };

  const deleteTask = async (id: string) => {
    if (!teamId) {
      throw new Error('teamId is required');
    }
    try {
      await flowApiService.deleteTask(teamId, id);
      await fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  };

  // Update task status (common operation)
  const updateTaskStatus = async (id: string, status: Task['status']) => {
    await updateTask(id, { status });
  };

  // Load data on mount
  useEffect(() => {
    if (user && teamId) {
      fetchAll();
    } else {
      setLoading(false);
    }
  }, [user, teamId, fetchAll]);

  return {
    // Data
    efforts,
    projects,
    tasks,
    loading,
    error,

    // Fetch functions
    fetchEfforts,
    fetchProjects,
    fetchTasks,
    fetchAll,

    // Effort CRUD
    createEffort,
    updateEffort,
    deleteEffort,

    // Project CRUD
    createProject,
    updateProject,
    deleteProject,

    // Task CRUD
    createTask,
    updateTask,
    deleteTask,
    updateTaskStatus,
  };
}
