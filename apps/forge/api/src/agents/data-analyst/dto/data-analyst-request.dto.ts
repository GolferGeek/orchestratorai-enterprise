import { IsString, IsNotEmpty } from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../../shared/common/validators/execution-context.validator';

/**
 * Request DTO for Data Analyst agent
 *
 * Uses ExecutionContext type directly from transport-types.
 * Validation is done via custom @IsValidExecutionContext decorator
 * which uses the isExecutionContext() type guard from transport-types.
 */
export class DataAnalystRequestDto {
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @IsNotEmpty()
  userMessage!: string;
}
