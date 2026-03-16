import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: 'Project name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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
}
