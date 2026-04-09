import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LlmAnalyticsService } from './llm-analytics.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

// Build a chainable DB mock that resolves to { data, error } when awaited
const makeChainable = (result: {
  data: unknown;
  error: null | { message: string };
}) => {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select',
    'eq',
    'order',
    'limit',
    'update',
    'insert',
    'single',
  ];
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['then'] = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  chain['catch'] = (reject: (e: unknown) => unknown) =>
    Promise.resolve(result).catch(reject);
  return chain;
};

describe('LlmAnalyticsService', () => {
  let service: LlmAnalyticsService;
  let mockDb: {
    from: jest.Mock;
    rawQuery: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      from: jest.fn().mockReturnValue(makeChainable({ data: [], error: null })),
      rawQuery: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmAnalyticsService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<LlmAnalyticsService>(LlmAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getUsage should return array', async () => {
    const result = await service.getUsage();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getModels should return array', async () => {
    mockDb.from.mockReturnValue(makeChainable({ data: [], error: null }));
    mockDb.rawQuery.mockResolvedValue({ data: [], error: null });

    const result = await service.getModels();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getCosts should return array', async () => {
    const result = await service.getCosts();
    expect(Array.isArray(result)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // listUsage
  // ---------------------------------------------------------------------------

  describe('listUsage', () => {
    const makeRow = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      id: 'row-uuid-1',
      created_at: '2026-04-08T10:00:00Z',
      started_at: '2026-04-08T10:00:00Z',
      completed_at: '2026-04-08T10:00:01Z',
      run_id: 'run-1',
      user_id: 'user-uuid',
      conversation_id: 'conv-uuid',
      agent_name: 'legal-department',
      provider_name: 'anthropic',
      model_name: 'claude-sonnet-4',
      input_tokens: 500,
      output_tokens: 200,
      total_cost: 0.005,
      duration_ms: 1200,
      status: 'completed',
      has_reasoning: true,
      thinking_duration_ms: 800,
      thinking_token_count: 150,
      ...overrides,
    });

    it('returns mapped rows without thinking_content', async () => {
      const rawRow = makeRow();
      mockDb.rawQuery.mockResolvedValueOnce({ data: [rawRow], error: null });

      const result = await service.listUsage({});

      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      const row = result[0]!;
      expect(row.id).toBe('row-uuid-1');
      expect(row.agentName).toBe('legal-department');
      expect(row.providerName).toBe('anthropic');
      expect(row.hasReasoning).toBe(true);
      expect(row.thinkingDurationMs).toBe(800);
      expect(row.thinkingTokenCount).toBe(150);
      // thinking_content must not appear on the returned object
      expect('thinkingContent' in row).toBe(false);
      // Phase 8: parsed caller-name fields
      expect(row.workflowSlug).toBe('legal-department');
      expect(row.nodeName).toBeNull();
    });

    it('parses workflowSlug and nodeName when agentName has colon format', async () => {
      const rawRow = makeRow({
        agent_name: 'legal-department:litigation-agent',
      });
      mockDb.rawQuery.mockResolvedValueOnce({ data: [rawRow], error: null });

      const result = await service.listUsage({});
      const row = result[0]!;
      expect(row.agentName).toBe('legal-department:litigation-agent');
      expect(row.workflowSlug).toBe('legal-department');
      expect(row.nodeName).toBe('litigation-agent');
    });

    it('returns null workflowSlug and nodeName when agentName is null', async () => {
      const rawRow = makeRow({ agent_name: null });
      mockDb.rawQuery.mockResolvedValueOnce({ data: [rawRow], error: null });

      const result = await service.listUsage({});
      const row = result[0]!;
      expect(row.agentName).toBeNull();
      expect(row.workflowSlug).toBeNull();
      expect(row.nodeName).toBeNull();
    });

    it('applies hasReasoning=true filter via SQL condition', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await service.listUsage({ hasReasoning: true });

      const [sql] = mockDb.rawQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('thinking_content IS NOT NULL');
      expect(sql).not.toContain('thinking_content IS NULL');
    });

    it('applies hasReasoning=false filter via SQL WHERE condition', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await service.listUsage({ hasReasoning: false });

      const [sql] = mockDb.rawQuery.mock.calls[0] as [string, unknown[]];
      // WHERE clause must contain the NULL check
      expect(sql).toContain('WHERE thinking_content IS NULL');
    });

    it('applies no WHERE reasoning filter when hasReasoning is undefined', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await service.listUsage({});

      const [sql] = mockDb.rawQuery.mock.calls[0] as [string, unknown[]];
      // There should be no WHERE clause at all (empty filters)
      expect(sql).not.toContain('WHERE');
    });

    it('passes agentName, provider, model as positional params', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await service.listUsage({
        agentName: 'my-agent',
        provider: 'openai',
        model: 'gpt-4o',
      });

      const [sql, params] = mockDb.rawQuery.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('agent_name =');
      expect(sql).toContain('provider_name =');
      expect(sql).toContain('model_name =');
      expect(params).toContain('my-agent');
      expect(params).toContain('openai');
      expect(params).toContain('gpt-4o');
    });

    it('applies from/to date filters', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await service.listUsage({ from: '2026-01-01', to: '2026-12-31' });

      const [sql, params] = mockDb.rawQuery.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('created_at >=');
      expect(sql).toContain('created_at <=');
      expect(params).toContain('2026-01-01');
      expect(params).toContain('2026-12-31');
    });

    it('caps limit at 200 and defaults offset to 0', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await service.listUsage({ limit: 999 });

      const [, params] = mockDb.rawQuery.mock.calls[0] as [string, unknown[]];
      // params: [...filterParams, limit, offset]
      const limitValue = params[params.length - 2];
      const offsetValue = params[params.length - 1];
      expect(limitValue).toBe(200);
      expect(offsetValue).toBe(0);
    });

    it('uses provided offset', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await service.listUsage({ limit: 10, offset: 50 });

      const [, params] = mockDb.rawQuery.mock.calls[0] as [string, unknown[]];
      const offsetValue = params[params.length - 1];
      expect(offsetValue).toBe(50);
    });

    it('throws when rawQuery returns an error', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB down' },
      });

      await expect(service.listUsage({})).rejects.toThrow(
        'Failed to list llm_usage: DB down',
      );
    });

    it('maps has_reasoning=false correctly', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({
        data: [
          makeRow({
            has_reasoning: false,
            thinking_duration_ms: null,
            thinking_token_count: null,
          }),
        ],
        error: null,
      });

      const rows = await service.listUsage({});
      expect(rows[0]).toBeDefined();
      const row = rows[0]!;
      expect(row.hasReasoning).toBe(false);
      expect(row.thinkingDurationMs).toBeNull();
      expect(row.thinkingTokenCount).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getUsageReasoning
  // ---------------------------------------------------------------------------

  describe('getUsageReasoning', () => {
    it('returns thinkingContent and metadata for existing row', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({
        data: [
          {
            thinking_content: 'This is the reasoning trace...',
            thinking_duration_ms: 800,
            thinking_token_count: 150,
          },
        ],
        error: null,
      });

      const result = await service.getUsageReasoning('row-uuid-1');

      expect(result.thinkingContent).toBe('This is the reasoning trace...');
      expect(result.thinkingDurationMs).toBe(800);
      expect(result.thinkingTokenCount).toBe(150);
    });

    it('returns null fields when thinking columns are null', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({
        data: [
          {
            thinking_content: null,
            thinking_duration_ms: null,
            thinking_token_count: null,
          },
        ],
        error: null,
      });

      const result = await service.getUsageReasoning('row-uuid-2');
      expect(result.thinkingContent).toBeNull();
      expect(result.thinkingDurationMs).toBeNull();
      expect(result.thinkingTokenCount).toBeNull();
    });

    it('throws NotFoundException when row does not exist', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({ data: [], error: null });

      await expect(service.getUsageReasoning('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws generic Error when rawQuery fails', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({
        data: null,
        error: { message: 'query failed' },
      });

      await expect(service.getUsageReasoning('any-id')).rejects.toThrow(
        'Failed to fetch reasoning for llm_usage any-id: query failed',
      );
    });

    it('passes the id as the only SQL parameter', async () => {
      mockDb.rawQuery.mockResolvedValueOnce({
        data: [
          {
            thinking_content: 'x',
            thinking_duration_ms: 1,
            thinking_token_count: 2,
          },
        ],
        error: null,
      });

      await service.getUsageReasoning('target-uuid');

      const [sql, params] = mockDb.rawQuery.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(params).toEqual(['target-uuid']);
      expect(sql).toContain('WHERE id = $1');
    });
  });
});
