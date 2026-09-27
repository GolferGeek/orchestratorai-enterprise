import { Injectable } from '@nestjs/common';
import type { JsonValue, WorkUnitPattern } from '@orchestrator-ai/transport-types';
import { AgentOutputError, WorkflowAgentRuntime, type AgentInvocation } from '../agents';
import type { RunModelScope } from '../models';
import {
  awaitHumanReview,
  HumanReviewService,
  type HumanGate,
  type HumanReviewResponse,
} from '../reviews';
import { ObservabilityService } from '../services/observability.service';
import { traceRef } from './trace-ref';
import { WorkUnitsRepository, type ParticipantCall } from './work-units.repository';

/**
 * One agent call: which agent, with what input, and optionally the framing
 * the workflow adds from its own data (see WorkflowAgentRuntime.invoke).
 */
export interface AgentStep {
  agent: string;
  input: unknown;
  framing?: string;
}

/** A stage whose input is built from earlier stages' outputs, explicitly. */
export interface DerivedStep<TPrior> {
  agent: string;
  input: (prior: TPrior) => unknown;
  framing?: string;
}

export type PanelPolicy =
  | { mode: 'fail_all' }
  /** Succeed with at least `minSuccess` answers; fewer than all is completed_partial. */
  | { mode: 'allow_partial'; minSuccess: number };

export type PanelResult<TOutput> =
  | { agent: string; ok: true; output: TOutput }
  | { agent: string; ok: false; error: string };

export interface PanelOutcome<TOutput> {
  status: 'completed' | 'completed_partial';
  /** In panelist order. */
  results: PanelResult<TOutput>[];
}

/** A work unit did not produce a usable result (its row says why). */
export class WorkUnitFailedError extends Error {
  constructor(slug: string, reason: string) {
    super(`Work unit "${slug}" failed: ${reason}`);
    this.name = 'WorkUnitFailedError';
  }
}

interface UnitSpec {
  slug: string;
  pattern: WorkUnitPattern;
  input: unknown;
  metadata: Record<string, unknown>;
}

interface UnitBodyResult<T> {
  result: T;
  status: 'completed' | 'completed_partial';
  output: unknown;
}

/**
 * The structured steps of a workflow, each recorded as a work unit with its
 * agent calls as participants: the run's trace.
 *
 * Every unit and participant ends completed or failed; nothing is left
 * running. A failure recording a failure is reported together with the
 * original error, never instead of it. Panels wait for every panelist before
 * deciding, so no participant writes after its unit has finished.
 */
@Injectable()
export class WorkUnitService {
  constructor(
    private readonly repo: WorkUnitsRepository,
    private readonly agents: WorkflowAgentRuntime,
    private readonly reviews: HumanReviewService,
    private readonly observability: ObservabilityService,
  ) {}

  /** What each running unit's participants did, for its completion event. */
  private readonly unitCalls = new Map<string, { participants: number; models: Set<string> }>();

  /** One agent. */
  runSolo<TOutput>(scope: RunModelScope, unit: { slug: string } & AgentStep): Promise<TOutput> {
    return this.unit(scope, { slug: unit.slug, pattern: 'solo', input: unit.input, metadata: {} }, async (id) => {
      const output = await this.participant<TOutput>(scope, id, 0, 'solo', unit);
      return { result: output, status: 'completed', output };
    });
  }

  /** The same question to several agents, at most `maxConcurrent` at a time. */
  async runPanel<TOutput>(
    scope: RunModelScope,
    unit: { slug: string; panelists: AgentStep[]; maxConcurrent: number; policy: PanelPolicy },
  ): Promise<PanelOutcome<TOutput>> {
    checkPanel(unit.slug, unit.panelists.length, unit.maxConcurrent, unit.policy);
    return this.unit(
      scope,
      {
        slug: unit.slug,
        pattern: 'panel',
        input: { panelists: unit.panelists.map((p) => p.agent) },
        metadata: { policy: unit.policy, maxConcurrent: unit.maxConcurrent },
      },
      async (id) => {
        const results = await this.panel<TOutput>(scope, id, 0, 'panelist', unit.panelists, unit.maxConcurrent);
        const outcome = decidePanel(unit.slug, results, unit.policy);
        return { result: outcome, status: outcome.status, output: outcome.results };
      },
    );
  }

