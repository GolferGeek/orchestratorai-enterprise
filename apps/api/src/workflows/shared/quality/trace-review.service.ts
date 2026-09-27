import { Injectable } from '@nestjs/common';
import type {
  ExecutionContext,
  ImprovementKind,
  ImprovementRequestView,
  ParticipantDetail,
  TraceReviewResult,
  TraceReviewTargetType,
  TraceReviewView,
} from '@orchestrator-ai/transport-types';
import { AgentDefinitionsRepository, WorkflowAgentRuntime } from '../agents';
import { ModelProfilesRepository, TRACE_REVIEWER_ROLE } from '../models';
import type { WorkflowRunRecord } from '../runs';
import { WorkUnitTraceReader } from '../work-units/work-unit-trace.reader';
import { QualityRepository } from './quality.repository';

/** How much trace the reviewer reads; more is cut, and it is told so. */
const TRACE_LIMIT = 24_000;
const MAX_NOTES = 2000;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 8000;

/** A review or request the caller got wrong (an invalid-params answer, not a server fault). */
export class QualityRequestError extends Error {}

/** The reviewer agent's answer, as its contract fixes it. */
interface ReviewerOutput {
  summary: string;
  concerns: string[];
  recommendations: TraceReviewResult['recommendations'];
  restart_worthwhile: boolean;
  restart_instruction: string | null;
  confidence: number;
}

/**
 * Trace review: the workflow's linked reviewer agent reads one step or one
 * agent call of a run (its inputs, outputs and the agents' instructions) and
 * says what would make it better. The review runs on the requester's context
 * (its conversation is the run's), so its cost lands on the run.
 */
@Injectable()
export class TraceReviewService {
  constructor(
    private readonly repo: QualityRepository,
    private readonly trace: WorkUnitTraceReader,
    private readonly agents: WorkflowAgentRuntime,
    private readonly definitions: AgentDefinitionsRepository,
    private readonly modelProfiles: ModelProfilesRepository,
  ) {}

  async review(
    context: ExecutionContext,
    run: WorkflowRunRecord,
    target: { type: TraceReviewTargetType; id: string },
    notes: string | undefined,
  ): Promise<TraceReviewView> {
    const note = notes?.trim() ? notes.trim() : null;
    if (note && note.length > MAX_NOTES) throw new QualityRequestError(`notes must be at most ${MAX_NOTES} characters`);
    const reviewer = await this.repo.reviewerFor(run.workflowSlug);
    if (!reviewer) throw new QualityRequestError(`Workflow ${run.workflowSlug} has no trace reviewer`);
    const subject = await this.subject(run, target);
    const modelProfile = await this.modelProfiles.snapshot(context.orgSlug, run.workflowSlug, [TRACE_REVIEWER_ROLE]);

    const started = await this.repo.startReview({
      runId: run.id,
      organizationSlug: run.organizationSlug,
      target: { ...target, label: subject.label },
      reviewerAgent: reviewer,
      requestedBy: context.userId,
      notes: note,
    });
    try {
      const { output } = await this.agents.invoke<ReviewerOutput>({ executionContext: context, modelProfile }, reviewer, {
        workflow: run.workflowSlug,
        target: subject.label,
        notes: note,
        trace: bounded(subject.trace),
      });
      return await this.repo.finishReview(started.reviewId, {
        status: 'completed',
        result: {
          summary: output.summary,
          concerns: output.concerns,
          recommendations: output.recommendations,
          restartWorthwhile: output.restart_worthwhile,
          restartInstruction: output.restart_instruction,
          confidence: output.confidence,
        },
      });
    } catch (err) {
      // The review is kept as failed with its reason; the caller gets the error too.
      await this.repo.finishReview(started.reviewId, { status: 'failed', error: (err as Error).message });
      throw err;
    }
  }

  async fileImprovement(
    context: ExecutionContext,
    run: WorkflowRunRecord,
    request: { traceReviewId?: string; kind: ImprovementKind; title: string; description: string },
  ): Promise<ImprovementRequestView> {
    const title = request.title.trim();
    const description = request.description.trim();
    if (!title || title.length > MAX_TITLE) throw new QualityRequestError(`title must be 1 to ${MAX_TITLE} characters`);
    if (!description || description.length > MAX_DESCRIPTION) {
      throw new QualityRequestError(`description must be 1 to ${MAX_DESCRIPTION} characters`);
    }
    if (request.traceReviewId && !(await this.repo.review(run.id, request.traceReviewId))) {
      throw new QualityRequestError(`Run ${run.id} has no trace review ${request.traceReviewId}`);
    }
    return this.repo.fileImprovement({
      organizationSlug: run.organizationSlug,
      workflowSlug: run.workflowSlug,
      runId: run.id,
      traceReviewId: request.traceReviewId ?? null,
      kind: request.kind,
      title,
      description,
      requestedBy: context.userId,
    });
  }

  /** What the reviewer reads: the calls of the step (or the one call) with each agent's instructions. */
  private async subject(
    run: WorkflowRunRecord,
    target: { type: TraceReviewTargetType; id: string },
  ): Promise<{ label: string; trace: unknown }> {
    const units = await this.trace.units(run.id);
    if (target.type === 'work_unit') {
      const unit = units.find((u) => u.workUnitId === target.id);
      if (!unit) throw new QualityRequestError(`Run ${run.id} has no step ${target.id}`);
      const calls = [];
      for (const p of unit.participants) calls.push(await this.call(run, p.participantId));
      return {
        label: unit.slug,
        trace: { step: unit.slug, pattern: unit.pattern, status: unit.status, error: unit.error, calls },
      };
    }
    const detail = await this.trace.participant(run.id, target.id);
    if (!detail) throw new QualityRequestError(`Run ${run.id} has no agent call ${target.id}`);
    const unit = units.find((u) => u.workUnitId === detail.workUnitId);
    return {
      label: `${detail.agentSlug} (${detail.stage}) in ${unit?.slug ?? 'a step'}`,
      trace: { step: unit?.slug ?? null, call: await this.describe(run, detail) },
    };
  }

  private async call(run: WorkflowRunRecord, participantId: string) {
    const detail = await this.trace.participant(run.id, participantId);
    if (!detail) throw new Error(`Participant ${participantId} of run ${run.id} vanished while it was read`);
    return this.describe(run, detail);
  }

  private async describe(run: WorkflowRunRecord, detail: ParticipantDetail) {
    const definition = await this.definitions.getForOrg(detail.agentSlug, run.organizationSlug);
    return {
      agent: detail.agentSlug,
      stage: detail.stage,
      instructions: definition?.instructions ?? null,
      model: detail.provider && detail.model ? `${detail.provider}/${detail.model}` : null,
      status: detail.status,
      error: detail.error,
      input: detail.input?.value ?? null,
      output: detail.output?.value ?? null,
      rawOutput: detail.rawOutput,
    };
  }
}

function bounded(trace: unknown): string {
  const text = JSON.stringify(trace, null, 2);
  return text.length > TRACE_LIMIT ? `${text.slice(0, TRACE_LIMIT)}\n\n[the trace was cut here]` : text;
}
