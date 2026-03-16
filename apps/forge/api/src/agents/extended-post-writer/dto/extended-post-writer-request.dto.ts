import { IsString, IsOptional, IsArray, IsNotEmpty } from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../../shared/common/validators/execution-context.validator';

/**
 * Request DTO for Extended Post Writer agent
 *
 * Uses ExecutionContext type directly from transport-types.
 * Validation is done via custom @IsValidExecutionContext decorator
 * which uses the isExecutionContext() type guard from transport-types.
 */
export class ExtendedPostWriterRequestDto {
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @IsNotEmpty()
  userMessage!: string;

  @IsOptional()
  @IsString()
  contextInfo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  tone?: string;
}
