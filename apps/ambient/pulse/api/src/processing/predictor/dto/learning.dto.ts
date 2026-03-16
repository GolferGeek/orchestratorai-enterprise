import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import {
  LearningScopeLevel,
  LearningType,
  LearningSourceType,
  LearningStatus,
  LearningConfig,
} from '../interfaces/learning.interface';

/**
 * Create learning DTO - validates learning creation
 */
export class CreateLearningDto {
  @IsEnum(['runner', 'domain', 'universe', 'target'])
  scope_level!: LearningScopeLevel;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsUUID()
  universe_id?: string;

  @IsOptional()
  @IsUUID()
  target_id?: string;

  @IsOptional()
  @IsUUID()
  analyst_id?: string;

  @IsEnum(['rule', 'pattern', 'weight_adjustment', 'threshold', 'avoid'])
  learning_type!: LearningType;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsObject()
  config?: LearningConfig;

  @IsOptional()
  @IsEnum(['human', 'ai_suggested', 'ai_approved'])
  source_type?: LearningSourceType;

  @IsOptional()
  @IsUUID()
  source_evaluation_id?: string;

  @IsOptional()
  @IsUUID()
  source_missed_opportunity_id?: string;

  @IsOptional()
  @IsEnum(['active', 'superseded', 'disabled'])
  status?: LearningStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  version?: number;
}

/**
 * Update learning DTO - validates learning updates
 */
export class UpdateLearningDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: LearningConfig;

  @IsOptional()
  @IsEnum(['active', 'superseded', 'disabled'])
  status?: LearningStatus;

  @IsOptional()
  @IsUUID()
  superseded_by?: string;
}

/**
 * Create learning queue DTO - validates AI suggestion creation
 */
export class CreateLearningQueueDto {
  @IsEnum(['runner', 'domain', 'universe', 'target'])
  suggested_scope_level!: LearningScopeLevel;

  @IsOptional()
  @IsString()
  suggested_domain?: string;

  @IsOptional()
  @IsUUID()
  suggested_universe_id?: string;

  @IsOptional()
  @IsUUID()
  suggested_target_id?: string;

  @IsOptional()
  @IsUUID()
  suggested_analyst_id?: string;

  @IsEnum(['rule', 'pattern', 'weight_adjustment', 'threshold', 'avoid'])
  suggested_learning_type!: LearningType;

  @IsString()
  suggested_title!: string;

  @IsString()
  suggested_description!: string;

  @IsOptional()
  @IsObject()
  suggested_config?: LearningConfig;

  @IsOptional()
  @IsUUID()
  source_evaluation_id?: string;

  @IsOptional()
  @IsUUID()
  source_missed_opportunity_id?: string;

  @IsString()
  ai_reasoning!: string;

  @IsNumber()
  @Min(0.0)
  @Max(1.0)
  ai_confidence!: number;
}

/**
 * Review learning queue DTO - validates human review response
 */
export class ReviewLearningQueueDto {
  @IsEnum(['approved', 'rejected', 'modified'])
  status!: 'approved' | 'rejected' | 'modified';

  @IsOptional()
  @IsString()
  reviewer_notes?: string;

  @IsOptional()
  @IsEnum(['runner', 'domain', 'universe', 'target'])
  final_scope_level?: LearningScopeLevel;

  @IsOptional()
  @IsString()
  final_domain?: string;

  @IsOptional()
  @IsUUID()
  final_universe_id?: string;

  @IsOptional()
  @IsUUID()
  final_target_id?: string;

  @IsOptional()
  @IsUUID()
  final_analyst_id?: string;

  @IsOptional()
  @IsString()
  final_title?: string;

  @IsOptional()
  @IsString()
  final_description?: string;

  @IsOptional()
  @IsObject()
  final_config?: LearningConfig;

  @IsOptional()
  @IsEnum(['rule', 'pattern', 'weight_adjustment', 'threshold', 'avoid'])
  final_learning_type?: LearningType;
}
