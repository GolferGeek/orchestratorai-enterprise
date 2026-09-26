/**
 * A real pause and resume through the Postgres checkpointer: the graph stops
 * at interrupt(), a brand-new saver (as after a restart) resumes the thread
 * with the human's answer, and the node before the gate does not run again.
 *
 * Set CHECKPOINTER_TEST_DATABASE_URL to run it (skipped otherwise).
 */
import { randomUUID } from 'node:crypto';
import {
  Annotation,
  Command,
  END,
  START,
  StateGraph,
  interrupt,
} from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { ConfigProvider } from '../../config/config-provider.interface';
import { createCheckpointSaver } from '../checkpointer.factory';

const url = process.env.CHECKPOINTER_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

const State = Annotation.Root({
  draft: Annotation<string>(),
  decision: Annotation<string>(),
});

describeWithDb('checkpointer plane against Postgres', () => {
  const threadId = randomUUID();
  const draftRuns: string[] = [];
  const savers: PostgresSaver[] = [];

  function graph(saver: PostgresSaver) {
    return new StateGraph(State)
      .addNode('write', () => {
        draftRuns.push(threadId);
        return { draft: 'v1' };
      })
      .addNode('review', (state) => ({
        decision: interrupt({ draft: state.draft }) as string,
      }))
      .addEdge(START, 'write')
      .addEdge('write', 'review')
      .addEdge('review', END)
      .compile({ checkpointer: saver });
  }

  async function freshSaver(): Promise<PostgresSaver> {
    const config = {
      getRequired: () => 'postgres',
      getSecret: async () => url,
    } as unknown as ConfigProvider;
    const saver = (await createCheckpointSaver(config)) as PostgresSaver;
    savers.push(saver);
    return saver;
  }

  afterAll(async () => {
    await savers[0]?.deleteThread(threadId);
    await Promise.all(savers.map((saver) => saver.end()));
  });

  it('pauses at the gate and resumes from a new saver with the answer', async () => {
    const config = { configurable: { thread_id: threadId } };

    const paused = await graph(await freshSaver()).invoke({ draft: '', decision: '' }, config);
    expect(paused.decision).toBe('');
    const waiting = await graph(savers[0]!).getState(config);
    expect(waiting.next).toEqual(['review']);

    const resumed = await graph(await freshSaver()).invoke(new Command({ resume: 'approve' }), config);
    expect(resumed).toMatchObject({ draft: 'v1', decision: 'approve' });
    expect(draftRuns).toEqual([threadId]);
  });
});
