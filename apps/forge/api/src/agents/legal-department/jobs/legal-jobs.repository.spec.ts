import { Test, TestingModule } from '@nestjs/testing';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type QueryBuilder,
} from '@orchestrator-ai/transport-types';
import { LegalJobsRepository } from './legal-jobs.repository';
import { AgentJobRow } from './legal-jobs.types';

/**
 * Builds a stub QueryBuilder whose chained calls all return `this` and whose
 * terminal `await` resolves to a fixed { data, error } payload.
 */
function makeBuilder(payload: {
  data: unknown;
  error: unknown;
}): QueryBuilder & {
  calls: Array<[string, unknown[]]>;
} {
  const calls: Array<[string, unknown[]]> = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => resolve(payload);
      }
      if (prop === 'calls') return calls;
      return (...args: unknown[]) => {
        calls.push([String(prop), args]);
        return builder;
      };
    },
  };
  const builder = new Proxy({}, handler) as QueryBuilder & {
    calls: Array<[string, unknown[]]>;
  };
  return builder;
}

function makeDb(payload: { data: unknown; error: unknown }) {
  const fromCalls: Array<[string | null, string]> = [];
  const rawCalls: Array<[string, unknown[] | undefined]> = [];
  const builder = makeBuilder(payload);
  const db: DatabaseService = {
    from: (schema, table) => {
      fromCalls.push([schema, table]);
      return builder;
    },
    rpc: async () => ({ data: null, error: null }),
    rawQuery: async (sql, params) => {
      rawCalls.push([sql, params]);
      return payload as { data: unknown; error: null } as never;
    },
    checkConnection: async () => ({ status: 'ok', message: 'ok' }),
    getConfig: () => ({
      provider: 'stub',
      url: '',
      schemas: [],
      clientsAvailable: { service: true, anon: false },
    }),
  };
  return { db, builder, fromCalls, rawCalls };
}

const sampleRow: AgentJobRow = {
  id: 'job-1',
  org_slug: 'org-a',
  user_id: 'user-1',
  conversation_id: 'conv-1',
  agent_slug: 'legal-department',
  job_type: 'document-analysis',
  provider: 'ollama',
  model: 'gemma4:e4b',
  status: 'queued',
  current_step: null,
  progress: 0,
  last_message: null,
  error: null,
  input: { data: { content: 'hello' } },
  result: null,
  queued_at: '2026-04-07T00:00:00Z',
  started_at: null,
  completed_at: null,
};

async function makeRepo(payload: { data: unknown; error: unknown }) {
  const stubs = makeDb(payload);
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      LegalJobsRepository,
      { provide: DATABASE_SERVICE, useValue: stubs.db },
    ],
  }).compile();
  return { repo: moduleRef.get(LegalJobsRepository), ...stubs };
}

describe('LegalJobsRepository', () => {
  it('insertQueued returns the inserted row and targets the legal schema', async () => {
    const { repo, fromCalls } = await makeRepo({
      data: sampleRow,
      error: null,
    });
    const inserted = await repo.insertQueued(
      {
        context: {
          orgSlug: 'org-a',
          userId: 'user-1',
          conversationId: 'caller-conv',
          agentSlug: 'legal-department',
          agentType: 'langgraph',
          provider: 'ollama',
          model: 'gemma4:e4b',
        },
        data: { content: 'hello' },
      },
      'conv-1',
    );
    expect(inserted.id).toBe('job-1');
    expect(fromCalls[0]).toEqual(['legal', 'agent_jobs']);
  });

  it('insertQueued throws on db error', async () => {
    const { repo } = await makeRepo({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      repo.insertQueued(
        {
          context: {
            orgSlug: 'org-a',
            userId: 'user-1',
            conversationId: 'caller-conv',
            agentSlug: 'legal-department',
            agentType: 'langgraph',
            provider: 'ollama',
            model: 'gemma4:e4b',
          },
          data: { content: 'hello' },
        },
        'conv-1',
      ),
    ).rejects.toThrow(/boom/);
  });

  it('findByIdForOrg filters by both id and org_slug', async () => {
    const { repo, builder } = await makeRepo({
      data: sampleRow,
      error: null,
    });
    const result = await repo.findByIdForOrg('job-1', 'org-a');
    expect(result?.id).toBe('job-1');
    const eqColumns = builder.calls
      .filter(([m]) => m === 'eq')
      .map(([, args]) => args[0]);
    expect(eqColumns).toEqual(expect.arrayContaining(['id', 'org_slug']));
  });

  it('findByIdForOrg returns null when row missing', async () => {
    const { repo } = await makeRepo({ data: null, error: null });
    expect(await repo.findByIdForOrg('job-x', 'org-a')).toBeNull();
  });

  it('listForOrg orders by queued_at desc and filters by org', async () => {
    const { repo, builder } = await makeRepo({
      data: [sampleRow],
      error: null,
    });
    const rows = await repo.listForOrg('org-a');
    expect(rows).toHaveLength(1);
    const orderCalls = builder.calls.filter(([m]) => m === 'order');
    expect(orderCalls[0]?.[1]?.[0]).toBe('queued_at');
    expect(orderCalls[0]?.[1]?.[1]).toEqual({ ascending: false });
    const orgEq = builder.calls.find(
      ([m, args]) => m === 'eq' && args[0] === 'org_slug',
    );
    expect(orgEq?.[1][1]).toBe('org-a');
  });

  it('claimNextQueued returns null when no rows', async () => {
    const { repo } = await makeRepo({ data: [], error: null });
    expect(await repo.claimNextQueued()).toBeNull();
  });

  it('claimNextQueued returns the first row when present', async () => {
    const { repo, rawCalls } = await makeRepo({
      data: [sampleRow],
      error: null,
    });
    const claimed = await repo.claimNextQueued();
    expect(claimed?.id).toBe('job-1');
    expect(rawCalls[0]?.[0]).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('listEventsForConversation queries public.observability_events by conversation_id', async () => {
    const { repo, builder, fromCalls } = await makeRepo({
      data: [{ id: 1 }],
      error: null,
    });
    const events = await repo.listEventsForConversation('conv-1');
    expect(events).toHaveLength(1);
    expect(fromCalls[0]).toEqual([null, 'observability_events']);
    const eqCall = builder.calls.find(([m]) => m === 'eq');
    expect(eqCall?.[1]).toEqual(['conversation_id', 'conv-1']);
  });
});
