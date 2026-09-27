import { describe, expect, it } from 'vitest';
import { workflowRouteName } from './workflowUiRegistry';

describe('workflowRouteName', () => {
  it('routes marketing-swarm to its page', () => {
    expect(workflowRouteName('marketing-swarm')).toBe('MarketingSwarm');
  });

  it('routes decision-risk to its page', () => {
    expect(workflowRouteName('decision-risk')).toBe('DecisionRisk');
  });

  it('returns null for a registered workflow with no page', () => {
    expect(workflowRouteName('exec-digest')).toBeNull();
  });
});
