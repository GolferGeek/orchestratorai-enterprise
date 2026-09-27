import { ObservabilityService } from './observability.service';

function setup() {
  const rawQuery = jest.fn(async () => ({ data: [], error: null }));
  const drops = { count: 2, since: 't0', reasons: [{ reason: 'not stored: db down', count: 2 }], last: null };
  const service = new ObservabilityService({ rawQuery } as never, { getDropStats: () => drops } as never);
  return { service, rawQuery, drops };
}

describe('ObservabilityService org scoping', () => {
  it("limits an org admin's events and metrics to their org", async () => {
    const { service, rawQuery } = setup();
    await service.listEvents({ search: 'failed' }, 'corporate');
    const [eventsSql, eventsParams] = rawQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(eventsSql).toContain('org_slug = $1');
    expect(eventsParams[0]).toBe('corporate');

    await service.getMetrics('corporate');
    const [metricsSql, metricsParams] = rawQuery.mock.calls[1] as unknown as [string, unknown[]];
    expect(metricsSql).toContain('organization_slug = $1');
    expect(metricsParams).toEqual(['corporate']);
  });

  it('covers every org for a super-admin with none selected', async () => {
    const { service, rawQuery } = setup();
    await service.listEvents({}, '*');
    await service.getMetrics('*');
    const [eventsSql] = rawQuery.mock.calls[0] as unknown as [string];
    const [metricsSql, metricsParams] = rawQuery.mock.calls[1] as unknown as [string, unknown[]];
    expect(eventsSql).not.toContain('org_slug =');
    expect(metricsSql).not.toContain('organization_slug =');
    expect(metricsParams).toEqual([]);
  });

  it('shows dropped-event counts to a super-admin only (they are process-wide)', async () => {
    const { service, drops } = setup();
    expect((await service.getMetrics('*')).eventsDropped).toEqual(drops);
    expect((await service.getMetrics('corporate')).eventsDropped).toBeNull();
  });
});
