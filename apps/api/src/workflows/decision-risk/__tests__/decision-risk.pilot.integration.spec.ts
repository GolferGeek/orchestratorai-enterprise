/**
 * The decision-risk pilot end to end against the real tables: the corporate
 * risk scope, the risk-* agent definitions, work units, the mitigation gate,
 * the Postgres checkpointer and the worker, with a scripted model in place of
 * a provider (every answer is valid for its agent's contract).
 *
 * Set HUMAN_REVIEW_TEST_DATABASE_URL to run it (skipped otherwise). It runs
 * under a random workflow slug, so the live worker never claims its run, and
 * a tagged proposition, so its risk rows are its own; everything is removed
 * through the conversation and the risk subject.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createExecutionContext } from '@orchestrator-ai/transport-types';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import { createCheckpointSaver } from '@orchestratorai/planes/checkpointer';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { PostgresDatabaseJobQueueService } from '@orchestratorai/planes/database/postgres-database-job-queue.service';
import type { WorkTaskSink } from '@orchestratorai/planes/work-routing';
import { AgentDefinitionsRepository, WorkflowAgentRuntime } from '../../shared/agents';
import type { RoleCallRequest, RunModelScope, WorkflowLlmClient } from '../../shared/models';
import { HumanReviewService } from '../../shared/reviews';
import { HumanReviewsRepository } from '../../shared/reviews/human-reviews.repository';
import { WorkflowHandlerRegistry, WorkflowRunsRepository } from '../../shared/runs';
import { WorkflowWorkerService } from '../../shared/runs/workflow-worker.service';
import type { ObservabilityService } from '../../shared/services/observability.service';
import { WorkUnitService } from '../../shared/work-units';
import { WorkUnitTraceReader } from '../../shared/work-units/work-unit-trace.reader';
import { WorkUnitsRepository } from '../../shared/work-units/work-units.repository';
import { IssueLedgerRepository } from '../../shared/ledger/issue-ledger.repository';
import { IssueLedgerService } from '../../shared/ledger';
import { createDecisionRiskGraph } from '../decision-risk.graph';
import { DECISION_RISK_RESTART_POINTS, createDecisionRiskHandler } from '../decision-risk.handler';
import { WorkflowRestartService } from '../../shared/restarts';
import { ModelProfilesRepository } from '../../shared/models/model-profiles.repository';
import { QualityRepository } from '../../shared/quality/quality.repository';
import { TraceReviewService } from '../../shared/quality/trace-review.service';
import { RiskStoreService } from '../risk-store.service';

const url = process.env.HUMAN_REVIEW_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

/** A valid answer for each agent, by its llm_usage caller name. */
const ANSWERS: Record<string, string> = {
  'agent:risk-dimension-assessor': '{"score": 70, "confidence": 0.7, "reasoning": "Material exposure.", "evidence": ["the proposition"]}',
  'agent:risk-debate-defender': '{"summary": "Mostly sound.", "strongest_points": ["independent scores"], "conceded": []}',
  'agent:risk-debate-challenger': '{"challenges": [{"dimension": "legal", "claim": "Overstated.", "severity": "minor"}], "missed_risks": []}',
  'agent:risk-debate-arbiter': '{"final_score": 66, "adjustment": -4, "rationale": "Legal is overstated.", "would_change_my_mind": "A signed lease."}',
  'agent:risk-mitigation-proposer': '{"proposal": "Pilot with one client first.", "rationale": "Limits exposure.", "effort": "medium", "residual_score": 45}',
  'agent:risk-executive-summary': 'Proceed with conditions: the pilot reduces the main exposures.',
  'agent:workflow-trace-reviewer':
    '{"summary": "Sound but generic.", "concerns": ["No figures cited"], "recommendations": [{"kind": "context", "priority": "medium", "recommendation": "Ask the writer to cite the residual score.", "rationale": "Readers need the number."}], "restart_worthwhile": true, "restart_instruction": "Cite the residual score.", "confidence": 0.7}',
};

