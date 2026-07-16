import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { TrialSimulatorState } from '../trial-simulator.state';
import type {
  MonteCarloTrialSimulatorResult,
  SimulationResult,
  OutcomeDistribution,
  DamagesDistribution,
  SensitivityFactor,
  HistogramBucket,
  ImpactMagnitude,
} from '../monte-carlo-trial-simulator.types';

export const TRIAL_SIMULATOR_DISCLAIMER =
  'Trial simulation is an analytical tool that approximates outcome distributions based on systematic parameter variation. It is not a prediction of trial outcomes. Results should be used to inform strategy decisions, not replace legal judgment. The accuracy of simulations depends heavily on the quality and completeness of the case record provided.';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower] ?? 0;
  const frac = idx - lower;
  return (sorted[lower] ?? 0) * (1 - frac) + (sorted[upper] ?? 0) * frac;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeDamagesDistribution(damages: number[]): DamagesDistribution {
  if (damages.length === 0) {
    return {
      mean: 0,
      median: 0,
      p10: 0,
      p25: 0,
      p75: 0,
      p90: 0,
      histogram: [],
      sampleSize: 0,
    };
  }

  const sorted = [...damages].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const bucketWidth = max > min ? (max - min) / 10 : 1;

  const histogram: HistogramBucket[] = Array.from({ length: 10 }, (_, i) => {
    const bucketMin = min + i * bucketWidth;
    const bucketMax = min + (i + 1) * bucketWidth;
    const count = sorted.filter(
      (v) => v >= bucketMin && (i === 9 ? v <= bucketMax : v < bucketMax),
    ).length;
    return {
      bucket: `$${Math.round(bucketMin / 1000)}k–$${Math.round(bucketMax / 1000)}k`,
      count,
    };
  });

  return {
    mean: Math.round(mean(damages)),
    median: Math.round(percentile(sorted, 50)),
    p10: Math.round(percentile(sorted, 10)),
    p25: Math.round(percentile(sorted, 25)),
    p75: Math.round(percentile(sorted, 75)),
    p90: Math.round(percentile(sorted, 90)),
    histogram,
    sampleSize: damages.length,
  };
}

function impactMagnitude(delta: number, confidenceN: number): ImpactMagnitude {
  if (confidenceN < 10) return 'insufficient-data';
  const abs = Math.abs(delta);
  if (abs > 0.15) return 'high';
  if (abs > 0.07) return 'medium';
  return 'low';
}

function computeSensitivityFactors(
  successful: SimulationResult[],
  caseRecord: TrialSimulatorState['caseRecord'],
): SensitivityFactor[] {
  const factors: SensitivityFactor[] = [];

  const overallRate =
    successful.length > 0
      ? successful.filter(
          (r) => r.verdict === 'plaintiff' || r.verdict === 'mixed',
        ).length / successful.length
      : 0;

  for (const evidence of caseRecord.evidence) {
    const admitted = successful.filter(
      (r) => r.parameters.evidenceAdmissibility[evidence.evidenceId] !== false,
    );
    const excluded = successful.filter(
      (r) => r.parameters.evidenceAdmissibility[evidence.evidenceId] === false,
    );

    const admittedRate =
      admitted.length > 0
        ? admitted.filter(
            (r) => r.verdict === 'plaintiff' || r.verdict === 'mixed',
          ).length / admitted.length
        : overallRate;

    const excludedRate =
      excluded.length > 0
        ? excluded.filter(
            (r) => r.verdict === 'plaintiff' || r.verdict === 'mixed',
          ).length / excluded.length
        : overallRate;

    const deltaRate = admittedRate - excludedRate;
    const confidenceN = Math.min(admitted.length, excluded.length);

    factors.push({
      factorType: 'evidence',
      factorId: evidence.evidenceId,
      factorLabel: `Evidence: ${evidence.description.slice(0, 60)}`,
      baselineRate: Math.round(overallRate * 1000) / 1000,
      impactedRate: Math.round(admittedRate * 1000) / 1000,
      deltaRate: Math.round(deltaRate * 1000) / 1000,
      confidenceN,
      impactMagnitude: impactMagnitude(deltaRate, confidenceN),
    });
  }

  for (const witness of caseRecord.witnesses) {
    const highCred = successful.filter(
      (r) =>
        (r.parameters.witnessCredibilityModifiers[witness.witnessId] ?? 1.0) >=
        1.0,
    );
    const lowCred = successful.filter(
      (r) =>
        (r.parameters.witnessCredibilityModifiers[witness.witnessId] ?? 1.0) <
        1.0,
    );

    const highRate =
      highCred.length > 0
        ? highCred.filter(
            (r) => r.verdict === 'plaintiff' || r.verdict === 'mixed',
          ).length / highCred.length
        : overallRate;

    const lowRate =
      lowCred.length > 0
        ? lowCred.filter(
            (r) => r.verdict === 'plaintiff' || r.verdict === 'mixed',
          ).length / lowCred.length
        : overallRate;

    const deltaRate = highRate - lowRate;
    const confidenceN = Math.min(highCred.length, lowCred.length);

    factors.push({
      factorType: 'witness',
      factorId: witness.witnessId,
      factorLabel: `Witness: ${witness.name} (${witness.side})`,
      baselineRate: Math.round(overallRate * 1000) / 1000,
      impactedRate: Math.round(highRate * 1000) / 1000,
      deltaRate: Math.round(deltaRate * 1000) / 1000,
      confidenceN,
      impactMagnitude: impactMagnitude(deltaRate, confidenceN),
    });
  }

  return factors.sort((a, b) => Math.abs(b.deltaRate) - Math.abs(a.deltaRate));
}

