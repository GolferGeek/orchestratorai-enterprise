import {
  createRng,
  runMonteCarlo,
  sampleNormal,
  stdDevFor,
  MAX_STD_DEV,
} from '../monte-carlo';
import type {
  DimensionAssessment,
  Mitigation,
  RiskDimension,
} from '../decision-risk.state';

const dim = (slug: string, weight: number): RiskDimension => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  weight,
  contextId: `ctx-${slug}`,
  systemPrompt: 'p',
});

const assess = (
  slug: string,
  score: number,
  confidence: number,
): DimensionAssessment => ({
  dimensionId: `id-${slug}`,
  dimensionSlug: slug,
  score,
  confidence,
  reasoning: 'r',
  evidence: [],
  assessmentId: `a-${slug}`,
});

describe('uncertainty from confidence', () => {
  it('gives a confident dimension no spread', () => {
    expect(stdDevFor(1)).toBe(0);
  });

  it('gives an unconfident dimension the full spread', () => {
    expect(stdDevFor(0)).toBe(MAX_STD_DEV);
  });

  it('scales linearly between', () => {
    expect(stdDevFor(0.8)).toBeCloseTo(5);
    expect(stdDevFor(0.6)).toBeCloseTo(10);
  });

  it('tolerates a confidence outside 0-1 rather than producing a negative sd', () => {
    expect(stdDevFor(1.5)).toBe(0);
    expect(stdDevFor(-1)).toBe(MAX_STD_DEV);
  });
});

