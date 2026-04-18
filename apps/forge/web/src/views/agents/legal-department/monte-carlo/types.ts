export interface CostEstimateInput {
  simulationCount: number;
  evidenceCount: number;
  witnessCount: number;
  provider: string;
}

export interface CostEstimateOutput {
  simulationCount: number;
  estimatedLlmCalls: number;
  estimatedTokensPerCall: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number | null;
  estimatedDurationHours: number;
  provider: string;
  warning?: string;
}
