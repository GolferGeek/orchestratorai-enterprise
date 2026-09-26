import { describe, expect, it } from 'vitest';
import { workflowRouteName } from './workflowUiRegistry';

describe('workflowRouteName', () => {
  it('routes marketing-swarm to its page', () => {
    expect(workflowRouteName('marketing-swarm')).toBe('MarketingSwarm');
  });

  it('returns null for a registered workflow with no page', () => {
    expect(workflowRouteName('decision-risk')).toBeNull();
  });
});