describe('determinism', () => {
  it('re-derives the same interval from the same seed', () => {
    // An executive who reruns a report and sees different numbers stops
    // believing the report. Same inputs must give the same distribution.
    const input = {
      assessments: [assess('a', 70, 0.6), assess('b', 40, 0.8)],
      dimensions: [dim('a', 0.5), dim('b', 0.5)],
      mitigations: [],
      alertThreshold: 80,
      seed: 'thread-1',
      trials: 2000,
    };

    expect(runMonteCarlo(input).composite).toEqual(
      runMonteCarlo(input).composite,
    );
  });

  it('gives a different distribution for a different run', () => {
    const base = {
      assessments: [assess('a', 70, 0.6)],
      dimensions: [dim('a', 1)],
      mitigations: [],
      alertThreshold: 80,
      trials: 2000,
    };

    expect(runMonteCarlo({ ...base, seed: 'thread-1' }).composite.p90).not.toBe(
      runMonteCarlo({ ...base, seed: 'thread-2' }).composite.p90,
    );
  });

  it('produces a usable spread of uniforms', () => {
    const rng = createRng('seed');
    const draws = Array.from({ length: 1000 }, () => rng());

    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
    const mean = draws.reduce((s, v) => s + v, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('samples a normal centred on the mean', () => {
    const rng = createRng('normal');
    const draws = Array.from({ length: 5000 }, () => sampleNormal(rng, 50, 10));
    const mean = draws.reduce((s, v) => s + v, 0) / draws.length;

    expect(mean).toBeGreaterThan(48);
    expect(mean).toBeLessThan(52);
  });

  it('returns the mean exactly when there is no uncertainty', () => {
    expect(sampleNormal(createRng('x'), 42, 0)).toBe(42);
  });
});

describe('the distribution', () => {
  const dimensions = [dim('a', 0.5), dim('b', 0.5)];

  it('centres on the weighted composite', () => {
    const { composite } = runMonteCarlo({
      assessments: [assess('a', 80, 0.7), assess('b', 40, 0.7)],
      dimensions,
      mitigations: [],
      alertThreshold: 90,
      seed: 's',
      trials: 5000,
    });

    // Weighted mean is 60; sampling is symmetric, so the median tracks it.
    expect(composite.median).toBeGreaterThan(57);
    expect(composite.median).toBeLessThan(63);
  });

  it('is narrow when every dimension is confident and wide when none is', () => {
    const shared = {
      dimensions,
      mitigations: [],
      alertThreshold: 90,
      seed: 's',
      trials: 5000,
    };
    const confident = runMonteCarlo({
      ...shared,
      assessments: [assess('a', 60, 0.95), assess('b', 60, 0.95)],
    }).composite;
    const unsure = runMonteCarlo({
      ...shared,
      assessments: [assess('a', 60, 0.3), assess('b', 60, 0.3)],
    }).composite;

    // This is the whole point: the interval reports how much the assessment
    // actually knows, which a point score cannot.
    expect(unsure.p90 - unsure.p10).toBeGreaterThan(
      (confident.p90 - confident.p10) * 3,
    );
  });

  it('never leaves the 0-100 scale', () => {
    const { composite } = runMonteCarlo({
      assessments: [assess('a', 98, 0.05), assess('b', 2, 0.05)],
      dimensions,
      mitigations: [],
      alertThreshold: 99,
      seed: 's',
      trials: 3000,
    });

    expect(composite.p05).toBeGreaterThanOrEqual(0);
    expect(composite.p95).toBeLessThanOrEqual(100);
  });

  it('reports the chance of exceeding the alert threshold', () => {
    const high = runMonteCarlo({
      assessments: [assess('a', 95, 0.9), assess('b', 95, 0.9)],
      dimensions,
      mitigations: [],
      alertThreshold: 80,
      seed: 's',
      trials: 3000,
    }).composite;
    const low = runMonteCarlo({
      assessments: [assess('a', 20, 0.9), assess('b', 20, 0.9)],
      dimensions,
      mitigations: [],
      alertThreshold: 80,
      seed: 's',
      trials: 3000,
    }).composite;

    expect(high.probabilityAboveAlert).toBeGreaterThan(0.95);
    expect(low.probabilityAboveAlert).toBe(0);
  });
});

describe('the residual distribution', () => {
  const dimensions = [dim('a', 0.5), dim('b', 0.5)];
  const assessments = [assess('a', 80, 0.7), assess('b', 80, 0.7)];

  it('is absent when nothing was mitigated', () => {
    expect(
      runMonteCarlo({
        assessments,
        dimensions,
        mitigations: [],
        alertThreshold: 90,
        seed: 's',
        trials: 1000,
      }).residual,
    ).toBeNull();
  });

  it('shifts down by the mitigated scores', () => {
    const mitigations: Mitigation[] = [
      {
        assessmentId: 'a-a',
        dimensionSlug: 'a',
        proposal: 'p',
        rationale: 'r',
        effort: 'medium',
        residualScore: 30,
      },
    ];

    const outcome = runMonteCarlo({
      assessments,
      dimensions,
      mitigations,
      alertThreshold: 90,
      seed: 's',
      trials: 5000,
    });

    // 'a' drops 80 -> 30 at weight 0.5, so the composite should fall ~25.
    expect(outcome.residual).not.toBeNull();
    expect(outcome.composite.median - outcome.residual!.median).toBeGreaterThan(20);
    expect(outcome.composite.median - outcome.residual!.median).toBeLessThan(30);
  });

  it('keeps the dimension uncertainty on the mitigated score', () => {
    // A residual estimated off a low-confidence assessment is no more certain
    // than the assessment was — claiming otherwise would make mitigation look
    // like it removes doubt as well as risk.
    const unsure = runMonteCarlo({
      assessments: [assess('a', 80, 0.2), assess('b', 80, 0.2)],
      dimensions,
      mitigations: [
        {
          assessmentId: 'a-a',
          dimensionSlug: 'a',
          proposal: 'p',
          rationale: 'r',
          effort: 'low',
          residualScore: 30,
        },
      ],
      alertThreshold: 90,
      seed: 's',
      trials: 5000,
    });

    expect(unsure.residual!.p90 - unsure.residual!.p10).toBeGreaterThan(10);
  });
});

describe('refusals', () => {
  it('refuses to simulate with no assessments', () => {
    expect(() =>
      runMonteCarlo({
        assessments: [],
        dimensions: [dim('a', 1)],
        mitigations: [],
        alertThreshold: 80,
        seed: 's',
      }),
    ).toThrow(/needs assessments/);
  });

  it('refuses an assessment for a dimension it does not know', () => {
    expect(() =>
      runMonteCarlo({
        assessments: [assess('ghost', 50, 0.5)],
        dimensions: [dim('a', 1)],
        mitigations: [],
        alertThreshold: 80,
        seed: 's',
      }),
    ).toThrow(/unknown dimension 'ghost'/);
  });
});
