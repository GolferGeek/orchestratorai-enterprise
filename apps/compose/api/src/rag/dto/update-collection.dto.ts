import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsBoolean,
  IsIn,
} from 'class-validator';

import { RagComplexityType } from './create-collection.dto';

export class UpdateCollectionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  requiredRole?: string | null;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  allowedUsers?: string[] | null;

  @IsBoolean()
  @IsOptional()
  clearAllowedUsers?: boolean;

  @IsString()
  @IsIn(['basic', 'attributed', 'hybrid', 'cross-reference', 'temporal'])
  @IsOptional()
  complexityType?: RagComplexityType;
}
