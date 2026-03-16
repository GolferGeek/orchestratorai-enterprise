import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsArray,
} from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../../shared/common/validators/execution-context.validator';
import { CadConstraints } from '../cad-agent.state';

/**
 * Request DTO for CAD Agent
 *
 * Uses ExecutionContext type directly from transport-types.
 * Validation is done via custom @IsValidExecutionContext decorator
 * which uses the isExecutionContext() type guard from transport-types.
 */
export class CadAgentRequestDto {
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @IsNotEmpty()
  userMessage!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  newProjectName?: string;

  @IsOptional()
  @IsObject()
  constraints?: CadConstraints;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outputFormats?: string[];
}
