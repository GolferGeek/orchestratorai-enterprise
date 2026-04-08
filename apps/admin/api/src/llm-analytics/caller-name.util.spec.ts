import { parseCallerName } from './caller-name.util';

describe('parseCallerName', () => {
  // ── null / undefined / empty ───────────────────────────────────────────────

  it('returns nulls for null input', () => {
    expect(parseCallerName(null)).toEqual({
      workflowSlug: null,
      nodeName: null,
    });
  });

  it('returns nulls for undefined input', () => {
    expect(parseCallerName(undefined)).toEqual({
      workflowSlug: null,
      nodeName: null,
    });
  });

  it('returns nulls for empty string', () => {
    expect(parseCallerName('')).toEqual({
      workflowSlug: null,
      nodeName: null,
    });
  });

  it('returns nulls for whitespace-only string', () => {
    expect(parseCallerName('   ')).toEqual({
      workflowSlug: null,
      nodeName: null,
    });
  });

  // ── no colon (non-compliant plain AGENT_SLUG) ──────────────────────────────

  it('returns workflowSlug=name and nodeName=null when no colon present', () => {
    expect(parseCallerName('data-analyst')).toEqual({
      workflowSlug: 'data-analyst',
      nodeName: null,
    });
  });

  it('trims whitespace from plain name', () => {
    expect(parseCallerName('  customer-service  ')).toEqual({
      workflowSlug: 'customer-service',
      nodeName: null,
    });
  });

  // ── single colon ──────────────────────────────────────────────────────────

  it('splits on the colon into workflowSlug and nodeName', () => {
    expect(parseCallerName('legal-department:litigation-agent')).toEqual({
      workflowSlug: 'legal-department',
      nodeName: 'litigation-agent',
    });
  });

  it('trims both segments for a single-colon name', () => {
    expect(parseCallerName('  marketing-swarm : evaluator  ')).toEqual({
      workflowSlug: 'marketing-swarm',
      nodeName: 'evaluator',
    });
  });

  it('returns null nodeName when the part after the colon is empty', () => {
    expect(parseCallerName('legal-department:')).toEqual({
      workflowSlug: 'legal-department',
      nodeName: null,
    });
  });

  it('returns null workflowSlug when the part before the colon is empty', () => {
    expect(parseCallerName(':litigation-agent')).toEqual({
      workflowSlug: null,
      nodeName: 'litigation-agent',
    });
  });

  // ── multiple colons ────────────────────────────────────────────────────────

  it('splits only on the FIRST colon when multiple colons are present', () => {
    expect(parseCallerName('marketing-swarm:evaluator:initial')).toEqual({
      workflowSlug: 'marketing-swarm',
      nodeName: 'evaluator:initial',
    });
  });

  it('handles three segments (first colon wins)', () => {
    expect(parseCallerName('a:b:c:d')).toEqual({
      workflowSlug: 'a',
      nodeName: 'b:c:d',
    });
  });
});
