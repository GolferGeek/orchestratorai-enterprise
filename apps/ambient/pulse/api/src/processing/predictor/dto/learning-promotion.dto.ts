/**
 * Learning Promotion DTOs and Interfaces
 * Data transfer objects for the learning promotion workflow (Phase 5)
 */

import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsISO8601,
  Min,
  Max,
} from 'class-validator';

/**
 * DTO for promoting a test learning to production (REQUEST)
 */
export class PromoteLearningDto {
  @IsString()
  learningId!: string;

  @IsOptional()
  @IsString()
  reviewerNotes?: string;

  @IsOptional()
  backtestResult?: BacktestResultDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scenarioRunIds?: string[];
}

/**
 * DTO for rejecting a test learning (REQUEST)
 */
export class RejectLearningDto {
  @IsString()
  learningId!: string;

  @IsString()
  reason!: string;
}

/**
 * DTO for configuring a backtest (REQUEST)
 */
export class BacktestConfigDto {
  @IsString()
  learningId!: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetSymbols?: string[];

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  criteria?: BacktestCriteriaDto;
}

/**
 * DTO for backtest criteria (REQUEST)
 */
export class BacktestCriteriaDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minAccuracyLift?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  maxFalsePositiveIncrease?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minSampleSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minStatisticalSignificance?: number;
}

/**
 * Interface for backtest results (RESPONSE)
 */
export interface BacktestResultDto {
  backtestId: string;
  learningId: string;
  passed: boolean;
  metrics: BacktestMetricsDto;
  executedAt: string;
  executionTimeMs: number;
}

/**
 * Interface for backtest metrics (RESPONSE)
 */
export interface BacktestMetricsDto {
  baselineAccuracy: number;
  withLearningAccuracy: number;
  accuracyLift: number;
  baselineFalsePositiveRate: number;
  withLearningFalsePositiveRate: number;
  falsePositiveDelta: number;
  predictionsAffected: number;
  predictionsImproved: number;
  predictionsDegraded: number;
  statisticalSignificance: number;
}

/**
 * Interface for validation check results (RESPONSE)
 */
export interface ValidationResultDto {
  learningId: string;
  isValid: boolean;
  checks: ValidationChecksDto;
  validationMetrics?: ValidationMetricsDto;
  errors: string[];
  warnings?: string[];
}

/**
 * Interface for validation checks (RESPONSE)
 */
export interface ValidationChecksDto {
  isTestLearning: boolean;
  isActive: boolean;
  notAlreadyPromoted: boolean;
  hasValidationMetrics: boolean;
  meetsMinApplications?: boolean;
  meetsMinSuccessRate?: boolean;
}

/**
 * Interface for validation metrics (RESPONSE)
 */
export interface ValidationMetricsDto {
  timesApplied: number;
  timesHelpful: number;
  successRate: number;
}

/**
 * Interface for promotion history response (RESPONSE)
 */
export interface PromotionHistoryDto {
  id: string;
  testLearningId: string;
  productionLearningId: string;
  testLearningTitle: string;
  productionLearningTitle: string;
  promotedBy: string;
  promotedByEmail?: string;
  promotedByName?: string;
  promotedAt: string;
  validationMetrics?: Record<string, unknown>;
  backtestResult?: Record<string, unknown>;
  reviewerNotes?: string;
  scenarioRuns?: string[];
}

/**
 * Interface for promotion statistics (RESPONSE)
 */
export interface PromotionStatsDto {
  totalTestLearnings: number;
  totalPromoted: number;
  totalRejected: number;
  pendingReview: number;
  avgTimesApplied: number;
  avgSuccessRate: number;
}
