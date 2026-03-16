import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RerunWithLLMDto {
  @ApiProperty({
    description: 'LLM provider to use for rerun (e.g., "anthropic", "openai")',
    example: 'anthropic',
  })
  @IsString()
  provider!: string;

  @ApiProperty({
    description:
      'LLM model to use for rerun (e.g., "claude-3-5-sonnet-20241022", "gpt-4")',
    example: 'claude-3-5-sonnet-20241022',
  })
  @IsString()
  model!: string;

  @ApiPropertyOptional({
    description: 'Temperature for LLM generation (0.0 to 2.0)',
    minimum: 0,
    maximum: 2,
    example: 0.7,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Maximum tokens for LLM response',
    minimum: 1,
    example: 4000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTokens?: number;

  @ApiPropertyOptional({
    description: 'ID of the source version being re-run (for tracking)',
  })
  @IsOptional()
  @IsUUID()
  sourceVersionId?: string;
}
