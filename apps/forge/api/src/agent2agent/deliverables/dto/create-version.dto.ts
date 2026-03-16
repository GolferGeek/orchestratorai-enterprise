import {
  IsString,
  IsOptional,
  IsObject,
  IsEnum,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliverableFormat,
  DeliverableVersionCreationType,
} from './create-deliverable.dto';

export class CreateVersionDto {
  @ApiProperty({ description: 'Content of the new version' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({
    enum: DeliverableFormat,
    description: 'Format of the content',
  })
  @IsOptional()
  @IsEnum(DeliverableFormat)
  format?: DeliverableFormat;

  @ApiPropertyOptional({
    enum: DeliverableVersionCreationType,
    description: 'How this version was created',
  })
  @IsOptional()
  @IsEnum(DeliverableVersionCreationType)
  createdByType?: DeliverableVersionCreationType;

  @ApiPropertyOptional({
    description: 'Task ID that created this version',
  })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({
    description: 'Version-specific metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'File attachments for this version',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  fileAttachments?: Record<string, unknown>;
}
