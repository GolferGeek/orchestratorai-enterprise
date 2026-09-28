/**
 * Ambient's replies against the real ambient tables: a reply waiting on a run
 * goes out once, through the via agent, when the run ends; a refusal is
 * recorded as refused. Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it. Its rows
 * are in the org 'ambient-replies-spec' and removed after.
 */
import { randomUUID } from 'node:crypto';
import { Subject } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import type { ObservabilityEventRecord, ObservabilityEventsService } from '@orchestratorai/planes/observability';
import type { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';
import type { WorkflowRunsRepository } from '../../workflows/shared/runs';
import { ReplyRefused } from '../../gatehouse/reply.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import { runParts, TriggerRepliesService } from './trigger-replies.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;
const ORG = 'ambient-replies-spec';
const origin = { via: 'send-invoice', callerId: randomUUID(), contextId: 'their-ctx', taskId: randomUUID() };

describeWithDb('ambient replies against Postgres', () => {
  let db: PostgresqlDatabaseService;
  let ambient: AmbientDatabaseService;
  let replies: TriggerRepliesService;
  let trigger: Trigger;
  const events$ = new Subject<ObservabilityEventRecord>();
  const dispatch = { invoke: jest.fn() };
  const runs = { getForOrg: jest.fn() };

  const waitingExecution = async (runId: string) => {
    const { event } = await ambient.insertEvent({ org_slug: ORG, name: 'invoice.received', source: 'a2a:send-invoice', payload: {}, dedupe_key: null, origin });
    const id = randomUUID();
    await ambient.insertExecution({
      id, trigger_id: trigger.id, trigger_name: trigger.name, source_type: 'event', source_event: {}, condition_met: true, action_taken: true,
      execution_context: null, a2a_response: { runId }, duration_ms: 1, status: 'completed', event_id: event.id, reply_state: 'waiting', reply_run_id: runId,
    });
    return id;
  };
  const execution = async (id: string) => (await ambient.getRecentExecutions(trigger.id, 100)).find((e) => (e as { id?: string }).id === id)!;
  const runEnd = (runId: string) =>
    events$.next({ hook_event_type: 'langgraph.completed', context: { conversationId: runId } } as unknown as ObservabilityEventRecord);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    ambient = new AmbientDatabaseService(db);
    trigger = await ambient.createTrigger({
      org_slug: ORG, name: 'Spec: reply', description: null, source_type: 'event', enabled: true, source_config: { event: 'invoice.received' },
      condition: null, action_config: { workflowSlug: 'invoice-review', replyToCaller: true }, trigger_kind: 'event', trigger_config: {},
      response_kind: 'workflow', response_config: {}, cooldown_seconds: 0, max_fires_per_hour: null, created_by: null,
    });
    replies = new TriggerRepliesService(
      ambient,
      dispatch as unknown as InvokeDispatchService,
      runs as unknown as WorkflowRunsRepository,
      { events$ } as unknown as ObservabilityEventsService,
      { getRequired: (key: string) => ({ DEFAULT_LLM_PROVIDER: 'openrouter', DEFAULT_LLM_MODEL: 'm' })[key]! } as never,
    );
  });

  afterAll(async () => {
    replies.onModuleDestroy();
    await db.rawQuery(`DELETE FROM ambient.triggers WHERE org_slug = $1`, [ORG]);
    await db.rawQuery(`DELETE FROM ambient.events WHERE org_slug = $1`, [ORG]);
  });

  beforeEach(() => jest.clearAllMocks());

  it('sends a waiting reply once, through the via agent, when its run ends', async () => {
    const runId = randomUUID();
    const id = await waitingExecution(runId);
    runs.getForOrg.mockResolvedValue({ status: 'running', result: null, workflowSlug: 'invoice-review' });
    await replies.onModuleInit();
    await settle();
    expect(dispatch.invoke).not.toHaveBeenCalled();
    expect((await execution(id)).reply_state).toBe('waiting');

    runs.getForOrg.mockResolvedValue({ status: 'completed', result: { approved: true }, workflowSlug: 'invoice-review' });
    dispatch.invoke.mockResolvedValue({ content: { status: 'sent', caller: 'Partner', state: 'completed' }, outputType: 'json' });
    runEnd(runId);
    runEnd(runId);
    await settle();

    expect(dispatch.invoke).toHaveBeenCalledTimes(1);
    const [context, data, meta] = dispatch.invoke.mock.calls[0] as [Record<string, unknown>, unknown, Record<string, unknown>];
    expect(context).toMatchObject({ orgSlug: ORG, agentSlug: 'send-invoice', agentType: 'system' });
    expect(data).toEqual({ content: { parts: [{ data: { approved: true }, mediaType: 'application/json' }] }, contentType: 'json' });
    expect(meta).toMatchObject({ source: 'ambient', a2aReply: origin, executionId: id });
    expect(await execution(id)).toMatchObject({ reply_state: 'sent', reply: { status: 'sent', caller: 'Partner' } });
  });

  it('records a refused reply as refused, and a failed one as failed', async () => {
    runs.getForOrg.mockResolvedValue({ status: 'completed', result: null, workflowSlug: 'invoice-review' });
    const refusedRun = randomUUID();
    const refused = await waitingExecution(refusedRun);
    dispatch.invoke.mockRejectedValueOnce(new ReplyRefused('Partner is suspended'));
    await replies.runEnded(refusedRun);
    expect(await execution(refused)).toMatchObject({ reply_state: 'refused', reply: { error: 'Partner is suspended' } });

    const failedRun = randomUUID();
    const failed = await waitingExecution(failedRun);
    dispatch.invoke.mockRejectedValueOnce(new Error('Partner returned HTTP 502'));
    await replies.runEnded(failedRun);
    expect(await execution(failed)).toMatchObject({ reply_state: 'failed', reply: { error: 'Partner returned HTTP 502' } });
  });
});

describe('a finished run as a reply', () => {
  it('is its result, or what became of it', () => {
    expect(runParts({ status: 'completed', result: { ok: 1 }, workflowSlug: 'w' })).toEqual([{ data: { ok: 1 }, mediaType: 'application/json' }]);
    expect(runParts({ status: 'completed', result: null, workflowSlug: 'w' })).toEqual([{ text: 'w completed' }]);
    expect(runParts({ status: 'failed', result: null, workflowSlug: 'w' })).toEqual([{ text: 'w failed' }]);
    expect(runParts({ status: 'canceled', result: null, workflowSlug: 'w' })).toEqual([{ text: 'w was canceled' }]);
  });
});
