import { IsString, IsNotEmpty } from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../../shared/common/validators/execution-context.validator';

/**
 * Request DTO for Business Automation Advisor agent
 *
 * Takes an industry/business type and returns agent recommendations.
 */
export class BusinessAutomationAdvisorRequestDto {
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @IsNotEmpty()
  industry!: string;
}
