import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Valid source contexts for Claude Code SDK calls.
 * Each context loads a corresponding .claude/contexts/{source}.md file
 * that provides app-specific guidance and progressive skill references.
 */
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
    description: 'Optional skill to target',
    example: 'api-testing-skill',
  })
  @IsString()
  @IsOptional()
  skill?: string;

  @ApiPropertyOptional({
    description:
      'Session ID to resume a previous conversation. If provided, continues the existing session with full context.',
    example: '7cc98885-14ef-4f81-bc29-95c19a2c82b9',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description:
      'Source context identifying which app is calling Claude Code SDK. ' +
      'Loads app-specific context from .claude/contexts/{sourceContext}.md ' +
      'which provides architecture guidance and progressive skill references.',
    example: 'web-app',
    enum: ['web-app', 'default'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['web-app', 'default'])
  sourceContext?: SourceContext;

  @ApiPropertyOptional({
    description:
      'Application context providing information about what the user is currently viewing. ' +
      'Includes current route, agent, conversation, and other contextual information. ' +
      "Formatted as text to be included in Claude's system prompt.",
    example:
      'The user is currently viewing: conversation\nActive agent: Marketing Swarm (type: orchestrator)\nOrganization: acme-corp',
  })
  @IsString()
  @IsOptional()
  applicationContext?: string;
}
