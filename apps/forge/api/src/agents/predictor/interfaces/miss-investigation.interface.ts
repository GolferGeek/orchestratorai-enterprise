/**
 * Miss Investigation Interfaces
 *
 * Data structures for investigating prediction misses (wrong predictions and missed opportunities).
 * Supports backward navigation: Prediction → Predictors → Signals → Sources
 */

import { Prediction, PredictionDirection } from './prediction.interface';
import { Predictor } from './predictor.interface';
import { Signal } from './signal.interface';

/**
 * Type of prediction miss
 * - missed_opportunity: No prediction made, but significant move occurred
 * - direction_wrong: Predicted opposite direction
 * - magnitude_wrong: Direction correct but significantly underestimated move
 * - false_positive: Predicted significant move but stayed flat
 */
export type MissType =
  | 'missed_opportunity'
  | 'direction_wrong'
  | 'magnitude_wrong'
  | 'false_positive';

/**
 * Investigation level reached
 * - predictor: Found unused predictors that could have helped
 * - signal: Found misread signals that should have generated predictors
 * - source: Need external research to find what sources we're missing
 * - unpredictable: No available information could have predicted this
 */
export type InvestigationLevel =
  | 'predictor'
  | 'signal'
  | 'source'
  | 'unpredictable';

/**
 * Signal with full chain for navigation
 * Includes the source info for complete traceability
 */
export interface SignalWithSource extends Signal {
  source?: {
    id: string;
    name: string;
    source_type: string;
    url: string | null;
  };
}

/**
 * Predictor with linked signal for navigation
 * Allows user to drill down: Predictor → Signal → Source
 */
export interface PredictorWithSignal extends Predictor {
  signal?: SignalWithSource;
}

/**
 * Prediction with full backward chain
 * Allows navigation: Prediction → Predictors → Signals → Sources
 */
export interface PredictionWithChain extends Prediction {
  /** Predictors that were consumed to make this prediction */
  consumedPredictors?: PredictorWithSignal[];
  /** Target info for context */
  target?: {
    id: string;
    symbol: string;
    name: string;
    target_type: string;
  };
}

/**
 * Unused predictor analysis
 * For missed opportunities: predictors that existed but weren't consumed
 */
export interface UnusedPredictorAnalysis {
  predictor: PredictorWithSignal;
  /** Why wasn't this predictor used? */
  reason:
    | 'below_threshold' // Confidence/strength below threshold
    | 'insufficient_count' // Not enough predictors to trigger prediction
    | 'conflicting' // Conflicting with other predictors
    | 'expired' // Expired before prediction window
    | 'wrong_timeframe'; // Didn't align with prediction timeframe
  /** What threshold would have included this predictor? */
  suggestedThreshold?: number;
}

/**
 * Misread signal analysis
 * Signals that existed but were evaluated incorrectly or rejected
 */
export interface MisreadSignalAnalysis {
  signal: SignalWithSource;
  /** How was this signal handled? */
  originalDisposition: string;
  /** What the signal direction was */
  signalDirection: string;
  /** What the actual move direction was */
  actualDirection: PredictionDirection;
  /** Why this might have been misread */
  possibleIssue:
    | 'rejected_incorrectly' // Signal was rejected but should have been used
    | 'wrong_direction' // Analyst read direction wrong
    | 'underweighted' // Created weak predictor when should have been strong
    | 'missed_urgency'; // Didn't catch urgency, processed too late
}

/**
 * Source research result from Gemini
 */
export interface SourceResearchResult {
  /** What news/events caused the move */
  discoveredDrivers: string[];
  /** Signals we had but didn't act on (from our data) */
  signalsWeHad: string[];
  /** Types of signals we would have needed */
  signalTypesNeeded: string[];
  /** Specific sources that would have had this info */
  suggestedSources: Array<{
    name: string;
    type: 'news' | 'sec_filing' | 'social' | 'analyst' | 'data_feed' | 'other';
    url?: string;
    description: string;
  }>;
  /** Was this move predictable or a black swan? */
  predictability: 'predictable' | 'difficult' | 'unpredictable';
  /** AI reasoning for the assessment */
  reasoning: string;
}

/**
 * Complete investigation result for a single miss
 */
export interface MissInvestigation {
  id: string;
  /** The prediction (explicit or baseline) */
  prediction: PredictionWithChain;
  /** Type of miss */
  missType: MissType;
  /** What was predicted vs what happened */
  predicted: {
    direction: PredictionDirection;
    magnitude: string | null;
    confidence: number;
  };
  actual: {
    direction: PredictionDirection;
    magnitude: number; // percentage
  };

  /** Investigation level reached */
  investigationLevel: InvestigationLevel;

  /** Level 1: Unused predictors that could have helped */
  unusedPredictors: UnusedPredictorAnalysis[];

  /** Level 2: Signals that were misread or rejected incorrectly */
  misreadSignals: MisreadSignalAnalysis[];

  /** Level 3: External research results (from Gemini) */
  sourceResearch?: SourceResearchResult;

  /** Suggested learning based on investigation */
  suggestedLearning?: SuggestedLearningFromInvestigation;

  /** Investigation timestamps */
  investigatedAt: string;
  researchedAt?: string; // When Gemini research was done
}

/**
 * Suggested learning generated from investigation
 */
export interface SuggestedLearningFromInvestigation {
  type: 'rule' | 'pattern' | 'weight_adjustment' | 'threshold' | 'avoid';
  scope: 'runner' | 'domain' | 'universe' | 'target' | 'analyst';
  title: string;
  description: string;
  config: Record<string, unknown>;
  /** What evidence supports this learning */
  evidence: {
    missType: MissType;
    investigationLevel: InvestigationLevel;
    /** Key findings that led to this suggestion */
    keyFindings: string[];
  };
  /** Suggested test to validate the learning */
  suggestedTest?: {
    type: 'backtest' | 'simulation' | 'threshold_test';
    description: string;
    params: Record<string, unknown>;
  };
}

/**
 * Batch of misses for research (sent to Gemini)
 */
export interface MissResearchBatch {
  date: string;
  misses: Array<{
    targetSymbol: string;
    targetName: string;
    missType: MissType;
    predictedDirection?: PredictionDirection;
    actualDirection: PredictionDirection;
    actualMagnitude: number;
    /** Signals we had for context */
    existingSignals: Array<{
      content: string;
      direction: string;
      source: string;
    }>;
  }>;
}

/**
 * Daily investigation summary
 */
export interface DailyInvestigationSummary {
  date: string;
  totalMisses: number;
  byType: {
    missed_opportunity: number;
    direction_wrong: number;
    magnitude_wrong: number;
    false_positive: number;
  };
  byLevel: {
    predictor: number; // Could have been caught with existing predictors
    signal: number; // Could have been caught with better signal reading
    source: number; // Need new sources
    unpredictable: number; // Black swan events
  };
  learningsSuggested: number;
  /** Top suggested sources to add */
  topSourceGaps: Array<{
    sourceName: string;
    sourceType: string;
    mentionCount: number;
  }>;
}