  /**
   * Blue proposes, red challenges; an optional reviser answers the challenge
   * and an optional arbitrator decides. Each later stage's input is built by
   * the caller from the earlier outputs.
   */
  runRedBlue<TBlue, TRed, TRevised = never, TDecision = never>(
    scope: RunModelScope,
    unit: {
      slug: string;
      blue: AgentStep;
      red: DerivedStep<{ blue: TBlue }>;
      reviser?: DerivedStep<{ blue: TBlue; red: TRed }>;
      arbitrator?: DerivedStep<{ blue: TBlue; red: TRed; revised: TRevised | null }>;
    },
  ): Promise<{ blue: TBlue; red: TRed; revised: TRevised | null; decision: TDecision | null }> {
    return this.unit(
      scope,
      { slug: unit.slug, pattern: 'red_blue', input: unit.blue.input, metadata: {} },
      async (id) => {
        const blue = await this.participant<TBlue>(scope, id, 0, 'blue', unit.blue);
        const red = await this.participant<TRed>(scope, id, 1, 'red', derive(unit.red, { blue }));
        const revised = unit.reviser
          ? await this.participant<TRevised>(scope, id, 2, 'reviser', derive(unit.reviser, { blue, red }))
          : null;
        const decision = unit.arbitrator
          ? await this.participant<TDecision>(scope, id, 3, 'arbitrator', derive(unit.arbitrator, { blue, red, revised }))
          : null;
        const result = { blue, red, revised, decision };
        return { result, status: 'completed', output: result };
      },
    );
  }

  /** A panel whose answers (all of them) go to an arbitrator who decides. */
  async runArbitrated<TPanel, TDecision>(
    scope: RunModelScope,
    unit: {
      slug: string;
      panelists: AgentStep[];
      maxConcurrent: number;
      arbitrator: DerivedStep<{ panel: TPanel[] }>;
    },
  ): Promise<{ panel: TPanel[]; decision: TDecision }> {
    checkPanel(unit.slug, unit.panelists.length, unit.maxConcurrent, { mode: 'fail_all' });
    return this.unit(
      scope,
      {
        slug: unit.slug,
        pattern: 'arbitrated',
        input: { panelists: unit.panelists.map((p) => p.agent), arbitrator: unit.arbitrator.agent },
        metadata: { maxConcurrent: unit.maxConcurrent },
      },
      async (id) => {
        const results = await this.panel<TPanel>(scope, id, 0, 'panelist', unit.panelists, unit.maxConcurrent);
        const panel = decidePanel(unit.slug, results, { mode: 'fail_all' }).results.map((r) =>
          r.ok ? r.output : unreachable(),
        );
        const decision = await this.participant<TDecision>(
          scope,
          id,
          unit.panelists.length,
          'arbitrator',
          derive(unit.arbitrator, { panel }),
        );
        const result = { panel, decision };
        return { result, status: 'completed', output: result };
      },
    );
  }

  /** Drafter, then an optional reviewer, then an optional editor. */
  runSummarizer<TDraft, TReview = never, TFinal = never>(
    scope: RunModelScope,
    unit: {
      slug: string;
      drafter: AgentStep;
      reviewer?: DerivedStep<{ draft: TDraft }>;
      editor?: DerivedStep<{ draft: TDraft; review: TReview | null }>;
    },
  ): Promise<{ draft: TDraft; review: TReview | null; edited: TFinal | null }> {
    return this.unit(
      scope,
      { slug: unit.slug, pattern: 'summarizer', input: unit.drafter.input, metadata: {} },
      async (id) => {
        const draft = await this.participant<TDraft>(scope, id, 0, 'drafter', unit.drafter);
        const review = unit.reviewer
          ? await this.participant<TReview>(scope, id, 1, 'reviewer', derive(unit.reviewer, { draft }))
          : null;
        const edited = unit.editor
          ? await this.participant<TFinal>(scope, id, 2, 'editor', derive(unit.editor, { draft, review }))
          : null;
        const result = { draft, review, edited };
        return { result, status: 'completed', output: result };
      },
    );
  }

