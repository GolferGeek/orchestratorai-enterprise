import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AgentTaskMode,
  TaskMessage,
  TaskRequestParams,
  ExecutionContext,
  isExecutionContext,
} from '@orchestrator-ai/transport-types';

// Re-export shared types
export { AgentTaskMode, TaskMessage, TaskRequestParams };

/**
 * ExecutionContext DTO for validation
 * Maps to ExecutionContext interface from transport-types
 */
export class ExecutionContextDto implements ExecutionContext {
  @IsString()
  orgSlug!: string;

  @IsString()
  userId!: string;

  @IsString()
  conversationId!: string;

  @IsString()
  taskId!: string;

  @IsString()
  planId!: string;

  @IsString()
  deliverableId!: string;

  @IsString()
  agentSlug!: string;

  @IsString()
  agentType!: string;

  @IsString()
  provider!: string;

  @IsString()
  model!: string;
}

export class TaskMessageDto {
  @IsString()
  role!: string;

  @IsOptional()
  content?: unknown;
}

/**
 * Task Request DTO
 *
 * The ExecutionContext is the core capsule that flows through the system.
 * It's created by the frontend and passed with every request.
 *
 * Note: The server will override context.userId with the authenticated user's ID
 * for security - we don't trust client-provided userId.
 */
export class TaskRequestDto {
  /**
   * ExecutionContext - Required, created by frontend
   * Contains all context needed for task execution
   */
  @IsObject()
  @ValidateNested()
  @Type(() => ExecutionContextDto)
  @IsValidExecutionContext()
  context!: ExecutionContext;

  /**
   * Agent task mode - Optional, can be derived from JSON-RPC method
   */
  @IsOptional()
  @IsEnum(AgentTaskMode)
  mode?: AgentTaskMode;

  /**
   * User's message/prompt
   */
  @IsOptional()
  @IsString()
  userMessage?: string;

  /**
   * Action-specific payload (action params, config, etc.)
   */
  @IsOptional()
  @IsObject()
  @IsModePayloadValid()
  payload?: Record<string, unknown>;

  /**
   * Prompt template parameters
   */
  @IsOptional()
  @IsObject()
  promptParameters?: Record<string, unknown>;

  /**
   * Conversation history messages
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskMessageDto)
  messages?: TaskMessageDto[];

  /**
   * Additional metadata
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * Task request after normalization (mode is guaranteed to be set)
 */
export type NormalizedTaskRequestDto = TaskRequestDto & { mode: AgentTaskMode };

/**
 * Custom validator for mode-specific payloads
 * Validates payload structure based on agent mode
 */
function IsModePayloadValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isModePayloadValid',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const request = args.object as TaskRequestDto;
          const mode = request.mode;

          // Payload is optional for some modes
          if (!mode || !value) {
            return true;
          }

          // Validate payload is an object
          if (typeof value !== 'object' || value === null) {
            return false;
          }

          const payload = value as Record<string, unknown>;

          // Validate based on mode
          switch (mode) {
            case AgentTaskMode.PLAN:
            case AgentTaskMode.BUILD:
              // PLAN and BUILD modes require 'action' field if payload present
              if (payload.action) {
                const validActions = [
                  'create',
                  'read',
                  'list',
                  'edit',
                  'rerun',
                  'set_current',
                  'delete_version',
                  'merge_versions',
                  'copy_version',
                  'delete',
                ];
                return validActions.includes(payload.action as string);
              }
              // No action means 'create' by default - allow it
              return true;

            case AgentTaskMode.HITL:
              // HITL mode requires 'action' field
              if (payload.action) {
                const validActions = ['resume', 'status', 'history', 'pending'];
                return validActions.includes(payload.action as string);
              }
              return false;

            case AgentTaskMode.CONVERSE:
              // CONVERSE mode has no required action field
              // Payload is completely optional
              return true;

            default:
              // Unknown mode - allow any payload
              return true;
          }
        },
        defaultMessage(args: ValidationArguments) {
          const request = args.object as TaskRequestDto;
          return `Payload does not match ${request.mode} mode requirements. Check transport-types for valid payload structure.`;
        },
      },
    });
  };
}

/**
 * Custom validator for ExecutionContext
 * Uses transport-types type guard for validation
 */
function IsValidExecutionContext(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidExecutionContext',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isExecutionContext(value);
        },
        defaultMessage() {
          return 'ExecutionContext does not match transport-types definition. All required fields must be present.';
        },
      },
    });
  };
}