describeWithDb('decision-risk pilot against Postgres', () => {
  const tag = randomUUID().slice(0, 8);
  const slug = `it-decision-risk-${tag}`;
  const proposition = `Open a Berlin office in Q3 (spec ${tag})`;
  const conversationId: string = randomUUID();
  const calls: string[] = [];
  const prompts: Array<{ caller: string; systemPrompt: string; userMessage: string }> = [];
  const children: string[] = [];
  let userId: string;
  let db: PostgresqlDatabaseService;
  let saver: PostgresSaver;
  let runs: WorkflowRunsRepository;
  let reviews: HumanReviewService;
  let worker: WorkflowWorkerService;
  let ledger: IssueLedgerService;
  let reader: WorkUnitTraceReader;
  let agentRuntime: WorkflowAgentRuntime;

  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    runs = new WorkflowRunsRepository(db);
    const noEvents = new Proxy({}, { get: () => async () => undefined }) as unknown as ObservabilityService;
    const tasks = {
      createTask: async () => ({ id: randomUUID(), title: 't', provider: 'flow' as const }),
      updateTaskStatus: async () => undefined,
    } as unknown as WorkTaskSink;
    const config = {
      getRequired: (key: string) =>
        ({
          PUBLIC_WEB_URL: 'https://app.example',
          CHECKPOINTER_PROVIDER: 'postgres',
          WORKFLOW_WORKER_ENABLED: 'false',
          WORKFLOW_PROVIDER_CONCURRENCY: '{"openrouter":4}',
        })[key] ??
        (() => {
          throw new Error(`Missing ${key}`);
        })(),
      getSecret: async () => url,
      getNumber: (key: string) =>
        ({ WORKFLOW_WORKER_POLL_MS: 1000, WORKFLOW_WORKER_MAX_CONCURRENT: 1, WORKFLOW_WORKER_LEASE_SECONDS: 120 })[key],
    } as unknown as ConfigProvider;
    reviews = new HumanReviewService(new HumanReviewsRepository(db), tasks, noEvents, config);
    saver = (await createCheckpointSaver(config)) as PostgresSaver;
    const llm = {
      callForRole: async (_scope: RunModelScope, role: string, request: RoleCallRequest) => {
        calls.push(`${role}:${request.callerName}`);
        prompts.push({ caller: request.callerName, systemPrompt: request.systemPrompt, userMessage: request.userMessage });
        const content = ANSWERS[request.callerName];
        if (content === undefined) throw new Error(`No scripted answer for ${request.callerName}`);
        return {
          content,
          provider: 'openrouter',
          model: 'google/gemini-2.5-flash-lite',
          requestId: `it-${tag}-${calls.length}`,
          usage: { inputTokens: 10, outputTokens: 5 },
          thinking: null,
        };
      },
    } as unknown as WorkflowLlmClient;
    agentRuntime = new WorkflowAgentRuntime(new AgentDefinitionsRepository(db), llm);
    const units = new WorkUnitService(
      new WorkUnitsRepository(db),
      agentRuntime,
      reviews,
      noEvents,
    );
    ledger = new IssueLedgerService(new IssueLedgerRepository(db));
    const graph = createDecisionRiskGraph({ units, store: new RiskStoreService(db), ledger, checkpointer: saver });
    const handlers = new WorkflowHandlerRegistry();
    handlers.register({ ...createDecisionRiskHandler(graph, new WorkflowRestartService(ledger)), slug });
    worker = new WorkflowWorkerService(new PostgresDatabaseJobQueueService(db), runs, handlers, noEvents, config);
    reader = new WorkUnitTraceReader(db);

    userId = String((await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`))[0]?.id);
    await sql(
      `INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'workflow', 'corporate', now(), now(), now())`,
      [conversationId, userId, slug],
    );
    await runs.insertQueued({
      context: createExecutionContext({
        orgSlug: 'corporate',
        userId,
        conversationId,
        agentSlug: slug,
        agentType: 'workflow',
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash-lite',
      }),
      input: { proposition, background: '' },
      documents: [],
      modelProfile: {
        analyst: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
        red_team: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
        writer: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
      },
      accessControl: { mode: 'owner' },
      maxAttempts: 1,
    });
  });

  afterAll(async () => {
    await sql(
      `DELETE FROM risk.subjects WHERE id IN (SELECT subject_id FROM risk.assessments WHERE task_id = $1)`,
      [conversationId],
    );
    await sql(`DELETE FROM workflows.improvement_requests WHERE workflow_slug = $1`, [slug]);
    await sql(`DELETE FROM workflows.agent_definition_links WHERE workflow_slug = $1`, [slug]);
    await sql(`DELETE FROM workflows.model_profiles WHERE workflow_slug = $1`, [slug]);
    for (const id of [...children, conversationId]) {
      await sql(`DELETE FROM public.conversations WHERE id = $1`, [id]);
      await saver.deleteThread(id);
    }
    await saver.end();
  });

  async function processUntil(status: string, runId: string = conversationId) {
    let last = null;
    for (let i = 0; i < 20; i++) {
      await worker.tick();
      await worker.drain();
      last = await runs.getForOrg('corporate', runId);
      if (last?.status === status) return last;
    }
    throw new Error(`Run never reached ${status}; last ${last?.status}: ${last?.error ?? ''}`);
  }

  it('assesses, debates, waits for the mitigation review, then finishes with the approved set', async () => {
    await processUntil('awaiting_review');
    const review = await reviews.getWaiting(conversationId);
    expect(review).toMatchObject({ gateSlug: 'approve-mitigations', kind: 'approval' });
    const items = (review!.payload as { items: Array<{ itemId: string }> }).items;
    expect(items).toHaveLength(10);
    const callsBeforeReview = calls.length;
    const raised = await ledger.view(conversationId);
    expect(raised.summary).toMatchObject({ total: 10, open: 10, byStatus: { identified: 10 } });
    expect(raised.issues.every((i) => i.stageSlug === 'risk-radar' && i.issueKey.startsWith('dimension:'))).toBe(true);

    const run = await runs.getForOrg('corporate', conversationId);
    await reviews.respond(run!.executionContext, review!.id, {
      kind: 'decision',
      decision: {
        type: 'modify',
        items: [
          { itemId: items[0]!.itemId, decision: 'reject' },
          { itemId: items[1]!.itemId, decision: 'modify', replacement: 'Insure the lease.' },
        ],
      },
    });

    const finished = await processUntil('completed');
    const result = finished.result as {
      overallScore: number;
      mitigations: Array<{ dimensionSlug: string; proposal: string }>;
      executiveSummary: string;
      debate: { originalScore: number; finalScore: number };
    };
    expect(result.debate).toEqual({ originalScore: 70, finalScore: 66, adjustment: -4 });
    expect(result.overallScore).toBe(66);
    expect(result.mitigations).toHaveLength(9);
    expect(result.mitigations.find((m) => m.dimensionSlug === items[1]!.itemId)?.proposal).toBe('Insure the lease.');
    expect(result.executiveSummary).toContain('Proceed with conditions');

    // Resuming ran only the summary: nothing before the gate ran twice.
    expect(calls.slice(callsBeforeReview)).toEqual(['writer:agent:risk-executive-summary']);
    expect(calls.filter((c) => c.startsWith('analyst:agent:risk-dimension-assessor'))).toHaveLength(10);

    const trace = await reader.units(conversationId);
    expect(trace.map((u) => [u.slug, u.pattern, u.status, u.participants.length])).toEqual([
      ['assess-dimensions', 'panel', 'completed', 10],
      ['red-team', 'red_blue', 'completed', 3],
      ['propose-mitigations', 'panel', 'completed', 10],
      ['review-mitigations', 'human', 'completed', 0],
      ['executive-summary', 'solo', 'completed', 1],
    ]);
    const stored = await sql(
      `SELECT count(*)::int AS n FROM risk.mitigations m JOIN risk.assessments a ON a.id = m.assessment_id WHERE a.task_id = $1`,
      [conversationId],
    );
    expect(stored[0]?.n).toBe(9);

    // The review settled every flagged dimension on the ledger.
    const settled = await ledger.view(conversationId);
    expect(settled.summary).toMatchObject({ total: 10, open: 9, byStatus: { accepted: 9, not_addressed: 1 } });
    const dropped = settled.issues.find((i) => i.status === 'not_addressed');
    expect(dropped?.issueKey).toBe(`dimension:${items[0]!.itemId}`);
    const events = await sql(
      `SELECT DISTINCT actor FROM workflows.issue_ledger_events WHERE run_id = $1 AND from_status IS NOT NULL`,
      [conversationId],
    );
    expect(events).toEqual([{ actor: 'review:approve-mitigations#0' }]);
  });

  /** Queue a restart of the pilot run after one of its units (the invoke controller's checks are its own spec). */
  async function queueRestart(unitSlug: string, instruction: string | null): Promise<string> {
    const unit = (await reader.units(conversationId)).find((u) => u.slug === unitSlug)!;
    const childId = randomUUID();
    children.push(childId);
    await sql(
      `INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'workflow', 'corporate', now(), now(), now())`,
      [childId, userId, slug],
    );
    const parent = (await runs.getForOrg('corporate', conversationId))!;
    await runs.insertQueued({
      context: createExecutionContext({ ...parent.executionContext, conversationId: childId }),
      input: parent.input,
      documents: [],
      modelProfile: parent.modelProfile,
      accessControl: { mode: 'owner' },
      maxAttempts: 1,
      restart: {
        parentRunId: conversationId,
        fromWorkUnitRunId: unit.workUnitId,
        fromWorkUnitSlug: unitSlug,
        resumeAt: DECISION_RISK_RESTART_POINTS[unitSlug]!.resumeAt,
        instruction,
      },
    });
    return childId;
  }

  it('branches after the proposals: the ledger as it stood then, a new review, and the instruction on every call', async () => {
    const before = calls.length;
    const childId = await queueRestart('propose-mitigations', 'Weigh regulatory timing heavily.');
    await processUntil('awaiting_review', childId);

    // Nothing before the branch point ran again; the gate is the child's own.
    expect(calls.slice(before)).toEqual([]);
    const review = await reviews.getWaiting(childId);
    expect((review!.payload as { items: unknown[] }).items).toHaveLength(10);

    // The parent's review had settled every issue; the branch starts before it.
    const copied = await ledger.view(childId);
    expect(copied.summary).toMatchObject({ total: 10, byStatus: { identified: 10 } });
    expect(copied.issues[0]!.lastChange).toMatchObject({ actor: `restart:${conversationId}`, rationale: `Carried over from run ${conversationId}` });

    const child = (await runs.getForOrg('corporate', childId))!;
    await reviews.respond(child.executionContext, review!.id, { kind: 'decision', decision: { type: 'approve' } });
    const finished = await processUntil('completed', childId);
    expect((finished.result as { mitigations: unknown[] }).mitigations).toHaveLength(10);
    expect((await ledger.view(childId)).summary.byStatus.accepted).toBe(10);

    expect(calls.slice(before)).toEqual(['writer:agent:risk-executive-summary']);
    expect(prompts.at(-1)!.systemPrompt).toContain('Instruction from the person who restarted this run:\nWeigh regulatory timing heavily.');

    // The parent is untouched.
    expect((await ledger.view(conversationId)).summary.byStatus).toMatchObject({ accepted: 9, not_addressed: 1 });
    expect(finished.restart).toMatchObject({ parentRunId: conversationId, fromWorkUnitSlug: 'propose-mitigations', resumeAt: 'review_mitigations' });
  });

  it('branches after the review: only the summary runs again, with the reviewed mitigations and settled ledger', async () => {
    const before = calls.length;
    const childId = await queueRestart('review-mitigations', null);
    const finished = await processUntil('completed', childId);
    expect(calls.slice(before)).toEqual(['writer:agent:risk-executive-summary']);
    expect(prompts.at(-1)!.systemPrompt).not.toContain('restarted this run');
    const result = finished.result as { mitigations: Array<{ proposal: string }> };
    expect(result.mitigations).toHaveLength(9);
    expect(result.mitigations.map((m) => m.proposal)).toContain('Insure the lease.');
    expect((await ledger.view(childId)).summary.byStatus).toMatchObject({ accepted: 9, not_addressed: 1 });
  });

  it("reviews a step with the workflow's reviewer and files an improvement from it", async () => {
    await sql(
      `INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES ('workflow-trace-reviewer', $1, 'trace_review')`,
      [slug],
    );
    await sql(
      `INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model)
       VALUES ('corporate', $1, 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite')`,
      [slug],
    );
    const quality = new QualityRepository(db);
    const service = new TraceReviewService(quality, reader, agentRuntime, new AgentDefinitionsRepository(db), new ModelProfilesRepository(db));
    const run = (await runs.getForOrg('corporate', conversationId))!;
    const summaryUnit = (await reader.units(conversationId)).find((u) => u.slug === 'executive-summary')!;

    const review = await service.review(run.executionContext, run, { type: 'work_unit', id: summaryUnit.workUnitId }, 'Is it specific enough?');
    expect(review).toMatchObject({
      status: 'completed',
      target: { type: 'work_unit', label: 'executive-summary' },
      reviewerAgent: 'workflow-trace-reviewer',
      notes: 'Is it specific enough?',
      result: { summary: 'Sound but generic.', restartWorthwhile: true, restartInstruction: 'Cite the residual score.' },
    });
    // The reviewer read the step's call: the writer's own instructions and its answer.
    expect(calls.at(-1)).toBe('reviewer:agent:workflow-trace-reviewer');
    const { trace } = JSON.parse(prompts.at(-1)!.userMessage) as { trace: string };
    expect(trace).toContain('You write the executive summary');
    expect(trace).toContain('Proceed with conditions: the pilot reduces the main exposures.');
    expect(await quality.reviewsForRun(conversationId)).toEqual([review]);

    const filed = await service.fileImprovement(run.executionContext, run, {
      traceReviewId: review.reviewId,
      kind: 'context',
      title: 'Cite the residual score',
      description: review.result!.recommendations[0]!.recommendation,
    });
    expect(filed).toMatchObject({ status: 'open', workflowSlug: slug, runId: conversationId, traceReviewId: review.reviewId });
    const decided = await quality.decideImprovement('corporate', filed.requestId, {
      status: 'accepted',
      adminNotes: 'Will update the prompt.',
      decidedBy: run.userId,
    });
    expect(decided).toMatchObject({ status: 'accepted', adminNotes: 'Will update the prompt.' });
    expect((await quality.improvements('corporate', 'accepted')).map((r) => r.requestId)).toContain(filed.requestId);
    expect(await quality.decideImprovement('marketing', filed.requestId, { status: 'done', adminNotes: null, decidedBy: run.userId })).toBeNull();
  });
});
