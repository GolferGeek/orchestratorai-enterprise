import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  IsNumber,
  IsObject,
  IsArray,
  Min,
  Max,
} from 'class-validator';

/**
 * Tier instructions DTO - maps LLM tiers to instructions
 */
export class TierInstructionsDto {
  @IsOptional()
  @IsString()
  gold?: string;

  @IsOptional()
  @IsString()
  silver?: string;

  @IsOptional()
  @IsString()
  bronze?: string;

  // Index signature for TierInstructions compatibility
  [key: string]: string | undefined;
}

/**
 * Create analyst DTO - validates analyst creation
 */
export class CreateAnalystDto {
  @IsEnum(['runner', 'domain', 'universe', 'target'])
  scope_level!: 'runner' | 'domain' | 'universe' | 'target';

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsUUID()
  universe_id?: string;

  @IsOptional()
  @IsUUID()
  target_id?: string;

  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsString()
  perspective!: string;

  @IsOptional()
  @IsObject()
  tier_instructions?: TierInstructionsDto;

  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(2.0)
  default_weight?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learned_patterns?: string[];

  @IsOptional()
  @IsUUID()
  agent_id?: string;

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

/**
 * Update analyst DTO - validates analyst updates
 */
export class UpdateAnalystDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  perspective?: string;

  @IsOptional()
  @IsObject()
  tier_instructions?: TierInstructionsDto;

  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(2.0)
  default_weight?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learned_patterns?: string[];

  @IsOptional()
  @IsUUID()
  agent_id?: string;

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

/**
 * Analyst override DTO - validates weight/tier overrides
 */
export class CreateAnalystOverrideDto {
  @IsUUID()
  analyst_id!: string;

  @IsOptional()
  @IsUUID()
  universe_id?: string;

  @IsOptional()
  @IsUUID()
  target_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(2.0)
  weight_override?: number;

  @IsOptional()
  @IsEnum(['gold', 'silver', 'bronze'])
  tier_override?: 'gold' | 'silver' | 'bronze';

  @IsOptional()
  @IsBoolean()
  is_enabled_override?: boolean;
}

/**
 * Update analyst override DTO
 */
export class UpdateAnalystOverrideDto {
  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(2.0)
  weight_override?: number;

  @IsOptional()
  @IsEnum(['gold', 'silver', 'bronze'])
  tier_override?: 'gold' | 'silver' | 'bronze';

  @IsOptional()
  @IsBoolean()
  is_enabled_override?: boolean;
}
