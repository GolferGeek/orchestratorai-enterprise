import { compositeOf } from '../nodes/aggregate.node';
import { shouldDebate } from '../decision-risk.graph';
import { clampAdjustment, MAX_DEBATE_ADJUSTMENT } from '../nodes/debate.node';
import {
  residualCompositeOf,
  flaggedThreshold,
} from '../nodes/propose-mitigations.node';
import {
  parseJsonResponse,
  requireBoundedNumber,
} from '../nodes/parse-json-response';
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
  it('runs when the score reaches the threshold', () => {
    expect(shouldDebate(stateWith({ overallScore: 65 }))).toBe(true);
    expect(shouldDebate(stateWith({ overallScore: 90 }))).toBe(true);
  });

  it('does not run for a score below it', () => {
    expect(shouldDebate(stateWith({ overallScore: 64 }))).toBe(false);
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

describe('reading model output', () => {
  it('accepts a bare JSON object', () => {
    expect(
      parseJsonResponse<{ score: number }>('{"score": 42}', 'test').score,
    ).toBe(42);
  });

  it('accepts JSON in a fenced block, which models produce constantly', () => {
    expect(
      parseJsonResponse<{ score: number }>(
        'Here you go:\n```json\n{"score": 42}\n```',
        'test',
      ).score,
    ).toBe(42);
  });

  it('throws rather than defaulting when there is no JSON', () => {
    // The rule that matters: a dimension that cannot be read stops the run.
    // Returning a default would produce a composite that looks complete.
    expect(() => parseJsonResponse('I cannot help with that.', 'Dimension x')).toThrow(
      /no JSON object/,
    );
  });

  it('throws on malformed JSON and shows what came back', () => {
    expect(() => parseJsonResponse('{"score": }', 'Dimension x')).toThrow(
      /not valid JSON/,
    );
  });

  it('rejects an out-of-range score instead of clamping it', () => {
    expect(() => requireBoundedNumber(140, 'score', 0, 100)).toThrow(
      /between 0 and 100/,
    );
    expect(() => requireBoundedNumber('high', 'score', 0, 100)).toThrow(
      /must be a number/,
    );
  });
});
