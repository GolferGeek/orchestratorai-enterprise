import type { DatabaseService } from '@orchestrator-ai/transport-types';
import { TasksRepository } from './tasks.repository';

describe('TasksRepository.failInterrupted', () => {
  it('fails only working agent and partner tasks, whose answer died with the process', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const builder = {
      update: (values: unknown) => (calls.push(['update', values]), builder),
      eq: (column: string, value: unknown) => (calls.push(['eq', column, value]), builder),
      in: (column: string, values: unknown) => (calls.push(['in', column, values]), builder),
      select: () => Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }),
    };
    const db = { from: (schema: string, table: string) => (calls.push(['from', schema, table]), builder) } as unknown as DatabaseService;

    expect(await new TasksRepository(db).failInterrupted()).toBe(2);
    expect(calls).toEqual([
      ['from', 'gatehouse', 'tasks'],
      ['update', expect.objectContaining({ state: 'failed', status_message: 'Interrupted by a restart; send the request again' })],
      ['eq', 'state', 'working'],
      ['in', 'target', ['agent', 'a2a']],
    ]);
  });
});
