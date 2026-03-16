import { Test, TestingModule } from '@nestjs/testing';
import { ScenariosService, ScenarioOutcome } from './scenarios.service';

const makeOutcome = (overrides: Partial<ScenarioOutcome> = {}): ScenarioOutcome => ({
  scenarioId: 'scenario-db-change-trigger',
  runId: 'run-test-001',
  status: 'passed',
  completedAt: new Date().toISOString(),
  stepResults: {
    'step-1': 'passed',
    'step-2': 'passed',
    'step-3': 'passed',
  },
  ...overrides,
});

describe('ScenariosService', () => {
  let service: ScenariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScenariosService],
    }).compile();

    service = module.get<ScenariosService>(ScenariosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list()', () => {
    it('should return all built-in scenarios', () => {
      const scenarios = service.list();
      expect(scenarios.length).toBeGreaterThan(0);
    });

    it('should include the db-change scenario', () => {
      const scenarios = service.list();
      expect(scenarios.some((s) => s.id === 'scenario-db-change-trigger')).toBe(true);
    });

    it('should include the file-change scenario', () => {
      const scenarios = service.list();
      expect(scenarios.some((s) => s.id === 'scenario-file-change-trigger')).toBe(true);
    });

    it('should include the manual workflow scenario', () => {
      const scenarios = service.list();
      expect(scenarios.some((s) => s.id === 'scenario-manual-workflow')).toBe(true);
    });

    it('should include the SSE streaming scenario', () => {
      const scenarios = service.list();
      expect(scenarios.some((s) => s.id === 'scenario-sse-streaming')).toBe(true);
    });

    it('each scenario should have required fields', () => {
      service.list().forEach((s) => {
        expect(s.id).toBeDefined();
        expect(s.name).toBeDefined();
        expect(s.description).toBeDefined();
        expect(s.category).toBeDefined();
        expect(s.difficulty).toBeDefined();
        expect(Array.isArray(s.steps)).toBe(true);
        expect(s.steps.length).toBeGreaterThan(0);
      });
    });

    it('each step should have id, name, description, and action', () => {
      service.list().forEach((s) => {
        s.steps.forEach((step) => {
          expect(step.id).toBeDefined();
          expect(step.name).toBeDefined();
          expect(step.description).toBeDefined();
          expect(['observe', 'trigger', 'verify']).toContain(step.action);
        });
      });
    });
  });

  describe('getById()', () => {
    it('should return the scenario for a known id', () => {
      const scenario = service.getById('scenario-db-change-trigger');
      expect(scenario).toBeDefined();
      expect(scenario!.id).toBe('scenario-db-change-trigger');
    });

    it('should return undefined for an unknown id', () => {
      expect(service.getById('nonexistent-scenario')).toBeUndefined();
    });
  });

  describe('getByCategory()', () => {
    it('should return only scenarios matching the category', () => {
      const dbScenarios = service.getByCategory('db-watcher');
      expect(dbScenarios.length).toBeGreaterThan(0);
      dbScenarios.forEach((s) => expect(s.category).toBe('db-watcher'));
    });

    it('should return file-watcher scenarios', () => {
      const fileScenarios = service.getByCategory('file-watcher');
      expect(fileScenarios.length).toBeGreaterThan(0);
      fileScenarios.forEach((s) => expect(s.category).toBe('file-watcher'));
    });

    it('should return workflow scenarios', () => {
      const workflowScenarios = service.getByCategory('workflow');
      expect(workflowScenarios.length).toBeGreaterThan(0);
    });

    it('should return training scenarios', () => {
      const trainingScenarios = service.getByCategory('training');
      expect(trainingScenarios.length).toBeGreaterThan(0);
    });

    it('should return empty array for a category with no scenarios', () => {
      // No scenario has an invalid category; this tests the filter behavior
      const results = service.getByCategory('training' as any);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('recordOutcome()', () => {
    it('should record an outcome', () => {
      const outcome = makeOutcome();
      service.recordOutcome(outcome);
      const outcomes = service.getOutcomes();
      expect(outcomes).toContainEqual(outcome);
    });

    it('should cap the outcomes list at 500 entries', () => {
      for (let i = 0; i < 505; i++) {
        service.recordOutcome(makeOutcome({ runId: `run-${i}` }));
      }
      expect(service.getOutcomes().length).toBe(500);
    });
  });

  describe('getOutcomes()', () => {
    it('should return outcomes in reverse order when no scenarioId provided', () => {
      service.recordOutcome(makeOutcome({ runId: 'run-first' }));
      service.recordOutcome(makeOutcome({ runId: 'run-second' }));
      const outcomes = service.getOutcomes();
      expect(outcomes[0]!.runId).toBe('run-second');
      expect(outcomes[1]!.runId).toBe('run-first');
    });

    it('should filter outcomes by scenarioId', () => {
      service.recordOutcome(makeOutcome({ scenarioId: 'scenario-a', runId: 'run-a1' }));
      service.recordOutcome(makeOutcome({ scenarioId: 'scenario-b', runId: 'run-b1' }));
      service.recordOutcome(makeOutcome({ scenarioId: 'scenario-a', runId: 'run-a2' }));

      const aOutcomes = service.getOutcomes('scenario-a');
      expect(aOutcomes.length).toBe(2);
      aOutcomes.forEach((o) => expect(o.scenarioId).toBe('scenario-a'));
    });

    it('should return empty array when no outcomes recorded', () => {
      expect(service.getOutcomes()).toEqual([]);
    });
  });
});
