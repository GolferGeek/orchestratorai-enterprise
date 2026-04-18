import type {
  CaseRecord,
  SimulationParameters,
  JuryComposition,
  JudgeProfile,
} from './monte-carlo-trial-simulator.types';

/**
 * Generates a single SimulationParameters deterministically from a CaseRecord and index.
 * Uses modulo/linear arithmetic so the same index always produces the same parameters.
 */
export function generateSimulationParameters(
  caseRecord: CaseRecord,
  index: number,
  total: number,
): SimulationParameters {
  const n = Math.max(total, 1);

  // Plaintiff sympathy: distribute linearly from -1 to +1 across the parameter space
  const plaintiffSympathy = total <= 1 ? 0 : (index / (n - 1)) * 2 - 1;

  // Corporate skepticism: alternate between low (-0.3) and high (0.3)
  const corporateSkepticism = index % 2 === 0 ? -0.3 : 0.3;

  // Expert deference: cycle through -0.5, 0, 0.5 pattern
  const expertDeference = ((index % 3) - 1) * 0.5;

  // Average juror age: cycle 30–65 across simulations
  const averageAge = 30 + ((index * 7) % 36);

  const juryComposition: JuryComposition = {
    averageAge,
    educationDistribution: {
      'high-school': 0.3,
      'some-college': 0.25,
      bachelors: 0.3,
      graduate: 0.15,
    },
    occupationMix: ['professional', 'blue-collar', 'retired', 'self-employed'],
    attitudeBiases: {
      plaintiffSympathy: Math.round(plaintiffSympathy * 100) / 100,
      corporateSkepticism,
      expertDeference,
    },
  };

  // Judge strictness on evidence: distribute 0 to 1 linearly
  const strictnessOnEvidence = total <= 1 ? 0.5 : index / (n - 1);

  // Judge sympathy: alternates slightly around neutral
  const sympathyBias = index % 2 === 0 ? -0.1 : 0.1;

  const judgeCharacteristics: JudgeProfile = {
    strictnessOnEvidence: Math.round(strictnessOnEvidence * 100) / 100,
    sympathyBias,
    patienceWithObjections: 0.5,
  };

  // Evidence admissibility: for medium/high-risk items, alternate admitted/excluded by index
  const evidenceAdmissibility: Record<string, boolean> = {};
  for (const evidence of caseRecord.evidence) {
    if (evidence.admissibilityRisk === 'low') {
      evidenceAdmissibility[evidence.evidenceId] = true;
    } else if (evidence.admissibilityRisk === 'medium') {
      evidenceAdmissibility[evidence.evidenceId] = index % 2 === 0;
    } else {
      // high risk: excluded 2/3 of the time
      evidenceAdmissibility[evidence.evidenceId] = index % 3 === 0;
    }
  }

  // Witness credibility: alternate between 0.75 and 1.25
  const witnessCredibilityModifiers: Record<string, number> = {};
  for (const witness of caseRecord.witnesses) {
    witnessCredibilityModifiers[witness.witnessId] =
      index % 2 === 0 ? 0.75 : 1.25;
  }

  return {
    simulationId: `${caseRecord.matterId}-sim-${index}`,
    simulationIndex: index,
    juryComposition,
    judgeCharacteristics,
    evidenceAdmissibility,
    witnessCredibilityModifiers,
  };
}
