import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type SourceContext = 'web-app' | 'default';

export class ExecuteCommandDto {
  @ApiProperty({
    description: 'The prompt or command to execute',
    example: '/test',
  })
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @ApiPropertyOptional({
    description: 'Session ID to resume a previous conversation.',
    example: '7cc98885-14ef-4f81-bc29-95c19a2c82b9',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description:
      'Source context identifying which product is calling (sets system prompt context).',
    example: 'web-app',
    enum: ['web-app', 'default'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['web-app', 'default'])
  sourceContext?: SourceContext;

  @ApiPropertyOptional({
    description:
      'Application context providing information about what the user is currently viewing.',
    example: 'The user is currently viewing the Forge agent dashboard.',
  })
  @IsString()
  @IsOptional()
  applicationContext?: string;

  @ApiPropertyOptional({
    description:
      'Product context (forge, compose, admin, pulse, bridge) for scoping.',
    example: 'forge',
  })
  @IsString()
  @IsOptional()
  product?: string;
}
