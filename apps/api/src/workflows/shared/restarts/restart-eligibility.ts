import type { WorkflowRunStatus } from '@orchestrator-ai/transport-types';

/** Runs that have stopped for good: a branch cannot race its parent. */
const FINISHED: readonly WorkflowRunStatus[] = ['completed', 'failed'];

/**
 * Whether a new run can branch from the end of this work unit. The run must
 * have finished, the unit must have completed (its output is what the branch
 * starts from), and the workflow must declare the unit as a restart point.
 */
export function restartEligibility(
  run: { status: WorkflowRunStatus },
  unit: { slug: string; status: string },
  restartPoints: Record<string, { resumeAt: string }>,
): { eligible: boolean; reason: string | null } {
  if (!FINISHED.includes(run.status)) {
    return { eligible: false, reason: `The run is ${run.status.replace('_', ' ')}; restart it once it has finished.` };
  }
  if (unit.status !== 'completed' && unit.status !== 'completed_partial') {
    return { eligible: false, reason: `This step ${unit.status === 'failed' ? 'failed' : 'did not complete'}, so there is nothing to continue from.` };
  }
  if (!restartPoints[unit.slug]) {
    return { eligible: false, reason: 'This workflow cannot restart from this step.' };
  }
  return { eligible: true, reason: null };
}
