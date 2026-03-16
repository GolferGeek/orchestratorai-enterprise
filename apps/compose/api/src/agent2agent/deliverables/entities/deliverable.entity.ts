import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliverableType,
  DeliverableFormat,
  DeliverableVersionCreationType,
} from '../dto';

export class DeliverableVersion {
  @ApiProperty({ description: 'Version identifier' })
  id!: string;

  @ApiProperty({ description: 'Parent deliverable identifier' })
  deliverableId!: string;

  @ApiProperty({ description: 'Version number (sequential)' })
  versionNumber!: number;

  @ApiPropertyOptional({ description: 'Version content' })
  content?: string;

  @ApiPropertyOptional({
    enum: DeliverableFormat,
    description: 'Format of the content',
  })
  format?: DeliverableFormat;

  @ApiProperty({ description: 'Whether this is the current version' })
  isCurrentVersion!: boolean;

  @ApiProperty({
    enum: DeliverableVersionCreationType,
    description: 'How this version was created',
  })
  createdByType!: DeliverableVersionCreationType;

  @ApiPropertyOptional({
    description: 'Task that created this version (if any)',
  })
  taskId?: string;

  @ApiPropertyOptional({
    description: 'Version-specific metadata',
    type: 'object',
    additionalProperties: true,
  })
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'File attachments for this version',
    type: 'object',
    additionalProperties: true,
  })
  fileAttachments?: Record<string, unknown>;

  @ApiProperty({ description: 'Version creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Version last update timestamp' })
  updatedAt!: Date;
}

export class Deliverable {
  @ApiProperty({ description: 'Unique identifier' })
  id!: string;

  @ApiProperty({ description: 'User who owns this deliverable' })
  userId!: string;

  @ApiPropertyOptional({
    description:
      'Conversation this deliverable belongs to (optional - when deliverable is part of a conversation)',
  })
  conversationId?: string;

  @ApiPropertyOptional({
    description:
      'Agent that should handle editing this deliverable (inherited from creating conversation)',
  })
  agentName?: string;

  @ApiProperty({ description: 'Title of the deliverable' })
  title!: string;

  @ApiPropertyOptional({
    enum: DeliverableType,
    description: 'Type of deliverable',
  })
  type?: DeliverableType;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;

  // Include current version data when fetched
  @ApiPropertyOptional({
    description: 'Current version data',
    type: () => DeliverableVersion,
  })
  currentVersion?: DeliverableVersion;

  // Include all versions when requested
  @ApiPropertyOptional({
    description: 'All versions',
    type: () => [DeliverableVersion],
  })
  versions?: DeliverableVersion[];
}

export class DeliverableSearchResult {
  @ApiProperty({ description: 'Deliverable identifier' })
  id!: string;

  @ApiProperty({ description: 'User who owns this deliverable' })
  userId!: string;

  @ApiPropertyOptional({
    description: 'Conversation this deliverable belongs to (if any)',
  })
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Agent that should handle editing this deliverable',
  })
  agentName?: string;

  @ApiProperty({ description: 'Deliverable title' })
  title!: string;

  @ApiPropertyOptional({
    enum: DeliverableType,
    description: 'Type of deliverable',
  })
  type?: DeliverableType;

  @ApiProperty({ description: 'Deliverable creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Deliverable last update timestamp' })
  updatedAt!: Date;

  // Current version information
  @ApiPropertyOptional({
    enum: DeliverableFormat,
    description: 'Format of the current version content',
  })
  format?: DeliverableFormat;

  @ApiPropertyOptional({ description: 'Current version content preview' })
  content?: string;

  @ApiPropertyOptional({
    description: 'Current version metadata',
    type: 'object',
    additionalProperties: true,
  })
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Current version number' })
  versionNumber?: number;

  @ApiPropertyOptional({ description: 'Whether this has a current version' })
  isCurrentVersion?: boolean;

  @ApiPropertyOptional({ description: 'Current version identifier' })
  versionId?: string;
}
