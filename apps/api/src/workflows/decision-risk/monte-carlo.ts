import type {
  DimensionAssessment,
  Mitigation,
  RiskDimension,
} from './decision-risk.state';

/**
 * Monte Carlo over the risk radar.
 *
 * A composite of 73 is a point estimate that hides its own uncertainty. The
 * dimensions already carry the missing information — each returns a confidence
 * alongside its score — so the honest object is a distribution: "73, with an
 * 80% interval of 61 to 84, and a 38% chance of exceeding the alert threshold".
 *
 * The control run made the case for this plainly. A wiki migration scored 46
 * overall with `dependency` at 72 and everything else low: that is not a 46, it
 * is a low-risk decision with one long tail. A single number cannot say so.
 *
 * NOTE ON LINEAGE: risk-runner's monte-carlo.service.ts simulated investment
 * price paths. None of that applies here and none of it was ported — this is
 * derived from the dimension/confidence model that decision risk actually has.
 */

/** Confidence 1.0 means no spread; 0.0 means this much standard deviation. */
export const MAX_STD_DEV = 25;

/** Enough for stable percentiles, cheap enough to run inline. */
export const DEFAULT_TRIALS = 10_000;

export interface MonteCarloResult {
  trials: number;
  mean: number;
  median: number;
  /** 10th and 90th percentile — the 80% interval. */
  p10: number;
  p90: number;
  /** Tail percentiles, where the decision usually actually turns. */
  p05: number;
  p95: number;
  standardDeviation: number;
  /** Share of trials at or above the scope's alert threshold. */
  probabilityAboveAlert: number;
  alertThreshold: number;
}

export interface MonteCarloOutcome {
  /** Distribution of the composite as assessed. */
  composite: MonteCarloResult;
  /** Distribution assuming every proposed mitigation is carried out. */
  residual: MonteCarloResult | null;
}

/**
 * Deterministic PRNG (mulberry32).
 *
 * Seeded from the run's thread id, so the same assessment re-derives the same
 * interval. An executive who reruns a report and sees different numbers stops
 * believing the report, and "it is a simulation" is not an acceptable answer
 * when the inputs have not changed.
 */
export function createRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, using the supplied uniform source so runs stay reproducible. */
export function sampleNormal(rng: () => number, mean: number, stdDev: number): number {
  if (stdDev <= 0) return mean;
  // Guard against log(0).
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * How uncertain a dimension's score is, given how confident it said it was.
 *
 * Linear rather than clever: confidence 0.8 gives sd 5, confidence 0.6 gives
 * sd 10. There is no calibration data behind a more elaborate mapping, and
 * inventing one would dress a guess up as a model.
 */
export function stdDevFor(confidence: number): number {
  const bounded = Math.min(Math.max(confidence, 0), 1);
  return (1 - bounded) * MAX_STD_DEV;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) throw new Error('percentile of an empty sample');
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((p / 100) * (sorted.length - 1))),
  );
  return sorted[index] as number;
}

function summarise(
  samples: number[],
  alertThreshold: number,
  trials: number,
): MonteCarloResult {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  const variance =
    samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / samples.length;

  const round = (v: number) => Math.round(v * 10) / 10;

  return {
    trials,
    mean: round(mean),
    median: round(percentile(sorted, 50)),
    p05: round(percentile(sorted, 5)),
    p10: round(percentile(sorted, 10)),
    p90: round(percentile(sorted, 90)),
    p95: round(percentile(sorted, 95)),
    standardDeviation: round(Math.sqrt(variance)),
    probabilityAboveAlert:
      Math.round(
        (samples.filter((v) => v >= alertThreshold).length / samples.length) *
          1000,
      ) / 1000,
    alertThreshold,
  };
}

/**
 * Sample each dimension independently from its own score and confidence, and
 * recompute the weighted composite per trial.
 *
 * Independence is an assumption, and a real one: in practice a proposition that
 * is worse than expected on execution is often worse on operational too, and
 * correlated draws would widen the interval. Modelling that needs a correlation
 * structure nobody has estimated, so the intervals here are, if anything,
 * narrower than the truth. Said plainly rather than left for a reader to
 * discover.
 */
export function runMonteCarlo(input: {
  assessments: DimensionAssessment[];
  dimensions: RiskDimension[];
  mitigations: Mitigation[];
  alertThreshold: number;
  seed: string;
  trials?: number;
  /**
   * The red team's adjustment to the composite, if a debate ran.
   *
   * The simulation samples the DIMENSION assessments, which are pre-debate, so
   * without this the interval centres on the pre-debate composite while the
   * reported score is post-debate. The first live run produced exactly that:
   * a headline of 71 sitting below its own 74-80 interval, which reads as a
   * bug to anyone looking at it. The arbiter adjusts the composite, so the
   * adjustment applies to every sample of it.
   */
  debateAdjustment?: number;
}): MonteCarloOutcome {
  const { assessments, dimensions, mitigations, alertThreshold, seed } = input;
  const debateAdjustment = input.debateAdjustment ?? 0;
  const trials = input.trials ?? DEFAULT_TRIALS;

  if (!assessments.length) {
    throw new Error('Monte Carlo needs assessments to sample from.');
  }

  const weightBySlug = new Map(dimensions.map((d) => [d.slug, d.weight]));
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Dimension weights sum to zero; cannot simulate.');
  }

  const residualBySlug = new Map(
    mitigations.map((m) => [m.dimensionSlug, m.residualScore]),
  );

  const rng = createRng(seed);
  const compositeSamples: number[] = [];
  const residualSamples: number[] = [];

  for (let trial = 0; trial < trials; trial++) {
    let weighted = 0;
    let weightedResidual = 0;

    for (const assessment of assessments) {
      const weight = weightBySlug.get(assessment.dimensionSlug);
      if (weight === undefined) {
        throw new Error(
          `Assessment for unknown dimension '${assessment.dimensionSlug}'.`,
        );
      }

      const stdDev = stdDevFor(assessment.confidence);
      const drawn = clamp(sampleNormal(rng, assessment.score, stdDev));
      weighted += drawn * weight;

      // The mitigated score inherits the dimension's uncertainty: a residual
      // estimated off a low-confidence assessment is no more certain than the
      // assessment was.
      const residualCentre = residualBySlug.get(assessment.dimensionSlug);
      const residualDrawn =
        residualCentre === undefined
          ? drawn
          : clamp(sampleNormal(rng, residualCentre, stdDev));
      weightedResidual += residualDrawn * weight;
    }

    // Both bases carry the adjustment, so the point estimate, the interval and
    // the residual are all the same kind of number.
    compositeSamples.push(clamp(weighted / totalWeight + debateAdjustment));
    residualSamples.push(clamp(weightedResidual / totalWeight + debateAdjustment));
  }

  return {
    composite: summarise(compositeSamples, alertThreshold, trials),
    residual: mitigations.length
      ? summarise(residualSamples, alertThreshold, trials)
      : null,
  };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
