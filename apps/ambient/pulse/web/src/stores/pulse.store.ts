import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '../composables/useApi';

export interface ListenerStatus {
  id: string;
  type: string;
  name: string;
  active: boolean;
  lastFiredAt: string | null;
  firingCount: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  steps: Array<{ id: string; name: string; action: string }>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  outcome: Record<string, unknown> | null;
  error: string | null;
}

export interface TriggerDefinition {
  id: string;
  name: string;
  sourceType: string;
  enabled: boolean;
  lastFiredAt: string | null;
  cooldownSeconds: number;
  executionCount: number;
}

export interface ExecutionRecord {
  id: string;
  triggerName: string;
  sourceType: string;
  firedAt: string;
  status: 'completed' | 'failed' | 'skipped' | 'pending';
  durationMs: number | null;
  skipReason: string | null;
  executionContext: Record<string, unknown> | null;
  sourceEvent: Record<string, unknown> | null;
  a2aResponse: Record<string, unknown> | null;
}

export const usePulseStore = defineStore('pulse', () => {
  const { pulseApi } = useApi();

  const listeners = ref<ListenerStatus[]>([]);
  const workflows = ref<WorkflowDefinition[]>([]);
  const workflowRuns = ref<WorkflowRun[]>([]);
  const triggers = ref<TriggerDefinition[]>([]);
  const executions = ref<ExecutionRecord[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchListeners(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      listeners.value = await pulseApi.get<ListenerStatus[]>('/listeners');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchWorkflows(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      workflows.value = await pulseApi.get<WorkflowDefinition[]>('/workflows');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchWorkflowRuns(): Promise<void> {
    try {
      workflowRuns.value = await pulseApi.get<WorkflowRun[]>('/workflows/runs');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  async function fetchTriggers(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const raw = await pulseApi.get<Record<string, unknown>[]>('/triggers');
      triggers.value = raw.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        sourceType: (r.source_type ?? r.sourceType) as string,
        enabled: r.enabled as boolean,
        lastFiredAt: (r.last_fired_at ?? r.lastFiredAt ?? null) as string | null,
        cooldownSeconds: (r.cooldown_seconds ?? r.cooldownSeconds ?? 0) as number,
        executionCount: (r.execution_count ?? r.executionCount ?? 0) as number,
      }));
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchExecutions(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const raw = await pulseApi.get<Record<string, unknown>[]>('/executions');
      executions.value = raw.map((r) => ({
        id: r.id as string,
        triggerName: (r.trigger_name ?? r.triggerName) as string,
        sourceType: (r.source_type ?? r.sourceType) as string,
        firedAt: (r.fired_at ?? r.firedAt) as string,
        status: (r.status as ExecutionRecord['status']),
        durationMs: (r.duration_ms ?? r.durationMs ?? null) as number | null,
        skipReason: (r.skip_reason ?? r.skipReason ?? null) as string | null,
        executionContext: (r.execution_context ?? r.executionContext ?? null) as Record<string, unknown> | null,
        sourceEvent: (r.source_event ?? r.sourceEvent ?? null) as Record<string, unknown> | null,
        a2aResponse: (r.a2a_response ?? r.a2aResponse ?? null) as Record<string, unknown> | null,
      }));
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function toggleTrigger(id: string, enabled: boolean): Promise<void> {
    await pulseApi.patch(`/triggers/${id}`, { enabled });
    const trigger = triggers.value.find((t) => t.id === id);
    if (trigger) {
      trigger.enabled = enabled;
    }
  }

  async function executeWorkflow(workflowId: string, triggerData?: Record<string, unknown>): Promise<WorkflowRun> {
    const run = await pulseApi.post<WorkflowRun>(`/workflows/${workflowId}/execute`, {
      triggerData,
    });
    workflowRuns.value.unshift(run);
    return run;
  }

  async function simulateDbEvent(
    table: string,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await pulseApi.post('/listeners/simulate/db', { table, eventType, payload });
  }

  async function simulateFileEvent(
    path: string,
    eventType: 'created' | 'modified' | 'deleted',
  ): Promise<void> {
    await pulseApi.post('/listeners/simulate/file', { path, eventType });
  }

  return {
    listeners,
    workflows,
    workflowRuns,
    triggers,
    executions,
    loading,
    error,
    fetchListeners,
    fetchWorkflows,
    fetchWorkflowRuns,
    fetchTriggers,
    fetchExecutions,
    toggleTrigger,
    executeWorkflow,
    simulateDbEvent,
    simulateFileEvent,
  };
});
