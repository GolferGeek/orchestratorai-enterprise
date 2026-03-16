import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnhanceVersionDto {
  @ApiProperty({ description: 'Instruction for how to enhance the content' })
  @IsString()
  instruction!: string;

  @ApiPropertyOptional({
    description: 'Preferred provider (e.g., openai, anthropic, google, ollama)',
  })
  @IsOptional()
  @IsString()
  providerName?: string;

  @ApiPropertyOptional({ description: 'Preferred model name for the provider' })
  @IsOptional()
  @IsString()
  modelName?: string;

  @ApiPropertyOptional({ description: 'Sampling temperature (0.0-1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Max output tokens for the enhancement' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTokens?: number;
}
