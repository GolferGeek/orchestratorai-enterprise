/**
 * Signal detection interface - inputs and outputs for Tier 1 signal evaluation
 */

import { Signal, SignalUrgency, SignalDirection } from './signal.interface';

export interface SignalDetectionInput {
  targetId: string;
  signal: Signal;
}

export interface SignalDetectionResult {
  signal: Signal;
  shouldCreatePredictor: boolean;
  urgency: SignalUrgency;
  confidence: number;
  reasoning: string;
  analystSlug: string;
  key_factors: string[];
  risks: string[];
}

export interface SignalEvaluationOutput {
  shouldCreatePredictor: boolean;
  urgency: SignalUrgency;
  direction: SignalDirection;
  confidence: number;
  reasoning: string;
  key_factors: string[];
  risks: string[];
}
