import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export enum AgentType {
  CONTEXT = 'context',
  API = 'api',
  EXTERNAL = 'external',
}

export class CreateAgentDto {
  @ApiProperty({
    description: 'Organization slug array (empty for global)',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organization_slug?: string[];

  @ApiProperty({
    description: 'Unique agent slug',
    examples: ['blog_post', 'hr_assistant'],
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,62}$/)
  slug!: string;

  @ApiProperty({ description: 'Agent name', example: 'Blog Post Writer' })
  @IsString()
  display_name!: string;

  @ApiProperty({ enum: AgentType, example: AgentType.CONTEXT })
  @IsEnum(AgentType)
  agent_type!: AgentType;

  @ApiProperty({
    description: 'Department/category for the agent',
    example: 'engineering',
    required: false,
  })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({
    description: 'Agent version',
    example: '1.0.0',
    required: false,
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({
    description: 'Tags for categorization',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Agent capabilities',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @ApiProperty({
    description: 'Agent description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Markdown context/prompt for agent',
    required: false,
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiProperty({
    description: 'I/O schema definition',
    required: false,
  })
  @IsOptional()
  @IsObject()
  io_schema?: Record<string, unknown>;

  @ApiProperty({
    description: 'Endpoint configuration (for API/external agents)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  endpoint?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'LLM configuration (for context agents)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  llm_config?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Additional metadata',
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({
    description:
      'Require local model - when true, only local LLM providers (e.g., Ollama) are allowed',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  require_local_model?: boolean;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  display_name?: string;

  @IsOptional()
  @IsString()
  mode_profile?: string;

  @IsOptional()
  @IsString()
  yaml?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  agent_card?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown> | null;

  @ApiProperty({
    description:
      'Require local model - when true, only local LLM providers (e.g., Ollama) are allowed',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  require_local_model?: boolean;
}
