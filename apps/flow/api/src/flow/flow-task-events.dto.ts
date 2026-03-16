import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class IngestEventDto {
  @IsString()
  @MinLength(1)
  taskId!: string;

  @IsString()
  @MinLength(1)
  eventType!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  step?: string;

  @IsOptional()
  @IsString()
  toolName?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  sourceApp?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class CreateTaskBodyDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsOptional()
  @IsUUID()
  sourceChannelUserId?: string;
}

export class UpdateTaskStatusBodyDto {
  @IsString()
  @MinLength(1)
  taskId!: string;

  @IsString()
  @MinLength(1)
  status!: string;
}

export class AddTaskCommentBodyDto {
  @IsString()
  @MinLength(1)
  taskId!: string;

  @IsString()
  @MinLength(1)
  comment!: string;
}

export interface CreateTaskResponseDto {
  ok: boolean;
  task: {
    id: string;
    title: string;
    provider: 'flow' | 'slack' | 'ado';
    externalId?: string;
  };
}
