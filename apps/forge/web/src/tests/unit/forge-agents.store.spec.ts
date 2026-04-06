/**
 * forge-agents.store.spec.ts
 *
 * Unit tests for the Forge Agents Pinia store.
 * Tests all state mutations, computed getters, and edge cases.
 *
 * No API calls — the store is state-only by design.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useForgeAgentsStore,
  type AgentType,
  type PipelineStep,
} from '@/stores/forge-agents.store';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const AGENT: AgentType = 'marketing-swarm';
const TASK_ID = 'task-abc-123';
const PROMPT = 'Write a campaign for Q4 product launch';

function makeStep(id: string, status: PipelineStep['status'] = 'pending'): PipelineStep {
  return { id, name: `Step ${id}`, status };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useForgeAgentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty activeTasks', () => {
      const store = useForgeAgentsStore();
      expect(store.activeTasks).toEqual({});
    });

    it('starts with empty sseConnected map', () => {
      const store = useForgeAgentsStore();
      expect(store.sseConnected).toEqual({});
    });

    it('starts with empty loading map', () => {
      const store = useForgeAgentsStore();
      expect(store.loading).toEqual({});
    });

    it('starts with empty errors map', () => {
      const store = useForgeAgentsStore();
      expect(store.errors).toEqual({});
    });
  });

  // ─── setTaskStarted ───────────────────────────────────────────────────

  describe('setTaskStarted', () => {
    it('creates a pending task for the given agent type', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);

      const task = store.activeTasks[AGENT];
      expect(task).toBeDefined();
      expect(task?.taskId).toBe(TASK_ID);
      expect(task?.agentType).toBe(AGENT);
      expect(task?.status).toBe('pending');
      expect(task?.prompt).toBe(PROMPT);
      expect(task?.steps).toEqual([]);
    });

    it('sets loading to true for that agent', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      expect(store.loading[AGENT]).toBe(true);
    });

    it('clears any prior error for that agent', () => {
      const store = useForgeAgentsStore();
      store.setError(AGENT, 'previous error');
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      expect(store.errors[AGENT]).toBeNull();
    });

    it('records a startedAt ISO timestamp', () => {
      const before = new Date().toISOString();
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      const after = new Date().toISOString();

      const startedAt = store.activeTasks[AGENT]?.startedAt ?? '';
      expect(startedAt >= before).toBe(true);
      expect(startedAt <= after).toBe(true);
    });
  });

  // ─── setTaskRunning ───────────────────────────────────────────────────

  describe('setTaskRunning', () => {
    it('transitions status from pending to running', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskRunning(AGENT);
      expect(store.activeTasks[AGENT]?.status).toBe('running');
    });

    it('is a no-op when no active task exists for that agent', () => {
      const store = useForgeAgentsStore();
      // Should not throw
      expect(() => store.setTaskRunning(AGENT)).not.toThrow();
    });
  });

  // ─── updatePipelineStep ───────────────────────────────────────────────

  describe('updatePipelineStep', () => {
    it('appends a new step when step id is unseen', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.updatePipelineStep(AGENT, makeStep('step-1'));

      expect(store.activeTasks[AGENT]?.steps).toHaveLength(1);
      expect(store.activeTasks[AGENT]?.steps[0].id).toBe('step-1');
    });

    it('updates an existing step in-place (does not duplicate)', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.updatePipelineStep(AGENT, makeStep('step-1', 'running'));
      store.updatePipelineStep(AGENT, makeStep('step-1', 'completed'));

      const steps = store.activeTasks[AGENT]?.steps ?? [];
      expect(steps).toHaveLength(1);
      expect(steps[0].status).toBe('completed');
    });

    it('appends multiple distinct steps', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.updatePipelineStep(AGENT, makeStep('step-1'));
      store.updatePipelineStep(AGENT, makeStep('step-2'));

      expect(store.activeTasks[AGENT]?.steps).toHaveLength(2);
    });

    it('is a no-op when no task exists for the agent', () => {
      const store = useForgeAgentsStore();
      // Should not throw
      expect(() => store.updatePipelineStep(AGENT, makeStep('step-1'))).not.toThrow();
    });
  });

  // ─── setTaskHitlWaiting ───────────────────────────────────────────────

  describe('setTaskHitlWaiting', () => {
    it('sets status to hitl-waiting and records the question', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskHitlWaiting(AGENT, 'Should we proceed with version B?');

      const task = store.activeTasks[AGENT];
      expect(task?.status).toBe('hitl-waiting');
      expect(task?.hitlPending).toBe(true);
      expect(task?.hitlQuestion).toBe('Should we proceed with version B?');
    });

    it('sets loading to false', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskHitlWaiting(AGENT, 'Confirm?');
      expect(store.loading[AGENT]).toBe(false);
    });
  });

  // ─── setTaskCompleted ─────────────────────────────────────────────────

  describe('setTaskCompleted', () => {
    it('marks the task completed and stores the result', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      const result = { headline: 'Campaign ready' };
      store.setTaskCompleted(AGENT, result);

      const task = store.activeTasks[AGENT];
      expect(task?.status).toBe('completed');
      expect(task?.result).toEqual(result);
      expect(task?.hitlPending).toBe(false);
    });

    it('sets loading and sseConnected to false', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setSseConnected(AGENT, true);
      store.setTaskCompleted(AGENT, null);

      expect(store.loading[AGENT]).toBe(false);
      expect(store.sseConnected[AGENT]).toBe(false);
    });

    it('records a completedAt timestamp', () => {
      const before = new Date().toISOString();
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskCompleted(AGENT, null);
      const after = new Date().toISOString();

      const completedAt = store.activeTasks[AGENT]?.completedAt ?? '';
      expect(completedAt >= before).toBe(true);
      expect(completedAt <= after).toBe(true);
    });
  });

  // ─── setTaskFailed ────────────────────────────────────────────────────

  describe('setTaskFailed', () => {
    it('marks the task failed and records the error message', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskFailed(AGENT, 'Network timeout');

      const task = store.activeTasks[AGENT];
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('Network timeout');
    });

    it('propagates the error to the errors map', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskFailed(AGENT, 'LangGraph error');
      expect(store.errors[AGENT]).toBe('LangGraph error');
    });

    it('sets loading and sseConnected to false', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setSseConnected(AGENT, true);
      store.setTaskFailed(AGENT, 'Error');

      expect(store.loading[AGENT]).toBe(false);
      expect(store.sseConnected[AGENT]).toBe(false);
    });
  });

  // ─── setSseConnected ──────────────────────────────────────────────────

  describe('setSseConnected', () => {
    it('sets SSE connection state to true', () => {
      const store = useForgeAgentsStore();
      store.setSseConnected(AGENT, true);
      expect(store.sseConnected[AGENT]).toBe(true);
    });

    it('sets SSE connection state to false', () => {
      const store = useForgeAgentsStore();
      store.setSseConnected(AGENT, true);
      store.setSseConnected(AGENT, false);
      expect(store.sseConnected[AGENT]).toBe(false);
    });
  });

  // ─── setLoading / setError ────────────────────────────────────────────

  describe('setLoading', () => {
    it('sets loading state for a specific agent', () => {
      const store = useForgeAgentsStore();
      store.setLoading(AGENT, true);
      expect(store.loading[AGENT]).toBe(true);
      store.setLoading(AGENT, false);
      expect(store.loading[AGENT]).toBe(false);
    });
  });

  describe('setError', () => {
    it('sets an error string for a specific agent', () => {
      const store = useForgeAgentsStore();
      store.setError(AGENT, 'Something went wrong');
      expect(store.errors[AGENT]).toBe('Something went wrong');
    });

    it('clears error by setting null', () => {
      const store = useForgeAgentsStore();
      store.setError(AGENT, 'err');
      store.setError(AGENT, null);
      expect(store.errors[AGENT]).toBeNull();
    });
  });

  // ─── clearTask ────────────────────────────────────────────────────────

  describe('clearTask', () => {
    it('removes the task and associated state for one agent', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setSseConnected(AGENT, true);
      store.setError(AGENT, 'oops');

      store.clearTask(AGENT);

      expect(store.activeTasks[AGENT]).toBeUndefined();
      expect(store.loading[AGENT]).toBeUndefined();
      expect(store.errors[AGENT]).toBeUndefined();
      expect(store.sseConnected[AGENT]).toBeUndefined();
    });

    it('does not affect tasks for other agent types', () => {
      const store = useForgeAgentsStore();
      const other: AgentType = 'legal-department';
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskStarted(other, 'task-other', 'Analyze contract');

      store.clearTask(AGENT);

      expect(store.activeTasks[other]).toBeDefined();
    });
  });

  // ─── clearAll ─────────────────────────────────────────────────────────

  describe('clearAll', () => {
    it('resets all state maps to empty objects', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskStarted('legal-department', 'task-2', 'Contract review');
      store.setSseConnected(AGENT, true);
      store.setError('legal-department', 'err');

      store.clearAll();

      expect(store.activeTasks).toEqual({});
      expect(store.loading).toEqual({});
      expect(store.errors).toEqual({});
      expect(store.sseConnected).toEqual({});
    });
  });

  // ─── Computed getters ─────────────────────────────────────────────────

  describe('getTaskForAgent (computed)', () => {
    it('returns the active task for an agent type', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      const task = store.getTaskForAgent(AGENT);
      expect(task?.taskId).toBe(TASK_ID);
    });

    it('returns null when no task exists for that agent', () => {
      const store = useForgeAgentsStore();
      expect(store.getTaskForAgent(AGENT)).toBeNull();
    });
  });

  describe('isAgentRunning (computed)', () => {
    it('returns true when task status is running', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskRunning(AGENT);
      expect(store.isAgentRunning(AGENT)).toBe(true);
    });

    it('returns true when task status is pending', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      expect(store.isAgentRunning(AGENT)).toBe(true);
    });

    it('returns false when task is completed', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskCompleted(AGENT, null);
      expect(store.isAgentRunning(AGENT)).toBe(false);
    });

    it('returns false when no task exists', () => {
      const store = useForgeAgentsStore();
      expect(store.isAgentRunning(AGENT)).toBe(false);
    });
  });

  describe('isHitlWaiting (computed)', () => {
    it('returns true when task status is hitl-waiting', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskHitlWaiting(AGENT, 'Approve?');
      expect(store.isHitlWaiting(AGENT)).toBe(true);
    });

    it('returns false when task is running', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted(AGENT, TASK_ID, PROMPT);
      store.setTaskRunning(AGENT);
      expect(store.isHitlWaiting(AGENT)).toBe(false);
    });

    it('returns false when no task exists', () => {
      const store = useForgeAgentsStore();
      expect(store.isHitlWaiting(AGENT)).toBe(false);
    });
  });

  // ─── Multi-agent isolation ────────────────────────────────────────────

  describe('multi-agent isolation', () => {
    it('tracks separate task state for each agent type', () => {
      const store = useForgeAgentsStore();
      const agents: AgentType[] = [
        'marketing-swarm',
        'legal-department',
        'cad-agent',
      ];

      agents.forEach((a, i) => {
        store.setTaskStarted(a, `task-${i}`, `Prompt for ${a}`);
      });

      agents.forEach((a, i) => {
        expect(store.activeTasks[a]?.taskId).toBe(`task-${i}`);
      });
    });

    it('completing one agent task does not affect others', () => {
      const store = useForgeAgentsStore();
      store.setTaskStarted('marketing-swarm', 'task-1', 'P1');
      store.setTaskStarted('legal-department', 'task-2', 'P2');

      store.setTaskCompleted('marketing-swarm', { done: true });

      expect(store.activeTasks['marketing-swarm']?.status).toBe('completed');
      expect(store.activeTasks['legal-department']?.status).toBe('pending');
    });
  });
});
