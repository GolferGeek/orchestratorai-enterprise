import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

const awaitHumanReview = jest.fn();
jest.mock('../reviews', () => ({
  ...jest.requireActual('../reviews'),
  awaitHumanReview: (...args: unknown[]) => awaitHumanReview(...args),
}));

import type { WorkflowAgentRuntime } from '../agents';
import type { HumanGate, HumanReviewService } from '../reviews';
import { WorkUnitService } from './work-unit.service';
import type { WorkUnitsRepository } from './work-units.repository';

const gate: HumanGate = {
  slug: 'approve',
  kind: 'approval',
  allowedDecisions: ['approve', 'reject'],
  allowItemDecisions: false,
  onReject: 'rerun_stage',
  taskTitle: 'Approve',
};

function setup() {
  const repo = {
    startUnit: jest.fn(async () => 'unit-1'),
    finishUnit: jest.fn(async () => undefined),
  };
  const service = new WorkUnitService(
    repo as unknown as WorkUnitsRepository,
    {} as WorkflowAgentRuntime,
    {} as HumanReviewService,
  );
  const scope = {
    executionContext: createMockExecutionContext({ orgSlug: 'corporate', agentType: 'workflow' }),
    modelProfile: {},
  };
  return { service, repo, scope };
}

describe('WorkUnitService.runHuman', () => {
  it('records nothing on the pass that pauses the run', async () => {
    const { service, repo, scope } = setup();
    awaitHumanReview.mockRejectedValueOnce(new Error('GraphInterrupt'));
    await expect(service.runHuman(scope, { slug: 'review', gate, round: 0, payload: { draft: 'x' } })).rejects.toThrow(
      'GraphInterrupt',
    );
    expect(repo.startUnit).not.toHaveBeenCalled();
  });

  it('records the response as a completed human unit on resume', async () => {
    const { service, repo, scope } = setup();
    const response = { kind: 'decision', decision: { type: 'approve' } };
    awaitHumanReview.mockResolvedValueOnce(response);
    await expect(service.runHuman(scope, { slug: 'review', gate, round: 1, payload: { draft: 'x' } })).resolves.toEqual(
      response,
    );
    expect(repo.startUnit).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: 'human', metadata: { gate: 'approve', round: 1 } }),
    );
    expect(repo.finishUnit).toHaveBeenCalledWith('unit-1', 'corporate', expect.any(Number), {
      status: 'completed',
      output: { truncated: false, value: response },
    });
  });
});
