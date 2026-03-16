import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsUUID,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DeliverableType {
  DOCUMENT = 'document',
  ANALYSIS = 'analysis',
  REPORT = 'report',
  PLAN = 'plan',
  REQUIREMENTS = 'requirements',
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum DeliverableFormat {
  MARKDOWN = 'markdown',
  TEXT = 'text',
  JSON = 'json',
  HTML = 'html',
  IMAGE_PNG = 'image/png',
  IMAGE_JPEG = 'image/jpeg',
  IMAGE_WEBP = 'image/webp',
  IMAGE_GIF = 'image/gif',
  IMAGE_SVG = 'image/svg+xml',
}

export enum DeliverableVersionCreationType {
  AI_RESPONSE = 'ai_response',
  MANUAL_EDIT = 'manual_edit',
  AI_ENHANCEMENT = 'ai_enhancement',
  USER_REQUEST = 'user_request',
  CONVERSATION_TASK = 'conversation_task',
  CONVERSATION_MERGE = 'conversation_merge',
  LLM_RERUN = 'llm_rerun',
}

// Custom validator to ensure conversationId is provided
function RequireConversationId(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'requireConversationId',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as CreateDeliverableDto;
          return !!obj.conversationId;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'conversationId must be provided';
        },
      },
    });
  };
}

export class CreateDeliverableDto {
  @ApiProperty({ description: 'Title of the deliverable', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    enum: DeliverableType,
    description: 'Type of deliverable',
  })
  @IsOptional()
  @IsEnum(DeliverableType)
  type?: DeliverableType;

  @ApiProperty({
    description: 'Conversation ID this deliverable belongs to (required)',
  })
  @IsUUID()
  @RequireConversationId({
    message: 'conversationId must be provided',
  })
  conversationId!: string;

  @ApiPropertyOptional({
    description:
      'Agent that should handle editing this deliverable (inherited from creating conversation)',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  agentName?: string;

  @ApiPropertyOptional({
    description:
      'Task ID that created this deliverable (links deliverable to task)',
  })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  // Initial version data (optional - can be added later)
  @ApiPropertyOptional({ description: 'Initial content for the first version' })
  @IsOptional()
  @IsString()
  initialContent?: string;

  @ApiPropertyOptional({
    enum: DeliverableFormat,
    description: 'Format of the initial content',
  })
  @IsOptional()
  @IsEnum(DeliverableFormat)
  initialFormat?: DeliverableFormat;

  @ApiPropertyOptional({
    enum: DeliverableVersionCreationType,
    description: 'How the initial version was created',
  })
  @IsOptional()
  @IsEnum(DeliverableVersionCreationType)
  initialCreationType?: DeliverableVersionCreationType;

  @ApiPropertyOptional({
    description: 'Task ID that created the initial version',
  })
  @IsOptional()
  @IsUUID()
  initialTaskId?: string;

  @ApiPropertyOptional({
    description: 'Initial version metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  initialMetadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Initial file attachments for the first version',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  initialFileAttachments?: Record<string, unknown>;
}
