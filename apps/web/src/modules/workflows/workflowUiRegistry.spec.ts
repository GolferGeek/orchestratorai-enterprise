import { describe, expect, it } from 'vitest';
import { workflowRouteName } from './workflowUiRegistry';

describe('workflowRouteName', () => {
  it('routes marketing-swarm to its page', () => {
    expect(workflowRouteName('marketing-swarm')).toBe('MarketingSwarm');
  });

  it('routes decision-risk to its page', () => {
    expect(workflowRouteName('decision-risk')).toBe('DecisionRisk');
  });

  it('routes exec-digest to its page', () => {
    expect(workflowRouteName('exec-digest')).toBe('ExecDigest');
  });

  it('returns null for a workflow with no page', () => {
    expect(workflowRouteName('no-such-workflow')).toBeNull();
  });
});
