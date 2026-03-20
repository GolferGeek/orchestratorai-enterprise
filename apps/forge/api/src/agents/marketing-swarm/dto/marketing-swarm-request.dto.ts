import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * MarketingSwarmRequestDto
 *
 * Phase 2: Simplified DTO - task configuration comes from database.
 *
 * The task must already exist in marketing.swarm_tasks table
 * (created by frontend when user submits config form).
 * The conversationId in context.conversationId references that conversation.
 *
 * This DTO only requires context with conversationId - the service will
 * fetch the full task configuration from the database.
 *
 * Note: userMessage is optional and ignored - included because the A2A
 * layer sends it by default for all API agents.
 */
export class MarketingSwarmRequestDto {
  @IsObject()
  @IsNotEmpty()
  context!: ExecutionContext;

  @IsString()
  @IsOptional()
  userMessage?: string;
}
