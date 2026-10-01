import { describe, expect, it } from 'vitest';
import { activeNavPath } from '@orchestratorai/ui';

const gatehouse = ['/app/gatehouse', '/app/gatehouse/agents', '/app/gatehouse/callers', undefined];

describe('activeNavPath', () => {
  it('lights the most specific item, not the overview on every page', () => {
    expect(activeNavPath(gatehouse, '/app/gatehouse')).toBe('/app/gatehouse');
    expect(activeNavPath(gatehouse, '/app/gatehouse/agents')).toBe('/app/gatehouse/agents');
    expect(activeNavPath(gatehouse, '/app/gatehouse/agents/send-invoice')).toBe('/app/gatehouse/agents');
    expect(activeNavPath(gatehouse, '/app/gatehouse/events')).toBe('/app/gatehouse');
  });

  it('does not match a path that only shares a prefix', () => {
    expect(activeNavPath(['/app/agents'], '/app/agents-admin')).toBeNull();
    expect(activeNavPath(gatehouse, '/app/ambient')).toBeNull();
  });
});
