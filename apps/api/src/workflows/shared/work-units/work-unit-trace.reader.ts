import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type ParticipantDetail,
  type ParticipantStatus,
  type ParticipantSummary,
  type TraceRef,
  type WorkUnitPattern,
  type WorkUnitStatus,
  type WorkUnitTrace,
} from '@orchestrator-ai/transport-types';

type Row = Record<string, unknown>;

function time(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Trace value "${String(value)}" is not a number`);
  return n;
}

function traceRefOrNull(value: unknown): TraceRef | null {
  return value === null || value === undefined ? null : (value as TraceRef);
}

function toParticipantSummary(row: Row): ParticipantSummary {
  return {
    participantId: String(row.id),
    position: Number(row.position),
    stage: String(row.stage),
    agentSlug: String(row.agent_slug),
    agentVersion: numberOrNull(row.agent_version),
    provider: textOrNull(row.provider),
    model: textOrNull(row.model),
    status: row.status as ParticipantStatus,
    error: textOrNull(row.error),
    durationMs: numberOrNull(row.duration_ms),
  };
}

/** Reads of a run's trace. The caller has already checked the run is readable. */
@Injectable()
export class WorkUnitTraceReader {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async units(runId: string): Promise<WorkUnitTrace[]> {
    const units = await this.db
      .from('workflows', 'work_unit_runs')
      .select('*')
      .eq('run_id', runId)
      .order('ordinal', { ascending: true });
    if (units.error) throw new Error(`Failed to read the trace of run ${runId}: ${units.error.message}`);
    const participants = await this.db
      .from('workflows', 'participant_runs')
      .select('*')
      .eq('run_id', runId)
      .order('position', { ascending: true });
    if (participants.error) {
      throw new Error(`Failed to read the participants of run ${runId}: ${participants.error.message}`);
    }
    const byUnit = new Map<string, ParticipantSummary[]>();
    for (const row of this.rows(participants.data)) {
      const unitId = String(row.work_unit_run_id);
      byUnit.set(unitId, [...(byUnit.get(unitId) ?? []), toParticipantSummary(row)]);
    }
    return this.rows(units.data).map((row) => ({
      workUnitId: String(row.id),
      slug: String(row.work_unit_slug),
      pattern: row.pattern as WorkUnitPattern,
      status: row.status as WorkUnitStatus,
      error: textOrNull(row.error),
      startedAt: String(time(row.started_at)),
      completedAt: time(row.completed_at),
      durationMs: numberOrNull(row.duration_ms),
      participants: byUnit.get(String(row.id)) ?? [],
    }));
  }

  /** One participant of the run, with its usage row joined by request id. */
  async participant(runId: string, participantId: string): Promise<ParticipantDetail | null> {
    const { data, error } = await this.db
      .from('workflows', 'participant_runs')
      .select('*')
      .eq('id', participantId)
      .eq('run_id', runId);
    if (error) throw new Error(`Failed to read participant ${participantId}: ${error.message}`);
    const row = this.rows(data)[0];
    if (!row) return null;

    const requestId = textOrNull(row.llm_request_id);
    let usage: ParticipantDetail['usage'] = null;
    if (requestId) {
      const found = await this.db
        .from(null, 'llm_usage')
        .select('input_tokens, output_tokens, total_cost, thinking_content, thinking_duration_ms')
        .eq('run_id', requestId);
      if (found.error) throw new Error(`Failed to read usage ${requestId}: ${found.error.message}`);
      const usageRow = this.rows(found.data)[0];
      usage = {
        llmRequestId: requestId,
        inputTokens: usageRow ? numberOrNull(usageRow.input_tokens) : null,
        outputTokens: usageRow ? numberOrNull(usageRow.output_tokens) : null,
        cost: usageRow ? numberOrNull(usageRow.total_cost) : null,
        thinking: usageRow ? textOrNull(usageRow.thinking_content) : null,
        thinkingDurationMs: usageRow ? numberOrNull(usageRow.thinking_duration_ms) : null,
      };
    }
    return {
      ...toParticipantSummary(row),
      workUnitId: String(row.work_unit_run_id),
      modelRole: textOrNull(row.model_role),
      input: traceRefOrNull(row.input_ref),
      output: traceRefOrNull(row.output_ref),
      rawOutput: textOrNull(row.raw_output),
      usage,
    };
  }

  private rows(data: unknown): Row[] {
    if (!Array.isArray(data)) throw new Error('workflows trace query returned no row set');
    return data as Row[];
  }
}
