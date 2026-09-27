import { compositeOf } from '../nodes/aggregate.node';
import { shouldDebate, createDecisionRiskGraph } from '../decision-risk.graph';
import { clampAdjustment, MAX_DEBATE_ADJUSTMENT } from '../nodes/debate.node';
import {
  residualCompositeOf,
  flaggedThreshold,
} from '../nodes/propose-mitigations.node';
import { MemorySaver } from '@langchain/langgraph';
import { applyItemDecisions } from '../nodes/review-mitigations.node';
import { parseDecisionRiskInput, decisionRiskRunTitle } from '../decision-risk.handler';
import { WorkflowInputError } from '../../catalog/workflow.registry';
import type {
  DecisionRiskState,
  DimensionAssessment,
  RiskDimension,
} from '../decision-risk.state';

const dimension = (
  slug: string,
  weight: number,
): RiskDimension => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  weight,
  contextId: `ctx-${slug}`,
  systemPrompt: 'prompt',
});

const assessment = (
  slug: string,
  score: number,
  confidence = 0.8,
): DimensionAssessment => ({
  dimensionId: `id-${slug}`,
  dimensionSlug: slug,
  score,
  confidence,
  reasoning: 'because',
  evidence: [],
  assessmentId: `a-${slug}`,
});

const stateWith = (over: Partial<DecisionRiskState>): DecisionRiskState =>
  ({
    proposition: 'Acquire a competitor',
    background: '',
    scope: {
      id: 'scope-1',
      name: 'Corporate Decision Risk',
      organizationSlug: 'corporate',
      thresholds: { flagged: 60, debate: 65, alert: 80 },
      analysisConfig: { redTeam: { enabled: true, debateThreshold: 65 } },
    },
    dimensions: [],
    assessments: [],
    overallScore: null,
    mitigations: [],
    ...over,
  }) as DecisionRiskState;

