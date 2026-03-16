import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { flowApiService, EffortResponse, ProjectResponse, TaskResponse } from "@/services/flowApiService";

export interface Effort {
  id: string;
  organization_slug: string | null;
  team_id: string | null;
  name: string;
  description: string | null;
  status?: string;
  order_index: number;
  icon?: string | null;
  color?: string | null;
  estimated_days?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface Goal {
  id: string;
  effort_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Project {
  id: string;
  effort_id: string; // Projects link directly to efforts
  name: string;
  description: string | null;
  status?: string;
  order_index: number;
  created_at: string;
  updated_at?: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  order_index: number;
  created_at: string;
  updated_at?: string;
}

// Helper to map API response to hook interface
function mapEffortResponse(api: EffortResponse): Effort {
  return {
    id: api.id,
    organization_slug: null,
    team_id: api.teamId || null,
    name: api.name,
    description: api.description || null,
    status: api.status,
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
    status: api.status,
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
    status: api.status,
    order_index: api.orderIndex,
    created_at: api.createdAt,
    updated_at: api.updatedAt,
  };
}

export function useHierarchy(teamId?: string | null) {
  const { user } = useAuth();
  const [efforts, setEfforts] = useState<Effort[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!teamId) {
      console.log("[fetchAll] No teamId provided, skipping fetch");
      setEfforts([]);
      setGoals([]);
      setProjects([]);
      setLoading(false);
      return;
    }

    console.log("[fetchAll] Starting... teamId:", teamId);

    try {
      // Fetch efforts for the team
      const effortsRes = await flowApiService.getEfforts(teamId);
      console.log("[fetchAll] Efforts result:", effortsRes);

      const fetchedEfforts = effortsRes.map(mapEffortResponse);
      console.log("[fetchAll] Setting efforts:", fetchedEfforts.length, "items");
      setEfforts(fetchedEfforts);

      if (fetchedEfforts.length === 0) {
        setGoals([]);
        setProjects([]);
        setLoading(false);
        return;
      }

      // Fetch projects for these efforts (no goals layer)
      const effortIds = fetchedEfforts.map((e) => e.id);
      const allProjects: Project[] = [];
      
      // Fetch projects for each effort
      for (const effortId of effortIds) {
        try {
          const projectsRes = await flowApiService.getProjects(teamId, effortId);
          allProjects.push(...projectsRes.map(mapProjectResponse));
        } catch (error) {
          console.error(`[fetchAll] Error fetching projects for effort ${effortId}:`, error);
        }
      }

      console.log(
        "[fetchAll] Setting projects:",
        allProjects.length,
        "items",
      );

      // Direct mapping: DB projects = UI projects
      setProjects(allProjects);
      setGoals([]); // No goals layer

      // Fetch all tasks for all projects
      const tasksData = await flowApiService.getTasks(teamId);
      const mappedTasks = tasksData.map(mapTaskResponse);
      setTasks(mappedTasks);
      console.log("[fetchAll] Setting tasks:", mappedTasks.length, "items");
    } catch (error) {
      console.error("[fetchAll] Error fetching hierarchy:", error);
      setEfforts([]);
      setGoals([]);
      setProjects([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchAll();
    // Note: Realtime subscriptions removed - using API instead of direct Supabase
    // Can add polling or websockets later if needed
  }, [fetchAll]);

  // CRUD operations - refetch after each mutation for immediate UI update
  const addEffort = async (name: string) => {
    console.log("[addEffort] Starting with name:", name);

    if (!user || !teamId) {
      console.error("[addEffort] User not authenticated or teamId missing");
      return { data: null, error: new Error("User not authenticated or teamId missing") };
    }

    try {
      const data = await flowApiService.createEffort(teamId, {
        name,
        orderIndex: 0,
      });
      console.log("[addEffort] Success, calling fetchAll");
      fetchAll();
      return { data: mapEffortResponse(data), error: null };
    } catch (error) {
      console.error("[addEffort] Error:", error);
      return { data: null, error: error as Error };
    }
  };

  const updateEffort = async (id: string, name: string) => {
    if (!teamId) {
      return { error: new Error("teamId missing") };
    }
    try {
      await flowApiService.updateEffort(teamId, id, { name });
      fetchAll();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const deleteEffort = async (id: string) => {
    if (!teamId) {
      return { error: new Error("teamId missing") };
    }
    try {
      await flowApiService.deleteEffort(teamId, id);
      fetchAll();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const addGoal = async (effortId: string, name: string) => {
    // In Flow schema, projects ARE goals
    if (!teamId) {
      return { data: null, error: new Error("teamId missing") };
    }
    try {
      const data = await flowApiService.createProject(teamId, {
        name,
        effortId,
        orderIndex: 0,
      });
      fetchAll();
      return { data: mapProjectResponse(data), error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  };

  const updateGoal = async (id: string, name: string) => {
    // In Flow schema, projects ARE goals
    if (!teamId) {
      return { error: new Error("teamId missing") };
    }
    try {
      await flowApiService.updateProject(teamId, id, { name });
      fetchAll();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const deleteGoal = async (id: string) => {
    // In Flow schema, projects ARE goals
    if (!teamId) {
      return { error: new Error("teamId missing") };
    }
    try {
      await flowApiService.deleteProject(teamId, id);
      fetchAll();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const addProject = async (effortId: string, name: string) => {
    if (!teamId) {
      return { data: null, error: new Error("teamId missing") };
    }
    try {
      const data = await flowApiService.createProject(teamId, {
        name,
        effortId,
        orderIndex: 0,
      });
      fetchAll();
      return { data: mapProjectResponse(data), error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  };

  const updateProject = async (id: string, name: string) => {
    if (!teamId) {
      return { error: new Error("teamId missing") };
    }
    try {
      await flowApiService.updateProject(teamId, id, { name });
      fetchAll();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const deleteProject = async (id: string) => {
    if (!teamId) {
      return { error: new Error("teamId missing") };
    }
    try {
      await flowApiService.deleteProject(teamId, id);
      fetchAll();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const addTask = async (projectId: string, title: string, description?: string) => {
    if (!teamId) {
      return { data: null, error: new Error("teamId missing") };
    }
    try {
      const data = await flowApiService.createTask(teamId, {
        title,
        projectId,
        description,
        status: 'pending',
        orderIndex: 0,
      });
      fetchAll();
      return { data: mapTaskResponse(data), error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  };

  return {
    efforts,
    goals,
    projects,
    tasks,
    loading,
    addEffort,
    updateEffort,
    deleteEffort,
    addGoal,
    updateGoal,
    deleteGoal,
    addProject,
    updateProject,
    deleteProject,
    addTask,
  };
}
