export type TrialVerdict = 'plaintiff' | 'defense' | 'mixed';
export type ImpactMagnitude = 'high' | 'medium' | 'low' | 'insufficient-data';
export type SensitivityFactorType =
  | 'evidence'
  | 'witness'
  | 'jury-characteristic'
  | 'judge-characteristic';

export interface JuryComposition {
  averageAge: number;
  educationDistribution: Record<string, number>;
  occupationMix: string[];
  attitudeBiases: {
    plaintiffSympathy: number;
    corporateSkepticism: number;
    expertDeference: number;
  };
}

export interface JudgeProfile {
  strictnessOnEvidence: number;
  sympathyBias: number;
  patienceWithObjections: number;
}

export interface SimulationParameters {
  simulationId: string;
  simulationIndex: number;
  juryComposition: JuryComposition;
  judgeCharacteristics: JudgeProfile;
  evidenceAdmissibility: Record<string, boolean>;
  witnessCredibilityModifiers: Record<string, number>;
}

export interface ClaimResult {
  claimId: string;
  liable: boolean;
}

export interface EvidencePhaseEntry {
  evidenceId: string;
  description: string;
  admitted: boolean;
  objection: string;
  ruling: string;
  juryImpact: string;
  error?: string;
}

export interface SimulationTranscript {
  parameters: SimulationParameters;
  openingArguments: { plaintiff: string; defense: string };
  evidencePhase: EvidencePhaseEntry[];
  closingArguments: { plaintiff: string; defense: string };
  juryDeliberation: string;
  verdict: string;
}

export interface SimulationResult {
  simulationId: string;
  simulationIndex: number;
  parameters: SimulationParameters;
  verdict: TrialVerdict;
  claimResults: ClaimResult[];
  damagesAwarded?: number;
  keyFactors: string[];
  pivotalMoments: string[];
  transcript: SimulationTranscript;
  durationMs: number;
  error?: string;
}

export interface OutcomeDistribution {
  plaintiffWins: number;
  defenseWins: number;
  mixedVerdict: number;
  plaintiffWinRate: number;
  defenseWinRate: number;
  mixedRate: number;
}

export interface HistogramBucket {
  bucket: string;
  count: number;
}

export interface DamagesDistribution {
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  histogram: HistogramBucket[];
  sampleSize: number;
}

export interface SensitivityFactor {
  factorType: SensitivityFactorType;
  factorId: string;
  factorLabel: string;
  baselineRate: number;
  impactedRate: number;
  deltaRate: number;
  confidenceN: number;
  impactMagnitude: ImpactMagnitude;
}

export interface MonteCarloTrialSimulatorResult {
  simulationsRequested: number;
  simulationsCompleted: number;
  simulationsFailed: number;
  outcomeDistribution: OutcomeDistribution;
  damagesDistribution: DamagesDistribution;
  expectedValue: number;
  settlementRange: { low: number; high: number };
  sensitivityAnalysis: SensitivityFactor[];
  strategyRecommendations: string[];
  simulations: SimulationResult[];
  disclaimerText: string;
  durationMs: number;
}
