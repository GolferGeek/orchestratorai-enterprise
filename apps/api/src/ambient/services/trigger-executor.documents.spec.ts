import { ConfigService } from '@nestjs/config';
import type { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import type { AmbientEvent } from '../event-bus/ambient-event.types';
import type { StreamingService } from '../streaming/streaming.service';
import type { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';
import type { WorkflowRunLauncher } from '../../workflows/invoke/workflow-run-launcher.service';
import type { WorkflowDocumentsService } from '../../workflows/shared/documents/workflow-documents.service';
import type { TriggerRepliesService } from './trigger-replies.service';
import { TriggerExecutorService } from './trigger-executor.service';

const trigger = {
  id: 't1', org_slug: 'finance', name: 'Invoice dropped in intake', source_type: 'event', created_by: null,
  action_config: { workflowSlug: 'invoice-review', inputFromEvent: { poNumber: 'folders.1' }, documentFromEvent: true },
} as unknown as Trigger;
const dropped = (payload: Record<string, unknown>): AmbientEvent => ({
  orgSlug: 'finance', sourceType: 'event', pushed: { id: 'e1', name: 'invoice.received', source: 'storage:intake/invoices/' }, payload, timestamp: 't',
});

describe('a workflow trigger that takes in the event\'s file', () => {
  const database = { insertExecution: jest.fn(), updateExecution: jest.fn(), updateTriggerLastFired: jest.fn() };
  const launcher = { runtimeEntry: jest.fn(async () => ({ ok: true, value: { kind: 'runtime' } })), launch: jest.fn(async () => ({ ok: true, value: { id: 'run-1', status: 'queued' } })) };
  const documents = { adopt: jest.fn(async () => ({ ref: 'finance/c/uuid-INV-7.txt', filename: 'INV-7.txt', mimeType: 'text/plain' })) };
  const executor = new TriggerExecutorService(
    database as unknown as AmbientDatabaseService,
    { emitWorkflowCompleted: jest.fn(), emitWorkflowFailed: jest.fn() } as unknown as StreamingService,
    new ConfigService({ DEFAULT_LLM_PROVIDER: 'openrouter', DEFAULT_LLM_MODEL: 'm' }),
    {} as InvokeDispatchService,
    launcher as unknown as WorkflowRunLauncher,
    {} as TriggerRepliesService,
    documents as unknown as WorkflowDocumentsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('copies the file into the run and starts it with the PO from the folder', async () => {
    await executor.execute(trigger, dropped({ channel: 'storage', bucket: 'intake', path: 'invoices/PO-4502/INV-7.txt', filename: 'INV-7.txt', folders: ['invoices', 'PO-4502'] }));
    const [context, source] = documents.adopt.mock.calls[0] as unknown as [{ conversationId: string; orgSlug: string; userId: string }, unknown];
    expect(source).toEqual({ bucket: 'intake', path: 'invoices/PO-4502/INV-7.txt', filename: 'INV-7.txt' });
    const [, request] = launcher.launch.mock.calls[0] as unknown as [unknown, { context: { conversationId: string }; input: unknown; documents: unknown }];
    expect(request).toMatchObject({ input: { poNumber: 'PO-4502' }, documents: [{ ref: 'finance/c/uuid-INV-7.txt' }] });
    expect(request.context.conversationId).toBe(context.conversationId);
    expect(context).toMatchObject({ orgSlug: 'finance', userId: '00000000-0000-0000-0000-000000000000' });
  });

  it('fails the execution, and starts nothing, when the event names no file', async () => {
    await expect(executor.execute(trigger, dropped({ channel: 'a2a', message: 'x' }))).rejects.toThrow('the event names none');
    expect(launcher.launch).not.toHaveBeenCalled();
    expect(database.updateExecution).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'failed' }));
  });
});
