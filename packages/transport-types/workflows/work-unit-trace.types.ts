/**
 * A run's trace: its work units (structured steps) and the agent calls in
 * each, as the trace API returns them. Inputs and outputs are trace refs:
 * bounded copies that say when they were cut.
 */
import type { JsonValue } from '../shared/json.types';

export type WorkUnitPattern = 'solo' | 'panel' | 'red_blue' | 'arbitrated' | 'summarizer' | 'human';

export type WorkUnitStatus = 'running' | 'completed' | 'completed_partial' | 'failed';

export type ParticipantStatus = 'running' | 'completed' | 'failed';

/** A bounded copy of a value; `truncated` says whether anything was cut. */
export interface TraceRef {
  truncated: boolean;
  value: JsonValue;
}

export interface ParticipantSummary {
  participantId: string;
  position: number;
  stage: string;
  agentSlug: string;
  agentVersion: number | null;
  provider: string | null;
  model: string | null;
  status: ParticipantStatus;
  error: string | null;
  durationMs: number | null;
}

export interface WorkUnitTrace {
  workUnitId: string;
  slug: string;
  pattern: WorkUnitPattern;
  status: WorkUnitStatus;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  participants: ParticipantSummary[];
}

export interface RunTrace {
  runId: string;
  workUnits: WorkUnitTrace[];
}

export interface ParticipantDetail extends ParticipantSummary {
  workUnitId: string;
  modelRole: string | null;
  input: TraceRef | null;
  output: TraceRef | null;
  /** The model's answer as received, kept when it broke the agent's contract. */
  rawOutput: string | null;
  usage: {
    llmRequestId: string;
    inputTokens: number | null;
    outputTokens: number | null;
    cost: number | null;
    thinking: string | null;
    thinkingDurationMs: number | null;
  } | null;
}
