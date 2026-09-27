import type { StateSnapshot } from '@langchain/langgraph';
import type { IssueLedgerService } from '../ledger';
import type { WorkflowRunRecord } from '../runs';
import { RestartForkError, WorkflowRestartService, type ForkableGraph } from './workflow-restart.service';

const snap = (next: string[], values: Record<string, unknown> = {}, createdAt = '2026-09-27T10:00:00.000Z') =>
  ({ next, values, createdAt, config: {}, tasks: [] }) as unknown as StateSnapshot;

const run = {
  id: 'child',
  executionContext: { orgSlug: 'corporate', conversationId: 'child' },
  modelProfile: {},
  restart: { parentRunId: 'parent', fromWorkUnitRunId: 'u', fromWorkUnitSlug: 'draft', resumeAt: 'polish', instruction: null },
} as unknown as WorkflowRunRecord;

function setup(history: StateSnapshot[], forkedNext = ['polish']) {
  const graph = {
    getStateHistory: jest.fn(async function* () {
      yield* history;
    }),
    updateState: jest.fn(async () => ({})),
    getState: jest.fn(async () => snap(forkedNext)),
  };
  const ledger = { copyAsOf: jest.fn(async () => 0) };
  const service = new WorkflowRestartService(ledger as unknown as IssueLedgerService);
  return { service, graph: graph as unknown as ForkableGraph & typeof graph, ledger };
}

describe('restart fork', () => {
  it("forks from the checkpoint the node before the branch point wrote, with this run's values", async () => {
    // Newest first. The resume's input checkpoint also names `polish`, but so
    // does its predecessor: the boundary is the one `draft` wrote.
    const { service, graph, ledger } = setup([
      snap([]),
      snap(['polish'], { draft: 'after resume' }, '2026-09-27T10:05:00.000Z'),
      snap(['polish'], { draft: 'done' }),
      snap(['draft']),
      snap(['__start__']),
    ]);
    await service.fork(graph, run, { executionContext: run.executionContext });
    expect(graph.getStateHistory).toHaveBeenCalledWith({ configurable: { thread_id: 'parent' } });
    expect(graph.updateState).toHaveBeenCalledWith(
      { configurable: { thread_id: 'child' } },
      { draft: 'done', executionContext: run.executionContext },
      'draft',
    );
    expect(ledger.copyAsOf).toHaveBeenCalledWith(
      'parent',
      { executionContext: run.executionContext, modelProfile: {} },
      new Date('2026-09-27T10:00:00.000Z'),
      'restart:parent',
    );
  });

  it('refuses a parent that never reached the branch point', async () => {
    const { service, graph } = setup([snap(['draft']), snap(['__start__'])]);
    await expect(service.fork(graph, run, {})).rejects.toBeInstanceOf(RestartForkError);
    expect(graph.updateState).not.toHaveBeenCalled();
  });

  it('refuses a fork that would not resume where the restart point says', async () => {
    const { service, graph } = setup([snap(['polish']), snap(['draft'])], ['summary']);
    await expect(service.fork(graph, run, {})).rejects.toThrow('would run [summary] next, not "polish"');
  });
});
