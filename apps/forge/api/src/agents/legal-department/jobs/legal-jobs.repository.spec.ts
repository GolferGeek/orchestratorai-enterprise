import { Test, TestingModule } from '@nestjs/testing';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type QueryBuilder,
} from '@orchestrator-ai/transport-types';
import { LegalJobsRepository, isAccessAllowed } from './legal-jobs.repository';
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
  original_file_path: null,
  document_paths: [],
  document_count: 1,
  review_decision: null,
  access_control: { mode: 'open' },
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

  it('listEventsForConversation queries public.observability_events by conversation_id OR task_id', async () => {
    const { repo, builder, fromCalls } = await makeRepo({
      data: [{ id: 1 }],
      error: null,
    });
    const events = await repo.listEventsForConversation('conv-1');
    expect(events).toHaveLength(1);
    expect(fromCalls[0]).toEqual([null, 'observability_events']);
    // The repository uses .or() to match either the dedicated
    // conversation_id column or the legacy task_id column that the
    // existing observability pipeline writes into.
    const orCall = builder.calls.find(([m]) => m === 'or');
    expect(orCall?.[1]?.[0]).toBe(
      'conversation_id.eq.conv-1,task_id.eq.conv-1',
    );
  });

  // ── Phase 4: findReasoningForSpecialist ─────────────────────────────────

  describe('findReasoningForSpecialist', () => {
    it('returns thinking content when a matching llm_usage row exists', async () => {
      const reasoningRow = {
        thinking_content: 'The contract has a non-compete clause...',
        thinking_duration_ms: 1500,
        thinking_token_count: 42,
      };

      // Build a repo whose rawQuery returns the reasoning row
      const stubs = makeDb({ data: [reasoningRow], error: null });
      const moduleRef = await Test.createTestingModule({
        providers: [
          LegalJobsRepository,
          { provide: DATABASE_SERVICE, useValue: stubs.db },
        ],
      }).compile();
      const repo = moduleRef.get(LegalJobsRepository);

      const result = await repo.findReasoningForSpecialist(
        'job-1',
        'org-a',
        'contract',
      );

      expect(result).not.toBeNull();
      expect(result?.thinkingContent).toBe(
        'The contract has a non-compete clause...',
      );
      expect(result?.thinkingDurationMs).toBe(1500);
      expect(result?.thinkingTokenCount).toBe(42);

      // Verify the org-scoping parameters were passed
      const [sql, params] = stubs.rawCalls[0]!;
      expect(sql).toContain('legal.agent_jobs');
      expect(params).toContain('job-1');
      expect(params).toContain('org-a');
    });

    it('returns null when no matching row exists', async () => {
      const stubs = makeDb({ data: [], error: null });
      const moduleRef = await Test.createTestingModule({
        providers: [
          LegalJobsRepository,
          { provide: DATABASE_SERVICE, useValue: stubs.db },
        ],
      }).compile();
      const repo = moduleRef.get(LegalJobsRepository);

      const result = await repo.findReasoningForSpecialist(
        'job-1',
        'org-a',
        'compliance',
      );

      expect(result).toBeNull();
    });

    it('returns null when thinking_content column is null (non-reasoning model)', async () => {
      const rowWithNullContent = {
        thinking_content: null,
        thinking_duration_ms: null,
        thinking_token_count: null,
      };
      const stubs = makeDb({ data: [rowWithNullContent], error: null });
      const moduleRef = await Test.createTestingModule({
        providers: [
          LegalJobsRepository,
          { provide: DATABASE_SERVICE, useValue: stubs.db },
        ],
      }).compile();
      const repo = moduleRef.get(LegalJobsRepository);

      const result = await repo.findReasoningForSpecialist(
        'job-1',
        'org-a',
        'contract',
      );

      expect(result).toBeNull();
    });

    it('passes both agent_name patterns (with and without -agent suffix)', async () => {
      const stubs = makeDb({ data: [], error: null });
      const moduleRef = await Test.createTestingModule({
        providers: [
          LegalJobsRepository,
          { provide: DATABASE_SERVICE, useValue: stubs.db },
        ],
      }).compile();
      const repo = moduleRef.get(LegalJobsRepository);

      await repo.findReasoningForSpecialist('job-1', 'org-a', 'contract');

      const [, params] = stubs.rawCalls[0]!;
      const paramList = params as unknown[];
      // Should include both legal-department:contract-agent and legal-department:contract
      expect(paramList).toContain('legal-department:contract-agent');
      expect(paramList).toContain('legal-department:contract');
    });
  });

  // ── Phase 4: listSpecialistKeysWithReasoning ─────────────────────────────

  describe('listSpecialistKeysWithReasoning', () => {
    it('strips the prefix and suffix to return clean specialist keys', async () => {
      const rows = [
        { agent_name: 'legal-department:contract-agent' },
        { agent_name: 'legal-department:compliance-agent' },
        { agent_name: 'legal-department:synthesis' },
      ];
      const stubs = makeDb({ data: rows, error: null });
      const moduleRef = await Test.createTestingModule({
        providers: [
          LegalJobsRepository,
          { provide: DATABASE_SERVICE, useValue: stubs.db },
        ],
      }).compile();
      const repo = moduleRef.get(LegalJobsRepository);

      const keys = await repo.listSpecialistKeysWithReasoning('job-1', 'org-a');

      expect(keys).toEqual(
        expect.arrayContaining(['contract', 'compliance', 'synthesis']),
      );
      expect(keys).toHaveLength(3);
    });

    it('returns empty array when no rows have thinking_content', async () => {
      const stubs = makeDb({ data: [], error: null });
      const moduleRef = await Test.createTestingModule({
        providers: [
          LegalJobsRepository,
          { provide: DATABASE_SERVICE, useValue: stubs.db },
        ],
      }).compile();
      const repo = moduleRef.get(LegalJobsRepository);

      const keys = await repo.listSpecialistKeysWithReasoning('job-1', 'org-a');
      expect(keys).toEqual([]);
    });

    it('passes both job id and org_slug to the query for org-scoping', async () => {
      const stubs = makeDb({ data: [], error: null });
      const moduleRef = await Test.createTestingModule({
        providers: [
          LegalJobsRepository,
          { provide: DATABASE_SERVICE, useValue: stubs.db },
        ],
      }).compile();
      const repo = moduleRef.get(LegalJobsRepository);

      await repo.listSpecialistKeysWithReasoning('job-42', 'org-x');

      const [sql, params] = stubs.rawCalls[0]!;
      expect(sql).toContain('legal.agent_jobs');
      expect(params).toContain('job-42');
      expect(params).toContain('org-x');
    });
  });
});