  /**
   * A human gate as a work unit. The first pass pauses the run (nothing is
   * recorded yet); on resume the response is recorded as a completed unit.
   * The awaitHumanReview rules apply to the calling node.
   */
  async runHuman(
    scope: RunModelScope,
    unit: { slug: string; gate: HumanGate; round: number; payload: JsonValue },
  ): Promise<HumanReviewResponse> {
    const response = await awaitHumanReview(this.reviews, scope.executionContext, unit.gate, unit.round, unit.payload);
    return this.unit(
      scope,
      { slug: unit.slug, pattern: 'human', input: unit.payload, metadata: { gate: unit.gate.slug, round: unit.round } },
      async () => ({ result: response, status: 'completed', output: response }),
    );
  }

  private async unit<T>(
    scope: RunModelScope,
    spec: UnitSpec,
    body: (unitId: string) => Promise<UnitBodyResult<T>>,
  ): Promise<T> {
    const context = scope.executionContext;
    const startedAt = Date.now();
    const unitId = await this.repo.startUnit({
      runId: context.conversationId,
      organizationSlug: context.orgSlug,
      slug: spec.slug,
      pattern: spec.pattern,
      input: traceRef(spec.input),
      metadata: spec.metadata,
    });
    const about = { slug: spec.slug, pattern: spec.pattern, workUnitId: unitId };
    this.unitCalls.set(unitId, { participants: 0, models: new Set() });
    let outcome: UnitBodyResult<T>;
    try {
      await this.observability.emitWorkUnit(
        context,
        context.conversationId,
        'started',
        `${spec.slug} (${spec.pattern}) started`,
        about,
      );
      try {
        outcome = await body(unitId);
      } catch (error) {
        await recordingFailure(error, () =>
          this.repo.finishUnit(unitId, context.orgSlug, startedAt, { status: 'failed', error: messageOf(error) }),
        );
        await this.observability.emitWorkUnit(
          context,
          context.conversationId,
          'failed',
          `${spec.slug} failed: ${messageOf(error)}`,
          { ...about, ...this.callsOf(unitId), error: messageOf(error), durationMs: Date.now() - startedAt },
        );
        throw error;
      }
      await this.repo.finishUnit(unitId, context.orgSlug, startedAt, {
        status: outcome.status,
        output: traceRef(outcome.output),
      });
      const calls = this.callsOf(unitId);
      await this.observability.emitWorkUnit(
        context,
        context.conversationId,
        'completed',
        `${spec.slug} ${outcome.status === 'completed_partial' ? 'completed partially' : 'completed'} (${calls.participants} call(s))`,
        { ...about, ...calls, status: outcome.status, durationMs: Date.now() - startedAt },
      );
    } finally {
      this.unitCalls.delete(unitId);
    }
    return outcome.result;
  }

  private callsOf(unitId: string): { participants: number; models: string[] } {
    const calls = this.unitCalls.get(unitId);
    return { participants: calls ? calls.participants : 0, models: calls ? [...calls.models] : [] };
  }

  private async participant<TOutput>(
    scope: RunModelScope,
    unitId: string,
    position: number,
    stage: string,
    step: AgentStep,
  ): Promise<TOutput> {
    const context = scope.executionContext;
    const startedAt = Date.now();
    const id = await this.repo.startParticipant({
      workUnitId: unitId,
      runId: context.conversationId,
      organizationSlug: context.orgSlug,
      position,
      stage,
      agentSlug: step.agent,
      // The framing is part of what the model saw, so the trace keeps it.
      input: traceRef(step.framing !== undefined ? { input: step.input, framing: step.framing } : step.input),
    });
    let invocation: AgentInvocation<TOutput>;
    try {
      invocation = await this.agents.invoke<TOutput>(
        scope,
        step.agent,
        step.input,
        step.framing !== undefined ? { framing: step.framing } : {},
      );
    } catch (error) {
      const miss = error instanceof AgentOutputError ? error : null;
      await recordingFailure(error, () =>
        this.repo.finishParticipant(id, context.orgSlug, startedAt, {
          status: 'failed',
          error: messageOf(error),
          raw: miss ? miss.raw : null,
          call: miss ? participantCall(miss.definitionVersion, miss.modelRole, miss.call) : null,
        }),
      );
      throw error;
    }
    await this.repo.finishParticipant(id, context.orgSlug, startedAt, {
      status: 'completed',
      output: traceRef(invocation.output),
      call: participantCall(invocation.definitionVersion, invocation.modelRole, invocation.call),
    });
    const calls = this.unitCalls.get(unitId);
    if (calls) {
      calls.participants += 1;
      calls.models.add(`${invocation.call.provider}/${invocation.call.model}`);
    }
    return invocation.output;
  }

