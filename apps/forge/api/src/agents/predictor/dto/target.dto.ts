import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LlmConfigDto } from './universe.dto';

export class CreateTargetDto {
  @IsUUID()
  universe_id!: string;

  @IsString()
  symbol!: string;

  @IsString()
  name!: string;

  @IsEnum(['stock', 'crypto', 'election', 'polymarket'])
  target_type!: 'stock' | 'crypto' | 'election' | 'polymarket';

  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmConfigDto)
  llm_config_override?: LlmConfigDto;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateTargetDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmConfigDto)
  llm_config_override?: LlmConfigDto;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_archived?: boolean;
}