describe('isAccessAllowed', () => {
  const openRow = {
    ...sampleRow,
    access_control: { mode: 'open' as const },
  };
  const restrictedRow = {
    ...sampleRow,
    user_id: 'creator-1',
    access_control: {
      mode: 'allowlist' as const,
      allowedUserIds: ['allowed-user-1', 'allowed-user-2'],
    },
  };

  it('returns true for open mode regardless of caller', () => {
    expect(isAccessAllowed(openRow, 'anyone', false)).toBe(true);
    expect(isAccessAllowed(openRow, undefined, false)).toBe(true);
  });

  it('returns true for the creator even if not in allowedUserIds', () => {
    expect(isAccessAllowed(restrictedRow, 'creator-1', false)).toBe(true);
  });

  it('returns true for an org admin even if not in allowedUserIds', () => {
    expect(isAccessAllowed(restrictedRow, 'random-admin', true)).toBe(true);
  });

  it('returns true for a listed user', () => {
    expect(isAccessAllowed(restrictedRow, 'allowed-user-1', false)).toBe(true);
  });

  it('returns false for an unlisted non-creator non-admin', () => {
    expect(isAccessAllowed(restrictedRow, 'outsider', false)).toBe(false);
  });

  it('returns false when callerUserId is undefined on restricted row', () => {
    expect(isAccessAllowed(restrictedRow, undefined, false)).toBe(false);
  });
});
