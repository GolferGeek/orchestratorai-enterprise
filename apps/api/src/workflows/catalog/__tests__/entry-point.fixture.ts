import type { WorkflowEntryPoint } from '../workflow.registry';

/** A runtime entry point for specs that only need a registered workflow. */
export function testEntryPoint(over: Partial<WorkflowEntryPoint> = {}): WorkflowEntryPoint {
  return {
    kind: 'runtime',
    maxAttempts: 1,
    modelRoles: [],
    accessControl: { mode: 'org' },
    parseStartInput: (input) => input,
    runTitle: () => 'run',
    restartPoints: {},
    ...over,
  };
}
