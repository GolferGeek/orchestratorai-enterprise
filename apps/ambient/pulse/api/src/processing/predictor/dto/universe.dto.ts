import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  ValidateNested,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LlmProviderModelDto {
  @IsString()
  provider!: string;

  @IsString()
  model!: string;
}

export class LlmConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LlmProviderModelDto)
  gold?: LlmProviderModelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmProviderModelDto)
  silver?: LlmProviderModelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmProviderModelDto)
  bronze?: LlmProviderModelDto;
}

export class ThresholdConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  min_predictors?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_combined_strength?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  min_direction_consensus?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  predictor_ttl_hours?: number;
}

export class NotificationConfigDto {
  @IsBoolean()
  urgent_enabled!: boolean;

  @IsBoolean()
  new_prediction_enabled!: boolean;

  @IsBoolean()
  outcome_enabled!: boolean;

  @IsArray()
  @IsEnum(['push', 'sms', 'email', 'sse'], { each: true })
  channels!: ('push' | 'sms' | 'email' | 'sse')[];
}

export class CreateUniverseDto {
  @IsString()
  organization_slug!: string;

  @IsString()
  agent_slug!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(['stocks', 'crypto', 'elections', 'polymarket'])
  domain!: 'stocks' | 'crypto' | 'elections' | 'polymarket';

  @IsOptional()
  @IsUUID()
  strategy_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmConfigDto)
  llm_config?: LlmConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThresholdConfigDto)
  thresholds?: ThresholdConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationConfigDto)
  notification_config?: NotificationConfigDto;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateUniverseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['stocks', 'crypto', 'elections', 'polymarket'])
  domain?: 'stocks' | 'crypto' | 'elections' | 'polymarket';

  @IsOptional()
  @IsUUID()
  strategy_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmConfigDto)
  llm_config?: LlmConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThresholdConfigDto)
  thresholds?: ThresholdConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationConfigDto)
  notification_config?: NotificationConfigDto;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
