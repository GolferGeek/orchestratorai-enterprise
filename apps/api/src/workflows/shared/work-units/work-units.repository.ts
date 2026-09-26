import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type TraceRef,
  type WorkUnitPattern,
} from '@orchestrator-ai/transport-types';

const WORKFLOWS = 'workflows';

/** A unit or participant write matched no running row. */
export class TraceWriteError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} was not running; its result was not recorded`);
    this.name = 'TraceWriteError';
  }
}

export interface ParticipantCall {
  agentVersion: number;
  modelRole: string;
  provider: string;
  model: string;
  llmRequestId: string;
  inputTokens: number;
  outputTokens: number;
}

/** Writes of the trace. Every update is guarded on id, org and status. */
@Injectable()
export class WorkUnitsRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async startUnit(unit: {
    runId: string;
    organizationSlug: string;
    slug: string;
    pattern: WorkUnitPattern;
    input: TraceRef | null;
    metadata: Record<string, unknown>;
  }): Promise<string> {
    const { data, error } = await this.db
      .from(WORKFLOWS, 'work_unit_runs')
      .insert({
        run_id: unit.runId,
        organization_slug: unit.organizationSlug,
        work_unit_slug: unit.slug,
        pattern: unit.pattern,
        status: 'running',
        input_ref: unit.input,
        metadata: unit.metadata,
      })
      .select('id');
    if (error) throw new Error(`Failed to start work unit ${unit.slug}: ${error.message}`);
    return this.id(data, `work unit ${unit.slug}`);
  }

  async finishUnit(
    id: string,
    organizationSlug: string,
    startedAt: number,
    result:
      | { status: 'completed' | 'completed_partial'; output: TraceRef | null }
      | { status: 'failed'; error: string },
  ): Promise<void> {
    const { data, error } = await this.db
      .from(WORKFLOWS, 'work_unit_runs')
      .update({
        status: result.status,
        ...(result.status === 'failed' ? { error: result.error } : { output_ref: result.output }),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', id)
      .eq('organization_slug', organizationSlug)
      .eq('status', 'running')
      .select('id');
    if (error) throw new Error(`Failed to finish work unit ${id}: ${error.message}`);
    if (this.rows(data).length === 0) throw new TraceWriteError('Work unit', id);
  }

  async startParticipant(participant: {
    workUnitId: string;
    runId: string;
    organizationSlug: string;
    position: number;
    stage: string;
    agentSlug: string;
    input: TraceRef;
  }): Promise<string> {
    const { data, error } = await this.db
      .from(WORKFLOWS, 'participant_runs')
      .insert({
        work_unit_run_id: participant.workUnitId,
        run_id: participant.runId,
        organization_slug: participant.organizationSlug,
        position: participant.position,
        stage: participant.stage,
        agent_slug: participant.agentSlug,
        status: 'running',
        input_ref: participant.input,
      })
      .select('id');
    if (error) {
      throw new Error(`Failed to start participant ${participant.stage} (${participant.agentSlug}): ${error.message}`);
    }
    return this.id(data, `participant ${participant.stage}`);
  }

  async finishParticipant(
    id: string,
    organizationSlug: string,
    startedAt: number,
    result:
      | { status: 'completed'; output: TraceRef; call: ParticipantCall }
      | { status: 'failed'; error: string; raw: string | null; call: ParticipantCall | null },
  ): Promise<void> {
    const call = result.call;
    const { data, error } = await this.db
      .from(WORKFLOWS, 'participant_runs')
      .update({
        status: result.status,
        ...(result.status === 'completed'
          ? { output_ref: result.output }
          : { error: result.error, raw_output: result.raw }),
        ...(call
          ? {
              agent_version: call.agentVersion,
              model_role: call.modelRole,
              provider: call.provider,
              model: call.model,
              llm_request_id: call.llmRequestId,
              input_tokens: call.inputTokens,
              output_tokens: call.outputTokens,
            }
          : {}),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', id)
      .eq('organization_slug', organizationSlug)
      .eq('status', 'running')
      .select('id');
    if (error) throw new Error(`Failed to finish participant ${id}: ${error.message}`);
    if (this.rows(data).length === 0) throw new TraceWriteError('Participant', id);
  }

  private id(data: unknown, what: string): string {
    const id = this.rows(data)[0]?.id;
    if (typeof id !== 'string') throw new Error(`Starting ${what} returned no id`);
    return id;
  }

  private rows(data: unknown): Record<string, unknown>[] {
    if (!Array.isArray(data)) throw new Error('workflows trace query returned no row set');
    return data as Record<string, unknown>[];
  }
}
