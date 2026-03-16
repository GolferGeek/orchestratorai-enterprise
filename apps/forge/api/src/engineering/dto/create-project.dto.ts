import {
  IsString,
  IsOptional,
  IsObject,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Organization slug', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  orgSlug!: string;

  @ApiProperty({ description: 'Project name', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ description: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Project constraints (units, material, manufacturing method, etc.)',
    example: {
      units: 'mm',
      material: 'Aluminum 6061',
      manufacturing_method: 'CNC',
      tolerance_class: 'standard',
      wall_thickness_min: 2.0,
    },
  })
  @IsOptional()
  @IsObject()
  constraints?: {
    units?: string;
    material?: string;
    manufacturing_method?: string;
    tolerance_class?: string;
    wall_thickness_min?: number;
  };

  @ApiPropertyOptional({
    description: 'Additional metadata',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'User ID creating the project' })
  @IsOptional()
  @IsUUID()
  created_by?: string;
}
