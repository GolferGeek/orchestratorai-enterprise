import { ScenariosService } from './scenarios.service';

const outcome = {
  scenarioId: 'scenario-manual-workflow',
  runId: 'run-1',
  status: 'passed' as const,
  completedAt: new Date().toISOString(),
  stepResults: { 'step-1': 'passed' as const },
};

describe('ScenariosService tenant isolation', () => {
  it('scopes recorded outcomes to their organization and records attribution', () => {
    const service = new ScenariosService();
    service.recordOutcome(outcome, 'org-a', 'user-a');
    service.recordOutcome(
      { ...outcome, runId: 'run-2' },
      'org-b',
      'user-b',
    );

    expect(service.getOutcomes('org-a')).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        orgSlug: 'org-a',
        userId: 'user-a',
      }),
    ]);
    expect(service.getOutcomes('org-b')).toEqual([
      expect.objectContaining({
        runId: 'run-2',
        orgSlug: 'org-b',
        userId: 'user-b',
      }),
    ]);
  });
});
