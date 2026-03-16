import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Agent recommendation structure
 */
export class AgentRecommendationDto {
  @IsString()
  name!: string;

  @IsString()
  tagline!: string;

  @IsString()
  description!: string;

  @IsString()
  use_case_example!: string;

  @IsString()
  time_saved!: string;

  @IsString()
  wow_factor!: string;

  @IsString()
  category!: string;
}

/**
 * Request DTO for submitting interest in selected agents
 *
 * Stores lead submission in the database for follow-up.
 */
export class SubmitInterestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  industryInput!: string;

  @IsString()
  @IsOptional()
  normalizedIndustry?: string;

  @IsString()
  @IsOptional()
  industryDescription?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentRecommendationDto)
  selectedAgents!: AgentRecommendationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentRecommendationDto)
  @IsOptional()
  allRecommendations?: AgentRecommendationDto[];

  @IsBoolean()
  @IsOptional()
  isFallback?: boolean;

  @IsNumber()
  @IsOptional()
  processingTimeMs?: number;
}
