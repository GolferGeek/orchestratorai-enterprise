import { ConfigService } from '@nestjs/config';
import { NIL_UUID } from '@orchestrator-ai/transport-types';
import type { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import type { AmbientEvent } from '../event-bus/ambient-event.types';
import type { StreamingService } from '../streaming/streaming.service';
import type { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';
import type { KeyedRuns } from '../../workflows/catalog/workflow.registry';
import type { WorkflowRunLauncher } from '../../workflows/invoke/workflow-run-launcher.service';
import type { WorkflowDocumentsService } from '../../workflows/shared/documents/workflow-documents.service';
import type { WorkflowRunsRepository } from '../../workflows/shared/runs';
import type { TriggerRepliesService } from './trigger-replies.service';
import { TriggerExecutorService } from './trigger-executor.service';

const ORDER = '6f1d2c3b-1111-4a2b-9c3d-0123456789ab';
const trigger = {
  id: 't1', org_slug: 'acme', name: 'Order changed', source_type: 'database', created_by: null,
  action_config: { workflowSlug: 'fulfillment' },
} as unknown as Trigger;
const change = (newRow: Record<string, unknown>, oldRow: Record<string, unknown> | null): AmbientEvent => ({
  orgSlug: 'acme', sourceType: 'database', triggerId: 't1',
  payload: { connection: 'business', table: 'orders', schema: 'public', eventType: oldRow ? 'UPDATE' : 'INSERT', new: newRow, old: oldRow },
  timestamp: 't',
});

/** A keyed workflow: an order's run starts on submitted, takes later events, ignores no-ops. */
const keyedRuns: KeyedRuns = {
  route: ({ payload }) => {
    const row = payload.new as { id: string; status: string };
    const old = payload.old as { status: string } | null;
    if (old && old.status === row.status) return { kind: 'ignore', reason: 'status unchanged' };
    if (row.status === 'submitted') return { kind: 'start', key: row.id, input: { orderId: row.id } };
    return { kind: 'deliver', key: row.id };
  },
  deliver: jest.fn(async () => 'nothing to do'),
};

describe('a trigger on a keyed workflow (one run per business key)', () => {
  const database = { insertExecution: jest.fn(), updateExecution: jest.fn(), updateTriggerLastFired: jest.fn() };
  const launcher = {
    runtimeEntry: jest.fn(async () => ({ ok: true, value: { kind: 'runtime', keyedRuns } })),
    launch: jest.fn(async (_entry: unknown, request: { context: { conversationId: string } }) => ({ ok: true, value: { id: request.context.conversationId, status: 'queued' } })),
  };
  const runs = { getForOrg: jest.fn() };
  const executor = new TriggerExecutorService(
    database as unknown as AmbientDatabaseService,
    { emitWorkflowCompleted: jest.fn(), emitWorkflowFailed: jest.fn() } as unknown as StreamingService,
    new ConfigService({ DEFAULT_LLM_PROVIDER: 'openrouter', DEFAULT_LLM_MODEL: 'm' }),
    {} as InvokeDispatchService,
    launcher as unknown as WorkflowRunLauncher,
    {} as TriggerRepliesService,
    {} as WorkflowDocumentsService,
    runs as unknown as WorkflowRunsRepository,
  );

  beforeEach(() => jest.clearAllMocks());

  it('starts the key\'s run with the key as its run id, as the system user', async () => {
    runs.getForOrg.mockResolvedValue(null);
    await executor.execute(trigger, change({ id: ORDER, status: 'submitted' }, null));
    const [, request] = launcher.launch.mock.calls[0] as unknown as [unknown, { context: { conversationId: string; userId: string; orgSlug: string; agentSlug: string }; input: unknown }];
    expect(request.context).toMatchObject({ conversationId: ORDER, userId: NIL_UUID, orgSlug: 'acme', agentSlug: 'fulfillment' });
    expect(request.input).toEqual({ orderId: ORDER });
    expect(database.updateExecution).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'completed', a2a_response: { runId: ORDER, status: 'queued' } }));
  });

  it('hands an event for an existing run to the workflow instead of starting another', async () => {
    runs.getForOrg.mockResolvedValue({ id: ORDER, status: 'awaiting_review' });
    await executor.execute(trigger, change({ id: ORDER, status: 'submitted' }, { status: 'draft' }));
    expect(launcher.launch).not.toHaveBeenCalled();
    expect(keyedRuns.deliver).toHaveBeenCalledWith({ id: ORDER, status: 'awaiting_review' }, expect.objectContaining({ sourceType: 'database' }));
    expect(database.updateExecution).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'completed', a2a_response: { runId: ORDER, status: 'awaiting_review', delivered: 'nothing to do' } }));
  });

  it('hands the event to the run another event started a moment earlier (two first events at once)', async () => {
    runs.getForOrg.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: ORDER, status: 'queued' });
    launcher.launch.mockResolvedValueOnce({ ok: false, kind: 'exists', message: 'A run already exists for this conversation' } as never);
    await executor.execute(trigger, change({ id: ORDER, status: 'submitted' }, null));
    expect(keyedRuns.deliver).toHaveBeenCalledWith({ id: ORDER, status: 'queued' }, expect.objectContaining({ sourceType: 'database' }));
    expect(database.updateExecution).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'completed', a2a_response: { runId: ORDER, status: 'queued', delivered: 'nothing to do' } }));
  });

  it('records an ignored event as a skip with the workflow\'s reason, and starts nothing', async () => {
    await executor.execute(trigger, change({ id: ORDER, status: 'submitted' }, { status: 'submitted' }));
    expect(runs.getForOrg).not.toHaveBeenCalled();
    expect(launcher.launch).not.toHaveBeenCalled();
    expect(database.insertExecution).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', action_taken: false, skip_reason: 'status unchanged' }));
  });

  it('skips an event meant only for a run that does not exist', async () => {
    runs.getForOrg.mockResolvedValue(null);
    await executor.execute(trigger, change({ id: ORDER, status: 'packing' }, { status: 'ready_for_qbo' }));
    expect(launcher.launch).not.toHaveBeenCalled();
    expect(keyedRuns.deliver).not.toHaveBeenCalled();
    expect(database.insertExecution).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', skip_reason: `no fulfillment run for ${ORDER}` }));
  });

  it('refuses a key that is not a UUID (it becomes the run id)', async () => {
    await expect(executor.execute(trigger, change({ id: 'not-a-uuid', status: 'packing' }, { status: 'x' }))).rejects.toThrow('is not a UUID');
  });
});