  /** Run panelists with bounded concurrency; every one settles before this returns. */
  private async panel<TOutput>(
    scope: RunModelScope,
    unitId: string,
    firstPosition: number,
    stage: string,
    panelists: AgentStep[],
    maxConcurrent: number,
  ): Promise<PanelResult<TOutput>[]> {
    const results: PanelResult<TOutput>[] = new Array(panelists.length);
    let next = 0;
    const lane = async () => {
      while (next < panelists.length) {
        const index = next++;
        const step = panelists[index]!;
        try {
          const output = await this.participant<TOutput>(scope, unitId, firstPosition + index, stage, step);
          results[index] = { agent: step.agent, ok: true, output };
        } catch (error) {
          results[index] = { agent: step.agent, ok: false, error: messageOf(error) };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxConcurrent, panelists.length) }, lane));
    return results;
  }
}

function checkPanel(slug: string, size: number, maxConcurrent: number, policy: PanelPolicy): void {
  if (size === 0) throw new Error(`Panel "${slug}" has no panelists`);
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error(`Panel "${slug}" needs maxConcurrent of at least 1`);
  }
  if (
    policy.mode === 'allow_partial' &&
    (!Number.isInteger(policy.minSuccess) || policy.minSuccess < 1 || policy.minSuccess > size)
  ) {
    throw new Error(`Panel "${slug}" needs minSuccess between 1 and ${size}`);
  }
}

function decidePanel<TOutput>(
  slug: string,
  results: PanelResult<TOutput>[],
  policy: PanelPolicy,
): PanelOutcome<TOutput> {
  const failures = results.filter((r) => !r.ok);
  const successes = results.length - failures.length;
  const reasons = failures.map((f) => `${f.agent}: ${f.ok ? '' : f.error}`).join('; ');
  if (policy.mode === 'fail_all' && failures.length > 0) {
    throw new WorkUnitFailedError(slug, `${failures.length} of ${results.length} panelists failed (${reasons})`);
  }
  if (policy.mode === 'allow_partial' && successes < policy.minSuccess) {
    throw new WorkUnitFailedError(
      slug,
      `${successes} of ${results.length} panelists answered; at least ${policy.minSuccess} needed (${reasons})`,
    );
  }
  return { status: failures.length === 0 ? 'completed' : 'completed_partial', results };
}

function derive<TPrior>(step: DerivedStep<TPrior>, prior: TPrior): AgentStep {
  return { agent: step.agent, input: step.input(prior), ...(step.framing !== undefined ? { framing: step.framing } : {}) };
}

function participantCall(
  agentVersion: number,
  modelRole: string,
  call: { provider: string; model: string; requestId: string; usage: { inputTokens: number; outputTokens: number } },
): ParticipantCall {
  return {
    agentVersion,
    modelRole,
    provider: call.provider,
    model: call.model,
    llmRequestId: call.requestId,
    inputTokens: call.usage.inputTokens,
    outputTokens: call.usage.outputTokens,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Record a failure; if recording fails too, report both, the original first. */
async function recordingFailure(original: unknown, record: () => Promise<void>): Promise<void> {
  try {
    await record();
  } catch (recordError) {
    throw new Error(`${messageOf(original)} (recording this failure also failed: ${messageOf(recordError)})`, {
      cause: original,
    });
  }
}

function unreachable(): never {
  throw new Error('A fail_all panel returned a failed result');
}
