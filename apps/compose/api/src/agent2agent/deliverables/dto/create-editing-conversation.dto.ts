import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEditingConversationDto {
  @ApiPropertyOptional({
    description:
      'Agent to use for the editing conversation (overrides deliverable agent_name if provided)',
    example: 'document-writer',
  })
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({
    description: 'Initial message to start the conversation',
    example: 'I want to enhance this deliverable with more detailed examples.',
  })
  @IsOptional()
  @IsString()
  initialMessage?: string;

  @ApiPropertyOptional({
    description: 'Type of editing action to perform',
    enum: ['edit', 'enhance', 'revise', 'discuss', 'new-version'],
    example: 'enhance',
  })
  @IsOptional()
  @IsString()
  @IsIn(['edit', 'enhance', 'revise', 'discuss', 'new-version'])
  action?: string;
}