describe('composite scoring', () => {
  it('is a weighted mean, not an average', () => {
    // execution is weighted 3x reputational, so it should dominate.
    const dimensions = [dimension('execution', 0.75), dimension('reputational', 0.25)];
    const { score } = compositeOf(
      [assessment('execution', 80), assessment('reputational', 20)],
      dimensions,
    );

    expect(score).toBe(65); // 80*0.75 + 20*0.25 — a plain mean would be 50.
  });

  it('weights confidence the same way it weights score', () => {
    const dimensions = [dimension('a', 0.9), dimension('b', 0.1)];
    const { confidence } = compositeOf(
      [assessment('a', 50, 0.9), assessment('b', 50, 0.1)],
      dimensions,
    );

    expect(confidence).toBe(0.82);
  });

  it('rounds confidence to two places, because the column is NUMERIC(3,2)', () => {
    const dimensions = [dimension('a', 0.5), dimension('b', 0.5)];
    const { confidence } = compositeOf(
      [assessment('a', 10, 0.333), assessment('b', 20, 0.333)],
      dimensions,
    );

    expect(confidence).toBe(0.33);
    expect(String(confidence).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('refuses an assessment for a dimension it does not know', () => {
    expect(() =>
      compositeOf([assessment('ghost', 50)], [dimension('execution', 1)]),
    ).toThrow(/unknown dimension 'ghost'/);
  });
});

describe('debate routing', () => {
  it('runs by default whatever the score, because a low score needs it most', () => {
    // A high score is scrutinised by everyone who reads it. A low one gets
    // waved through — so a false LOW is the dangerous error, and challenging
    // it is the whole point of asking red for MISSED risks.
    expect(shouldDebate(stateWith({ overallScore: 12 }))).toBe(true);
    expect(shouldDebate(stateWith({ overallScore: 46 }))).toBe(true);
    expect(shouldDebate(stateWith({ overallScore: 90 }))).toBe(true);
  });

  it('honours a scope that opts into the threshold economy', () => {
    const state = stateWith({ overallScore: 46 });
    state.scope!.analysisConfig = {
      redTeam: { enabled: true, mode: 'above-threshold', debateThreshold: 65 },
    };
    expect(shouldDebate(state)).toBe(false);

    const high = stateWith({ overallScore: 65 });
    high.scope!.analysisConfig = {
      redTeam: { enabled: true, mode: 'above-threshold', debateThreshold: 65 },
    };
    expect(shouldDebate(high)).toBe(true);
  });

  it('does not run when the scope has the red team switched off', () => {
    const state = stateWith({ overallScore: 95 });
    state.scope!.analysisConfig = { redTeam: { enabled: false } };

    // A customer turning this off in config must be honoured whatever the score.
    expect(shouldDebate(state)).toBe(false);
  });

  it('does not run before a score exists', () => {
    expect(shouldDebate(stateWith({ overallScore: null }))).toBe(false);
  });
});

describe('debate adjustment limit', () => {
  it('passes through an adjustment within the limit', () => {
    expect(clampAdjustment(70, 55)).toBe(55);
  });

  it('clamps a swing that would replace the radar rather than refine it', () => {
    expect(clampAdjustment(70, 10)).toBe(70 - MAX_DEBATE_ADJUSTMENT);
    expect(clampAdjustment(40, 99)).toBe(40 + MAX_DEBATE_ADJUSTMENT);
  });
});

describe('residual scoring', () => {
  it('recomputes the composite with mitigated dimensions substituted', () => {
    const state = stateWith({
      dimensions: [dimension('execution', 0.5), dimension('financial', 0.5)],
      assessments: [assessment('execution', 80), assessment('financial', 40)],
      overallScore: 60,
    });

    const residual = residualCompositeOf(state, [
      {
        assessmentId: 'a-execution',
        dimensionSlug: 'execution',
        proposal: 'Hire a delivery lead',
        rationale: 'r',
        effort: 'medium',
        residualScore: 40,
      },
    ]);

    // execution 80 -> 40, financial untouched at 40.
    expect(residual).toBe(40);
  });

  it('leaves the score alone when nothing was mitigated', () => {
    const state = stateWith({
      dimensions: [dimension('execution', 1)],
      assessments: [assessment('execution', 70)],
      overallScore: 70,
    });

    expect(residualCompositeOf(state, [])).toBe(70);
  });

  it('prefers the scope mitigation threshold over the general flagged one', () => {
    const state = stateWith({});
    state.scope!.analysisConfig = { mitigations: { flaggedThreshold: 45 } };
    expect(flaggedThreshold(state)).toBe(45);

    const fallback = stateWith({});
    fallback.scope!.analysisConfig = {};
    expect(flaggedThreshold(fallback)).toBe(60);
  });
});

describe('start input', () => {
  it('takes a proposition and optional background, trimmed', () => {
    expect(parseDecisionRiskInput({ proposition: '  Open Berlin  ', background: ' EU growth ' })).toEqual({
      proposition: 'Open Berlin',
      background: 'EU growth',
    });
    expect(parseDecisionRiskInput({ proposition: 'x' })).toEqual({ proposition: 'x', background: '' });
  });

  it.each([
    [null, 'object'],
    [{ background: 'b' }, 'proposition is required'],
    [{ proposition: '   ' }, 'proposition is required'],
    [{ proposition: 'x', owner: 'me' }, 'unknown fields: owner'],
    [{ proposition: 'x', background: 3 }, 'background must be text'],
    [{ proposition: 'x'.repeat(4001) }, 'at most 4000'],
  ])('refuses %j', (input, message) => {
    expect(() => parseDecisionRiskInput(input as never)).toThrow(WorkflowInputError);
    expect(() => parseDecisionRiskInput(input as never)).toThrow(message);
  });

  it('titles a run by its proposition', () => {
    expect(decisionRiskRunTitle({ proposition: 'Open a\nBerlin office' })).toBe('Open a Berlin office');
  });
});

describe('mitigation review', () => {
  const mitigation = (slug: string) => ({
    assessmentId: `a-${slug}`,
    dimensionSlug: slug,
    proposal: `Fix ${slug}`,
    rationale: 'r',
    effort: 'low' as const,
    residualScore: 30,
  });
  const proposed = [mitigation('legal'), mitigation('security'), mitigation('financial')];

  it('keeps accepted and unmentioned items, drops rejected, rewrites modified', () => {
    const approved = applyItemDecisions(proposed, [
      { itemId: 'legal', decision: 'accept' },
      { itemId: 'security', decision: 'reject' },
      { itemId: 'financial', decision: 'modify', replacement: '  Hedge the currency exposure ' },
    ]);
    expect(approved.map((m) => [m.dimensionSlug, m.proposal])).toEqual([
      ['legal', 'Fix legal'],
      ['financial', 'Hedge the currency exposure'],
    ]);
    expect(applyItemDecisions(proposed, [])).toEqual(proposed);
  });

  it('refuses a decision on an item that was not proposed, or a replacement that is not text', () => {
    expect(() => applyItemDecisions(proposed, [{ itemId: 'brand', decision: 'accept' }])).toThrow('No mitigation for "brand"');
    expect(() =>
      applyItemDecisions(proposed, [{ itemId: 'legal', decision: 'modify', replacement: { proposal: 'x' } }]),
    ).toThrow('must be non-empty text');
  });
});

describe('graph construction', () => {
  it('compiles', () => {
    // LangGraph rejects a node whose name collides with a state channel; the
    // first real invocation is an expensive place to find that out.
    expect(() =>
      createDecisionRiskGraph({ units: {} as never, store: {} as never, checkpointer: new MemorySaver() }),
    ).not.toThrow();
  });
});
