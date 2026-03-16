import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowExecutorService } from './workflow-executor.service';
import { WorkflowRegistryService, WorkflowDefinition } from './workflow-registry.service';
import { StreamingService } from '../streaming/streaming.service';

const makeDefinition = (overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: 'wf-exec-1',
  name: 'Executor Test Workflow',
  description: 'A workflow for executor tests',
  trigger: 'manual',
  steps: [
    { id: 'step-1', name: 'Alpha Step', action: 'notify.user' },
    { id: 'step-2', name: 'Beta Step', action: 'log.result' },
  ],
  enabled: true,
  ...overrides,
});

describe('WorkflowExecutorService', () => {
  let executor: WorkflowExecutorService;
  let registry: WorkflowRegistryService;
  let streaming: StreamingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowExecutorService, WorkflowRegistryService, StreamingService],
    }).compile();

    executor = module.get<WorkflowExecutorService>(WorkflowExecutorService);
    registry = module.get<WorkflowRegistryService>(WorkflowRegistryService);
    streaming = module.get<StreamingService>(StreamingService);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  describe('execute()', () => {
    it('should throw when the workflow id does not exist', async () => {
      await expect(executor.execute('nonexistent-wf')).rejects.toThrow(
        'Workflow nonexistent-wf not found',
      );
    });

    it('should return a completed WorkflowRun', async () => {
      registry.register(makeDefinition());
      const run = await executor.execute('wf-exec-1');

      expect(run.workflowId).toBe('wf-exec-1');
      expect(run.status).toBe('completed');
      expect(run.triggeredBy).toBe('manual');
      expect(run.startedAt).toBeDefined();
      expect(run.completedAt).toBeDefined();
      expect(run.error).toBeNull();
    });

    it('should set outcome with step results for each step', async () => {
      registry.register(makeDefinition());
      const run = await executor.execute('wf-exec-1');

      expect(run.outcome).toBeDefined();
      const steps = (run.outcome as { steps: Record<string, unknown> }).steps;
      expect(steps['step-1']).toBeDefined();
      expect(steps['step-2']).toBeDefined();
    });

    it('should record the run in the registry', async () => {
      registry.register(makeDefinition());
      const run = await executor.execute('wf-exec-1');
      const runs = registry.getRuns('wf-exec-1');
      expect(runs.some((r) => r.id === run.id)).toBe(true);
    });

    it('should emit workflow.triggered and workflow.completed SSE events', async () => {
      const emitTriggered = jest.spyOn(streaming, 'emitWorkflowTriggered');
      const emitCompleted = jest.spyOn(streaming, 'emitWorkflowCompleted');

      registry.register(makeDefinition());
      await executor.execute('wf-exec-1', { someKey: 'someValue' });

      expect(emitTriggered).toHaveBeenCalledWith('wf-exec-1', 'manual', { someKey: 'someValue' });
      expect(emitCompleted).toHaveBeenCalledWith('wf-exec-1', expect.any(Object));
    });

    it('should pass triggerData through to emitWorkflowTriggered', async () => {
      const emitTriggered = jest.spyOn(streaming, 'emitWorkflowTriggered');
      registry.register(makeDefinition());
      await executor.execute('wf-exec-1', { table: 'users', eventType: 'INSERT' });
      expect(emitTriggered).toHaveBeenCalledWith(
        'wf-exec-1',
        'manual',
        { table: 'users', eventType: 'INSERT' },
      );
    });

    it('should produce a unique run id on each execution', async () => {
      registry.register(makeDefinition());
      const runA = await executor.execute('wf-exec-1');
      const runB = await executor.execute('wf-exec-1');
      expect(runA.id).not.toBe(runB.id);
    });
  });

  describe('triggerByType()', () => {
    it('should execute all enabled workflows matching the trigger type', async () => {
      registry.register(makeDefinition({ id: 'wf-db-1', trigger: 'db-change', enabled: true }));
      registry.register(makeDefinition({ id: 'wf-db-2', trigger: 'db-change', enabled: true }));
      registry.register(makeDefinition({ id: 'wf-file-1', trigger: 'file-change', enabled: true }));

      const runs = await executor.triggerByType('db-change', { table: 'orders' });
      expect(runs.length).toBe(2);
      runs.forEach((r) => expect(r.status).toBe('completed'));
    });

    it('should skip disabled workflows', async () => {
      registry.register(makeDefinition({ id: 'wf-enabled', trigger: 'db-change', enabled: true }));
      registry.register(makeDefinition({ id: 'wf-disabled', trigger: 'db-change', enabled: false }));

      const runs = await executor.triggerByType('db-change', {});
      expect(runs.length).toBe(1);
      expect(runs[0]!.workflowId).toBe('wf-enabled');
    });

    it('should return empty array when no workflows match the trigger type', async () => {
      registry.register(makeDefinition({ trigger: 'file-change', enabled: true }));
      const runs = await executor.triggerByType('db-change', {});
      expect(runs).toEqual([]);
    });

    it('should emit SSE events for each triggered workflow', async () => {
      const emitTriggered = jest.spyOn(streaming, 'emitWorkflowTriggered');
      const emitCompleted = jest.spyOn(streaming, 'emitWorkflowCompleted');

      registry.register(makeDefinition({ id: 'wf-sse-1', trigger: 'scheduled', enabled: true }));
      registry.register(makeDefinition({ id: 'wf-sse-2', trigger: 'scheduled', enabled: true }));

      await executor.triggerByType('scheduled', {});

      expect(emitTriggered).toHaveBeenCalledTimes(2);
      expect(emitCompleted).toHaveBeenCalledTimes(2);
    });
  });
});
