import { Test, TestingModule } from '@nestjs/testing';
import {
  WorkflowRegistryService,
  WorkflowDefinition,
  WorkflowRun,
} from './workflow-registry.service';

const makeDefinition = (overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: 'wf-test-1',
  name: 'Test Workflow',
  description: 'A test workflow',
  trigger: 'manual',
  steps: [
    { id: 'step-1', name: 'Step One', action: 'log.info' },
  ],
  enabled: true,
  ...overrides,
});

const makeRun = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 'run-abc123',
  workflowId: 'wf-test-1',
  status: 'completed',
  triggeredBy: 'manual',
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  outcome: { steps: {} },
  error: null,
  ...overrides,
});

describe('WorkflowRegistryService', () => {
  let service: WorkflowRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowRegistryService],
    }).compile();

    service = module.get<WorkflowRegistryService>(WorkflowRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register()', () => {
    it('should register a workflow definition', () => {
      const def = makeDefinition();
      service.register(def);
      expect(service.getById('wf-test-1')).toEqual(def);
    });

    it('should overwrite an existing workflow with the same id', () => {
      service.register(makeDefinition({ name: 'Old Name' }));
      service.register(makeDefinition({ name: 'New Name' }));
      expect(service.getById('wf-test-1')!.name).toBe('New Name');
    });
  });

  describe('getAll()', () => {
    it('should return all registered workflows', () => {
      service.register(makeDefinition({ id: 'wf-1', name: 'WF 1' }));
      service.register(makeDefinition({ id: 'wf-2', name: 'WF 2' }));
      const all = service.getAll();
      expect(all.length).toBe(2);
    });

    it('should return empty array when no workflows registered', () => {
      expect(service.getAll()).toEqual([]);
    });
  });

  describe('getById()', () => {
    it('should return undefined for unknown id', () => {
      expect(service.getById('unknown')).toBeUndefined();
    });

    it('should return the registered workflow', () => {
      service.register(makeDefinition());
      expect(service.getById('wf-test-1')).toBeDefined();
    });
  });

  describe('enable() and disable()', () => {
    it('should enable a disabled workflow', () => {
      service.register(makeDefinition({ enabled: false }));
      service.enable('wf-test-1');
      expect(service.getById('wf-test-1')!.enabled).toBe(true);
    });

    it('should disable an enabled workflow', () => {
      service.register(makeDefinition({ enabled: true }));
      service.disable('wf-test-1');
      expect(service.getById('wf-test-1')!.enabled).toBe(false);
    });

    it('should not throw when enabling a non-existent workflow', () => {
      expect(() => service.enable('nonexistent')).not.toThrow();
    });

    it('should not throw when disabling a non-existent workflow', () => {
      expect(() => service.disable('nonexistent')).not.toThrow();
    });
  });

  describe('recordRun()', () => {
    it('should record a workflow run', () => {
      const run = makeRun();
      service.recordRun(run);
      const runs = service.getRuns();
      expect(runs).toContainEqual(run);
    });

    it('should cap the run history at 200 entries', () => {
      for (let i = 0; i < 205; i++) {
        service.recordRun(makeRun({ id: `run-${i}` }));
      }
      expect(service.getRuns().length).toBe(200);
    });
  });

  describe('getRuns()', () => {
    it('should return all runs in reverse chronological order when no workflowId provided', () => {
      const runA = makeRun({ id: 'run-a' });
      const runB = makeRun({ id: 'run-b' });
      service.recordRun(runA);
      service.recordRun(runB);
      const runs = service.getRuns();
      // Reversed: runB is last recorded, so it comes first
      expect(runs[0]!.id).toBe('run-b');
      expect(runs[1]!.id).toBe('run-a');
    });

    it('should filter runs by workflowId when provided', () => {
      service.recordRun(makeRun({ id: 'run-wf1', workflowId: 'wf-1' }));
      service.recordRun(makeRun({ id: 'run-wf2', workflowId: 'wf-2' }));
      service.recordRun(makeRun({ id: 'run-wf1b', workflowId: 'wf-1' }));

      const wf1Runs = service.getRuns('wf-1');
      expect(wf1Runs.length).toBe(2);
      wf1Runs.forEach((r) => expect(r.workflowId).toBe('wf-1'));
    });

    it('should return empty array when no runs recorded', () => {
      expect(service.getRuns()).toEqual([]);
    });
  });
});
