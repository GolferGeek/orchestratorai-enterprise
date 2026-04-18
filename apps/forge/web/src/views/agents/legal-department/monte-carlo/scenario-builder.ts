import type { SimulationResult, OutcomeDistribution } from '../../../../types/monte-carlo.types';

export interface ScenarioConfig {
  excludedEvidenceIds: string[];
  lowCredibilityWitnessIds: string[];
}

export function applyScenario(
  simulations: SimulationResult[],
  scenario: ScenarioConfig,
): SimulationResult[] {
  return simulations.filter((sim) => {
    for (const evidenceId of scenario.excludedEvidenceIds) {
      if (sim.parameters.evidenceAdmissibility[evidenceId] !== false) {
        return false;
      }
    }
    for (const witnessId of scenario.lowCredibilityWitnessIds) {
      const modifier = sim.parameters.witnessCredibilityModifiers[witnessId];
      if (modifier === undefined || modifier >= 1.0) {
        return false;
      }
    }
    return true;
  });
}

export function computeOutcomeDistribution(simulations: SimulationResult[]): OutcomeDistribution {
  const total = simulations.length;
  if (total === 0) {
    return {
      plaintiffWins: 0,
      defenseWins: 0,
      mixedVerdict: 0,
      plaintiffWinRate: 0,
      defenseWinRate: 0,
      mixedRate: 0,
    };
  }

  const plaintiffWins = simulations.filter((s) => !s.error && s.verdict === 'plaintiff').length;
  const defenseWins = simulations.filter((s) => !s.error && s.verdict === 'defense').length;
  const mixedVerdict = simulations.filter((s) => !s.error && s.verdict === 'mixed').length;
  const completed = plaintiffWins + defenseWins + mixedVerdict;
  const denom = completed || total;

  return {
    plaintiffWins,
    defenseWins,
    mixedVerdict,
    plaintiffWinRate: plaintiffWins / denom,
    defenseWinRate: defenseWins / denom,
    mixedRate: mixedVerdict / denom,
  };
}
