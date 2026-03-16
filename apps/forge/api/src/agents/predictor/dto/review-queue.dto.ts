import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

/**
 * DTO for creating a review queue item
 * Used when a signal has confidence between 0.4-0.7 and needs human review
 */
export class CreateReviewQueueItemDto {
  @IsUUID()
  signal_id!: string;

  @IsUUID()
  target_id!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsEnum(['approve', 'reject', 'modify'])
  recommended_action!: 'approve' | 'reject' | 'modify';

  @IsString()
  assessment_summary!: string;

  @IsOptional()
  @IsString()
  analyst_reasoning?: string;
}

/**
 * DTO for human review response to a queued item
 * Handles approve, reject, or modify decisions with optional overrides
 */
export class ReviewResponseDto {
  @IsUUID()
  review_id!: string;

  @IsEnum(['approve', 'reject', 'modify'])
  decision!: 'approve' | 'reject' | 'modify';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  strength_override?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  learning_note?: string;
}
