import { ForbiddenException } from '@nestjs/common';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

import { LlmAnalyticsController } from './llm-analytics.controller';
import { LlmAnalyticsService } from './llm-analytics.service';

function service() {
  const rawQuery = jest.fn(async () => ({ data: [], error: null }));
  const from = jest.fn(() => ({ select: async () => ({ data: [], error: null }) }));
  return { svc: new LlmAnalyticsService({ rawQuery, from } as never), rawQuery };
}

const SCOPE = 'conversation_id IN (SELECT id FROM public.conversations WHERE organization_slug =';

describe('LLM usage analytics org scoping', () => {
  it.each(['getUsage', 'getCosts', 'getModels'] as const)(
    '%s reads only the org admin’s org, and everything for a super-admin',
    async (method) => {
      const { svc, rawQuery } = service();
      await svc[method]('corporate');
      const [sql, params] = rawQuery.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain(SCOPE);
      expect(params).toEqual(['corporate']);

      rawQuery.mockClear();
      await svc[method]('*');
      const [allSql, allParams] = rawQuery.mock.calls[0] as unknown as [string, unknown[]];
      expect(allSql).not.toContain(SCOPE);
      expect(allParams).toEqual([]);
    },
  );

  it("lists an org admin's org only, ignoring an orgSlug they pass, with run and caller filters", async () => {
    const { svc, rawQuery } = service();
    await svc.listUsage({ orgSlug: 'legal', conversationId: 'run-1', callerType: 'workflow' }, 'corporate');
    const [sql, params] = rawQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain(`${SCOPE} $1)`);
    expect(sql).toContain('conversation_id = $2');
    expect(sql).toContain('caller_type = $3');
    expect(params.slice(0, 3)).toEqual(['corporate', 'run-1', 'workflow']);
  });

  it('lets a super-admin narrow the list to one org, or read all', async () => {
    const { svc, rawQuery } = service();
    await svc.listUsage({ orgSlug: 'legal' }, '*');
    expect((rawQuery.mock.calls[0] as unknown as [string, unknown[]])[1][0]).toBe('legal');
    rawQuery.mockClear();
    await svc.listUsage({}, '*');
    expect((rawQuery.mock.calls[0] as unknown as [string])[0]).not.toContain(SCOPE);
  });

  it("scopes a reasoning read to the reader's org", async () => {
    const { svc, rawQuery } = service();
    await expect(svc.getUsageReasoning('u1', 'corporate')).rejects.toThrow('not found');
    const [sql, params] = rawQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain(`${SCOPE} $2)`);
    expect(params).toEqual(['u1', 'corporate']);
  });
});

describe('Model catalog writes', () => {
  function controller() {
    const analytics = { createModel: jest.fn(), updateModel: jest.fn() };
    const sync = { sync: jest.fn() };
    return { ctl: new LlmAnalyticsController(analytics as never, sync as never), analytics, sync };
  }

  it('are refused to an org admin, since the catalog is shared by every org', async () => {
    const { ctl, analytics, sync } = controller();
    const orgAdmin = { organizationSlug: 'corporate' };
    await expect(ctl.syncModelCatalog(orgAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctl.createModel({} as never, orgAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctl.updateModel('openrouter', 'x', {} as never, orgAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(analytics.createModel).not.toHaveBeenCalled();
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it('are allowed to a platform super-admin', async () => {
    const { ctl, sync } = controller();
    await ctl.syncModelCatalog({ organizationSlug: '*' });
    expect(sync.sync).toHaveBeenCalled();
  });
});
