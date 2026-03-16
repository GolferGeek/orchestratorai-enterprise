/**
 * Dimension entity interface - represents a risk factor to analyze
 * Based on risk.dimensions table
 */

export interface RiskDimension {
  id: string;
  scope_id: string;
  slug: string; // 'market', 'fundamental', 'technical', 'macro', 'correlation'
  name: string;
  description: string | null;
  display_name: string | null; // Human-friendly display name
  icon: string | null; // Icon identifier (e.g., 'chart-line', 'shield')
  color: string | null; // Hex color code (e.g., '#EF4444')
  weight: number; // 0.0 to 2.0
  display_order: number;
  is_active: boolean;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Dimension Context entity - versioned prompts for each dimension
 * Based on risk.dimension_contexts table
 */
export interface RiskDimensionContext {
  id: string;
  dimension_id: string;
  version: number;
  system_prompt: string;
  output_schema: DimensionOutputSchema;
  examples: DimensionExample[];
  is_active: boolean;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Expected output schema from dimension analysis
 */
export interface DimensionOutputSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Few-shot example for dimension analysis
 */
export interface DimensionExample {
  input: {
    subject: string;
    data: Record<string, unknown>;
  };
  output: {
    score: number;
    confidence: number;
    reasoning: string;
    evidence: string[];
    signals?: DimensionSignal[];
  };
}

/**
 * Signal detected during dimension analysis
 */
export interface DimensionSignal {
  name: string;
  value: unknown;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
}

export interface CreateRiskDimensionData {
  scope_id: string;
  slug: string;
  name: string;
  description?: string;
  display_name?: string;
  icon?: string;
  color?: string;
  weight?: number;
  display_order?: number;
  is_active?: boolean;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateRiskDimensionData {
  slug?: string;
  name?: string;
  description?: string;
  display_name?: string;
  icon?: string;
  color?: string;
  weight?: number;
  display_order?: number;
  is_active?: boolean;
}

export interface CreateDimensionContextData {
  dimension_id: string;
  version?: number;
  system_prompt: string;
  output_schema?: DimensionOutputSchema;
  examples?: DimensionExample[];
  is_active?: boolean;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateDimensionContextData {
  system_prompt?: string;
  output_schema?: DimensionOutputSchema;
  examples?: DimensionExample[];
  is_active?: boolean;
}