function generateRecommendations(
  outcomeDistribution: OutcomeDistribution,
  sensitivityFactors: SensitivityFactor[],
): string[] {
  const recs: string[] = [];

  const topFactors = sensitivityFactors
    .filter(
      (f) => f.impactMagnitude === 'high' || f.impactMagnitude === 'medium',
    )
    .slice(0, 3);

  for (const factor of topFactors) {
    if (factor.factorType === 'evidence') {
      if (factor.deltaRate > 0) {
        recs.push(
          `Focus on ensuring admission of ${factor.factorLabel} — its presence increases plaintiff win rate by ${Math.round(Math.abs(factor.deltaRate) * 100)}pp.`,
        );
      } else {
        recs.push(
          `Challenge admissibility of ${factor.factorLabel} — its exclusion reduces plaintiff win rate by ${Math.round(Math.abs(factor.deltaRate) * 100)}pp.`,
        );
      }
    } else if (factor.factorType === 'witness') {
      recs.push(
        `${factor.factorLabel} credibility has ${factor.impactMagnitude} impact on outcome (${Math.round(Math.abs(factor.deltaRate) * 100)}pp swing) — invest in preparation accordingly.`,
      );
    }
  }

  if (recs.length === 0) {
    if (outcomeDistribution.plaintiffWinRate > 0.6) {
      recs.push(
        'Outcome heavily favors plaintiff — consider early settlement positioning from plaintiff perspective.',
      );
    } else if (outcomeDistribution.defenseWinRate > 0.6) {
      recs.push(
        'Outcome heavily favors defense — consider firm negotiation stance and trial preparation.',
      );
    } else {
      recs.push(
        'Outcome is closely contested — sensitivity analysis shows insufficient data to identify dominant factors with current simulation count.',
      );
    }
  }

  return recs.slice(0, 3);
}

export function createAggregateResultsNode(
  observability: ObservabilityService,
) {
  return async function aggregateResultsNode(
    state: TrialSimulatorState,
  ): Promise<Partial<TrialSimulatorState>> {
    const ctx = state.executionContext;
    const { simulationResults, caseRecord } = state;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Aggregating ${simulationResults.length} simulation results`,
      { step: 'aggregating', progress: 88 },
    );

    const successful = simulationResults.filter((r) => !r.error);
    const failed = simulationResults.filter((r) => !!r.error);

    const plaintiffWins = successful.filter(
      (r) => r.verdict === 'plaintiff',
    ).length;
    const defenseWins = successful.filter(
      (r) => r.verdict === 'defense',
    ).length;
    const mixedVerdict = successful.filter((r) => r.verdict === 'mixed').length;
    const n = successful.length;

    const outcomeDistribution: OutcomeDistribution = {
      plaintiffWins,
      defenseWins,
      mixedVerdict,
      plaintiffWinRate:
        n > 0 ? Math.round((plaintiffWins / n) * 1000) / 1000 : 0,
      defenseWinRate: n > 0 ? Math.round((defenseWins / n) * 1000) / 1000 : 0,
      mixedRate: n > 0 ? Math.round((mixedVerdict / n) * 1000) / 1000 : 0,
    };

    const plaintiffDamages = successful
      .filter(
        (r) =>
          (r.verdict === 'plaintiff' || r.verdict === 'mixed') &&
          (r.damagesAwarded ?? 0) > 0,
      )
      .map((r) => r.damagesAwarded ?? 0);

    const damagesDistribution = computeDamagesDistribution(plaintiffDamages);

    const expectedValue = Math.round(
      outcomeDistribution.plaintiffWinRate * damagesDistribution.median,
    );
    const settlementRange = {
      low: damagesDistribution.p25,
      high: damagesDistribution.p75,
    };

    const sensitivityAnalysis = computeSensitivityFactors(
      successful,
      caseRecord,
    );
    const strategyRecommendations = generateRecommendations(
      outcomeDistribution,
      sensitivityAnalysis,
    );

    const aggregation: MonteCarloTrialSimulatorResult = {
      simulationsRequested: caseRecord.simulationCount,
      simulationsCompleted: successful.length,
      simulationsFailed: failed.length,
      outcomeDistribution,
      damagesDistribution,
      expectedValue,
      settlementRange,
      sensitivityAnalysis,
      strategyRecommendations,
      simulations: simulationResults,
      disclaimerText: TRIAL_SIMULATOR_DISCLAIMER,
      durationMs: 0,
    };

    return { aggregation };
  };
}
