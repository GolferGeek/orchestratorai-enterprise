/**
 * Forge Agents Store
 *
 * State management for complex LangGraph agent interactions in Forge Web.
 * Tracks active task state, SSE connection status, and pipeline progress
 * for: marketing-swarm, legal-department, cad-agent.
 *
 * Three-layer architecture:
 *   Component (view) → THIS STORE (state only) → forge-api.service (HTTP)
 *
 * Rules:
 * - State ONLY — no async, no API calls, no business logic
 * - Services call store mutations after API success
 * - ExecutionContext is NEVER constructed here; it comes from executionContextStore
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentType = 'marketing-swarm' | 'legal-department' | 'cad-agent';

export type TaskStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'hitl-waiting'
  | 'completed'
  | 'failed';

export interface PipelineStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

export interface AgentTask {
  taskId: string;
  agentType: AgentType;
  status: TaskStatus;
  prompt: string;
  steps: PipelineStep[];
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
  hitlPending?: boolean;
  hitlQuestion?: string;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useForgeAgentsStore = defineStore('forge-agents', () => {
  // Active task per agent type
  const activeTasks = ref<Partial<Record<AgentType, AgentTask>>>({});

  // SSE connection state per agent type
  const sseConnected = ref<Partial<Record<AgentType, boolean>>>({});

  // Loading state per agent type
  const loading = ref<Partial<Record<AgentType, boolean>>>({});

  // Error state per agent type
  const errors = ref<Partial<Record<AgentType, string | null>>>({});

  // ─── Computed ─────────────────────────────────────────────────────────────

  const getTaskForAgent = computed(() => (agentType: AgentType) =>
    activeTasks.value[agentType] ?? null,
  );

  const isAgentRunning = computed(() => (agentType: AgentType) => {
    const task = activeTasks.value[agentType];
    return task?.status === 'running' || task?.status === 'pending';
  });

  const isHitlWaiting = computed(() => (agentType: AgentType) => {
    const task = activeTasks.value[agentType];
    return task?.status === 'hitl-waiting';
  });

  // ─── Mutations (synchronous only) ─────────────────────────────────────────

  function setTaskStarted(agentType: AgentType, taskId: string, prompt: string) {
    activeTasks.value[agentType] = {
      taskId,
      agentType,
      status: 'pending',
      prompt,
      steps: [],
      startedAt: new Date().toISOString(),
    };
    loading.value[agentType] = true;
    errors.value[agentType] = null;
  }

  function setTaskRunning(agentType: AgentType) {
    const task = activeTasks.value[agentType];
    if (task) {
      task.status = 'running';
    }
  }

  function updatePipelineStep(agentType: AgentType, step: PipelineStep) {
    const task = activeTasks.value[agentType];
    if (!task) return;

    const existing = task.steps.findIndex((s) => s.id === step.id);
    if (existing >= 0) {
      task.steps[existing] = step;
    } else {
      task.steps.push(step);
    }
  }

  function setTaskHitlWaiting(agentType: AgentType, question: string) {
    const task = activeTasks.value[agentType];
    if (task) {
      task.status = 'hitl-waiting';
      task.hitlPending = true;
      task.hitlQuestion = question;
    }
    loading.value[agentType] = false;
  }

  function setTaskCompleted(agentType: AgentType, result: unknown) {
    const task = activeTasks.value[agentType];
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date().toISOString();
      task.hitlPending = false;
    }
    loading.value[agentType] = false;
    sseConnected.value[agentType] = false;
  }

  function setTaskFailed(agentType: AgentType, error: string) {
    const task = activeTasks.value[agentType];
    if (task) {
      task.status = 'failed';
      task.error = error;
      task.completedAt = new Date().toISOString();
    }
    loading.value[agentType] = false;
    errors.value[agentType] = error;
    sseConnected.value[agentType] = false;
  }

  function setSseConnected(agentType: AgentType, connected: boolean) {
    sseConnected.value[agentType] = connected;
  }

  function setLoading(agentType: AgentType, isLoading: boolean) {
    loading.value[agentType] = isLoading;
  }

  function setError(agentType: AgentType, error: string | null) {
    errors.value[agentType] = error;
  }

  function clearTask(agentType: AgentType) {
    delete activeTasks.value[agentType];
    delete loading.value[agentType];
    delete errors.value[agentType];
    delete sseConnected.value[agentType];
  }

  function clearAll() {
    activeTasks.value = {};
    loading.value = {};
    errors.value = {};
    sseConnected.value = {};
  }

  return {
    // State
    activeTasks,
    sseConnected,
    loading,
    errors,

    // Computed
    getTaskForAgent,
    isAgentRunning,
    isHitlWaiting,

    // Mutations
    setTaskStarted,
    setTaskRunning,
    updatePipelineStep,
    setTaskHitlWaiting,
    setTaskCompleted,
    setTaskFailed,
    setSseConnected,
    setLoading,
    setError,
    clearTask,
    clearAll,
  };
});
