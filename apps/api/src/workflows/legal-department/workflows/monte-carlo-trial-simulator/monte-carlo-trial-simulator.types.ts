export const MONTE_CARLO_TRIAL_SIMULATOR_JOB_TYPE =
  'monte-carlo-trial-simulator';

// ── Case Record Input ────────────────────────────────────────────────────────

export interface ClaimDefinition {
  claimId: string;
  description: string;
  elements: string[];
  standardOfProof: string;
}

export interface DefenseDefinition {
  defenseId: string;
  description: string;
  type: 'affirmative' | 'negating';
}

export type EvidenceStrength = 'strong' | 'moderate' | 'weak';
export type AdmissibilityRisk = 'low' | 'medium' | 'high';
export type EvidenceType =
  | 'document'
  | 'testimony'
  | 'expert'
  | 'physical'
  | 'demonstrative';
export type CourtLevel = 'federal-district' | 'state-trial' | 'appellate';
export type DamagesType =
  | 'compensatory'
  | 'punitive'
  | 'statutory'
  | 'injunctive';

export interface EvidenceItem {
  evidenceId: string;
  type: EvidenceType;
  description: string;
  supportsClaims: string[];
  supportsDefenses: string[];
  strength: EvidenceStrength;
  admissibilityRisk: AdmissibilityRisk;
  content?: string;
}

export interface WitnessDefinition {
  witnessId: string;
  name: string;
  type: 'fact' | 'expert' | 'party';
  side: 'plaintiff' | 'defense';
  credibilityFactors: string[];
  keyTestimony: string;
}

export interface DamagesModelEntry {
  type: DamagesType;
  rangeMin: number;
  rangeMax: number;
  calculation: string;
}

export type VariationParameter =
  | 'jury'
  | 'judge'
  | 'evidence-admissibility'
  | 'witness-credibility';

export interface CaseRecord {
  matterId: string;
  jurisdiction: string;
  courtLevel: CourtLevel;
  judge?: string;
  caseType: string;
  claims: ClaimDefinition[];
  defenses: DefenseDefinition[];
  evidence: EvidenceItem[];
  witnesses: WitnessDefinition[];
  damagesModel: DamagesModelEntry[];
  simulationCount: number;
  variationParameters: VariationParameter[];
}

// ── Simulation Parameters ────────────────────────────────────────────────────

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

// ── Simulation Results ───────────────────────────────────────────────────────

export type TrialVerdict = 'plaintiff' | 'defense' | 'mixed';

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

// ── Aggregation Output ───────────────────────────────────────────────────────

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

export type ImpactMagnitude = 'high' | 'medium' | 'low' | 'insufficient-data';
export type SensitivityFactorType =
  | 'evidence'
  | 'witness'
  | 'jury-characteristic'
  | 'judge-characteristic';

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

// ── Cost Estimate ────────────────────────────────────────────────────────────

export interface CostEstimateInput {
  simulationCount: number;
  evidenceCount: number;
  witnessCount: number;
  provider: string;
}

export interface CostEstimateOutput {
  estimatedLlmCalls: number;
  estimatedTokensPerCall: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number | null;
  estimatedDurationHours: number;
  warning?: string;
}
