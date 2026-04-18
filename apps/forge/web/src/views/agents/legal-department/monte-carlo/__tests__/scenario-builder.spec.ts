import { describe, it, expect } from 'vitest';
import { applyScenario, computeOutcomeDistribution } from '../scenario-builder';
import type { SimulationResult, SimulationParameters } from '../../../../../types/monte-carlo.types';

function makeParams(index: number, evidenceAdmissibility: Record<string, boolean>, witnessModifiers: Record<string, number>): SimulationParameters {
  return {
    simulationId: `sim-${index}`,
    simulationIndex: index,
    juryComposition: {
      averageAge: 40,
      educationDistribution: {},
      occupationMix: [],
      attitudeBiases: { plaintiffSympathy: 0, corporateSkepticism: 0, expertDeference: 0 },
    },
    judgeCharacteristics: { strictnessOnEvidence: 0.5, sympathyBias: 0, patienceWithObjections: 0.5 },
    evidenceAdmissibility,
    witnessCredibilityModifiers: witnessModifiers,
  };
}

function makeSim(
  index: number,
  verdict: 'plaintiff' | 'defense' | 'mixed',
  evidenceAdmissibility: Record<string, boolean>,
  witnessModifiers: Record<string, number> = {},
): SimulationResult {
  const params = makeParams(index, evidenceAdmissibility, witnessModifiers);
  return {
    simulationId: `sim-${index}`,
    simulationIndex: index,
    parameters: params,
    verdict,
    claimResults: [],
    keyFactors: [],
    pivotalMoments: [],
    transcript: {
      parameters: params,
      openingArguments: { plaintiff: '', defense: '' },
      evidencePhase: [],
      closingArguments: { plaintiff: '', defense: '' },
      juryDeliberation: '',
      verdict,
    },
    durationMs: 1000,
  };
}

describe('scenario-builder', () => {
  describe('applyScenario — evidence exclusion', () => {
    it('filters to simulations where evidence e2 is excluded (=== false)', () => {
      const simulations = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeSim(i, 'plaintiff', { e1: true, e2: true }, {}),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          makeSim(5 + i, 'defense', { e1: true, e2: false }, {}),
        ),
      ];

      const filtered = applyScenario(simulations, {
        excludedEvidenceIds: ['e2'],
        lowCredibilityWitnessIds: [],
      });

      expect(filtered).toHaveLength(5);
      filtered.forEach((s) => {
        expect(s.parameters.evidenceAdmissibility['e2']).toBe(false);
      });
    });

    it('returns empty array when no simulations match the scenario', () => {
      const simulations = Array.from({ length: 5 }, (_, i) =>
        makeSim(i, 'plaintiff', { e1: true, e2: true }, {}),
      );

      const filtered = applyScenario(simulations, {
        excludedEvidenceIds: ['e2'],
        lowCredibilityWitnessIds: [],
      });

      expect(filtered).toHaveLength(0);
    });
  });

  describe('computeOutcomeDistribution', () => {
    it('computes correct rates for 4 plaintiff, 1 defense', () => {
      const sims = [
        makeSim(0, 'plaintiff', { e2: false }, {}),
        makeSim(1, 'plaintiff', { e2: false }, {}),
        makeSim(2, 'plaintiff', { e2: false }, {}),
        makeSim(3, 'plaintiff', { e2: false }, {}),
        makeSim(4, 'defense', { e2: false }, {}),
      ];

      const dist = computeOutcomeDistribution(sims);

      expect(dist.plaintiffWins).toBe(4);
      expect(dist.defenseWins).toBe(1);
      expect(dist.plaintiffWinRate).toBeCloseTo(0.8, 5);
      expect(dist.defenseWinRate).toBeCloseTo(0.2, 5);
    });

    it('returns all-zero distribution for empty array', () => {
      const dist = computeOutcomeDistribution([]);

      expect(dist.plaintiffWins).toBe(0);
      expect(dist.plaintiffWinRate).toBe(0);
      expect(dist.defenseWinRate).toBe(0);
    });

    it('end-to-end: exclude e2 scenario produces 1/5 plaintiff win rate', () => {
      // 5 sims with e2=true: 4 plaintiff wins + 1 defense
      // 5 sims with e2=false: 1 plaintiff win + 4 defense
      const simulations = [
        makeSim(0, 'plaintiff', { e2: true }),
        makeSim(1, 'plaintiff', { e2: true }),
        makeSim(2, 'plaintiff', { e2: true }),
        makeSim(3, 'plaintiff', { e2: true }),
        makeSim(4, 'defense', { e2: true }),
        makeSim(5, 'plaintiff', { e2: false }),
        makeSim(6, 'defense', { e2: false }),
        makeSim(7, 'defense', { e2: false }),
        makeSim(8, 'defense', { e2: false }),
        makeSim(9, 'defense', { e2: false }),
      ];

      const filtered = applyScenario(simulations, {
        excludedEvidenceIds: ['e2'],
        lowCredibilityWitnessIds: [],
      });
      const dist = computeOutcomeDistribution(filtered);

      expect(filtered).toHaveLength(5);
      expect(dist.plaintiffWins).toBe(1);
      expect(dist.plaintiffWinRate).toBeCloseTo(0.2, 5);
    });
  });
});
