import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

// Content Type DTOs
export class ContentTypeDto {
  @IsString()
  id!: string;

  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  systemPromptTemplate?: string;

  @IsOptional()
  @IsArray()
  requiredFields?: string[];

  @IsBoolean()
  isActive!: boolean;
}

// Marketing Agent DTOs
export class MarketingAgentDto {
  @IsString()
  id!: string;

  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsString()
  role!: 'writer' | 'editor' | 'evaluator';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsBoolean()
  isActive!: boolean;
}

// Create/Update DTOs (for future admin endpoints)
export class CreateContentTypeDto {
  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  systemPromptTemplate?: string;

  @IsOptional()
  @IsArray()
  requiredFields?: string[];
}

export class UpdateContentTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  systemPromptTemplate?: string;

  @IsOptional()
  @IsArray()
  requiredFields?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
