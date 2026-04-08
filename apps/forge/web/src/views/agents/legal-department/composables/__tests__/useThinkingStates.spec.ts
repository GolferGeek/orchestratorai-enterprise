/**
 * Unit tests for useThinkingStates composable (Phase 4).
 *
 * Covers the reasoning-phase state machine:
 * 1. Events without thinking types → no entries in the map.
 * 2. thinking_started event → stage transitions to 'reasoning'.
 * 3. thinking_completed event after thinking_started → stage transitions to 'writing'.
 * 4. Stage that is 'done' (not active) → thinking overlay is suppressed.
 * 5. No regression to 'reasoning' after 'writing' has been set.
 */

import { describe, it, expect } from 'vitest';
import { ref, type Ref } from 'vue';
import { useThinkingStates } from '../useThinkingStates';
import type { ObservabilityEvent } from '../../legalJobsService';
import type { StageState } from '@orchestrator-ai/transport-types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeStage(
  id: string,
  state: StageState['state'],
): StageState {
  return { id, label: id, state };
}

function makeThinkingEvent(
  hookType: 'agent.llm.thinking_started' | 'agent.llm.thinking_completed',
  callerName: string,
): ObservabilityEvent {
  return {
    hook_event_type: hookType,
    step: 'llm',
    payload: { callerName },
    timestamp: Date.now(),
  };
}

function makeNonThinkingEvent(step: string): ObservabilityEvent {
  return {
    hook_event_type: 'langgraph.processing',
    step,
    timestamp: Date.now(),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useThinkingStates', () => {
  it('returns empty map when there are no events', () => {
    const events = ref<ObservabilityEvent[]>([]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('contract', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value).toEqual({});
  });

  it('returns empty map when events do not include thinking events', () => {
    const events = ref<ObservabilityEvent[]>([
      makeNonThinkingEvent('contract_agent'),
      makeNonThinkingEvent('contract_agent_llm_call'),
    ]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('contract', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value).toEqual({});
  });

  it("sets stage to 'reasoning' when thinking_started event arrives", () => {
    const events = ref<ObservabilityEvent[]>([
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:contract-agent'),
    ]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('contract', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['contract']).toBe('reasoning');
  });

  it("sets stage to 'writing' after thinking_completed follows thinking_started", () => {
    const events = ref<ObservabilityEvent[]>([
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:contract-agent'),
      makeThinkingEvent('agent.llm.thinking_completed', 'legal-department:contract-agent'),
    ]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('contract', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['contract']).toBe('writing');
  });

  it('suppresses thinking overlay when stage is not active (done)', () => {
    const events = ref<ObservabilityEvent[]>([
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:contract-agent'),
    ]) as Ref<ObservabilityEvent[]>;
    // Stage is 'done' — walker has already completed it
    const stages = ref<StageState[]>([makeStage('contract', 'done')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['contract']).toBeUndefined();
  });

  it('does not regress from writing back to reasoning on a duplicate thinking_started', () => {
    const events = ref<ObservabilityEvent[]>([
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:contract-agent'),
      makeThinkingEvent('agent.llm.thinking_completed', 'legal-department:contract-agent'),
      // A second thinking_started should NOT regress to 'reasoning'
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:contract-agent'),
    ]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('contract', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['contract']).toBe('writing');
  });

  it('handles synthesis callerName → synthesize stage id', () => {
    const events = ref<ObservabilityEvent[]>([
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:synthesis'),
    ]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('synthesize', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['synthesize']).toBe('reasoning');
  });

  it('handles report-generation callerName → report stage id', () => {
    const events = ref<ObservabilityEvent[]>([
      makeThinkingEvent('agent.llm.thinking_completed', 'legal-department:report-generation'),
    ]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('report', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['report']).toBe('writing');
  });

  it('handles real_estate callerName with hyphen-to-underscore normalisation', () => {
    const events = ref<ObservabilityEvent[]>([
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:real-estate-agent'),
    ]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('real_estate', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['real_estate']).toBe('reasoning');
  });

  it('is reactive — updates when events ref gains new events', () => {
    const events = ref<ObservabilityEvent[]>([]) as Ref<ObservabilityEvent[]>;
    const stages = ref<StageState[]>([makeStage('compliance', 'active')]) as Ref<StageState[]>;

    const thinking = useThinkingStates(events, stages);
    expect(thinking.value['compliance']).toBeUndefined();

    // Simulate a live SSE event arriving
    events.value = [
      makeThinkingEvent('agent.llm.thinking_started', 'legal-department:compliance-agent'),
    ];
    expect(thinking.value['compliance']).toBe('reasoning');
  });
});
