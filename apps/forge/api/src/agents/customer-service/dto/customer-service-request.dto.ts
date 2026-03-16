import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../../shared/common/validators/execution-context.validator';
import { InteractionMode } from '../customer-service.state';

/**
 * Individual conversation message DTO
 */
export class ConversationMessageDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content!: string;
}

/**
 * Request DTO for Customer Service agent
 *
 * Receives A2A request with ExecutionContext, userMessage,
 * conversation history, and interactionMode.
 */
export class CustomerServiceRequestDto {
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @IsNotEmpty()
  userMessage!: string;

  /**
   * Conversation history for multi-turn context.
   * Last 20 messages are used; first user message is always preserved.
   */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  messages?: ConversationMessageDto[];

  /**
   * Interaction mode — affects response length.
   * voice: 2-3 sentences max (spoken aloud)
   * text: more detailed but still concise
   */
  @IsString()
  @IsIn(['text', 'voice'])
  @IsOptional()
  interactionMode?: InteractionMode;
}
