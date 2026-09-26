import { NotFoundException } from '@nestjs/common';
import type { WorkflowRunsRepository } from '../runs';
import { WorkUnitTraceController } from './work-unit-trace.controller';
import type { WorkUnitTraceReader } from './work-unit-trace.reader';

const runId = '11111111-1111-4111-a111-111111111111';
const participantId = '22222222-2222-4222-a222-222222222222';

function setup(run: unknown = { id: runId, workflowSlug: 'decision-risk' }) {
  const runs = { getReadable: jest.fn(async () => run) };
  const trace = {
    units: jest.fn(async () => [{ workUnitId: 'u1' }]),
    participant: jest.fn(async (): Promise<unknown> => ({ participantId })),
  };
  const controller = new WorkUnitTraceController(
    runs as unknown as WorkflowRunsRepository,
    trace as unknown as WorkUnitTraceReader,
  );
  return { controller, runs, trace };
}

const user = { id: 'user-1' };
const req = { organizationSlug: 'corporate' };

describe('WorkUnitTraceController', () => {
  it('returns the trace of a run the caller may read, scoped by the RBAC org', async () => {
    const { controller, runs } = setup();
    await expect(controller.runTrace('decision-risk', runId, user, req)).resolves.toEqual({
      runId,
      workUnits: [{ workUnitId: 'u1' }],
    });
    expect(runs.getReadable).toHaveBeenCalledWith(runId, { userId: 'user-1', organizationSlug: 'corporate' });
  });

  it('404s an unreadable run, a run of another workflow, and a participant of another run', async () => {
    await expect(setup(null).controller.runTrace('decision-risk', runId, user, req)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const other = setup({ id: runId, workflowSlug: 'exec-digest' });
    await expect(other.controller.participant('decision-risk', runId, participantId, user, req)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(other.trace.participant).not.toHaveBeenCalled();
    const missing = setup();
    missing.trace.participant.mockResolvedValueOnce(null);
    await expect(missing.controller.participant('decision-risk', runId, participantId, user, req)).rejects.toThrow(
      `No participant ${participantId}`,
    );
  });
});
