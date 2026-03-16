import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../../shared/common/validators/execution-context.validator';
import { LegalDocumentMetadata } from '../legal-department.state';

/**
 * Document DTO for legal analysis
 */
export class LegalDocumentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsOptional()
  type?: string;
}

/**
 * Request DTO for Legal Department agent
 *
 * Uses ExecutionContext type directly from transport-types.
 * Validation is done via custom @IsValidExecutionContext decorator
 * which uses the isExecutionContext() type guard from transport-types.
 *
 * Phase 3 (M0): Documents are accepted but not processed (placeholder for future)
 */
export class LegalDepartmentRequestDto {
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @IsNotEmpty()
  userMessage!: string;

  @IsArray()
  @IsOptional()
  documents?: LegalDocumentDto[];

  @IsObject()
  @IsOptional()
  legalMetadata?: LegalDocumentMetadata;
}
