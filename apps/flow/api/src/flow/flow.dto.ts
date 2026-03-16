import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// Request DTOs
// ============================================================================

export class CreateEffortDto {
  @ApiProperty({ description: 'Effort name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Effort description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Status', default: 'not_started' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Order index', default: 0 })
  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Icon' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Color' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Estimated days' })
  @IsOptional()
  @IsNumber()
  estimatedDays?: number;
}

export class UpdateEffortDto {
  @ApiPropertyOptional({ description: 'Effort name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Effort description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Order index' })
  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Icon' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Color' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Estimated days' })
  @IsOptional()
  @IsNumber()
  estimatedDays?: number;
}

export class CreateFlowProjectDto {
  @ApiProperty({ description: 'Project name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Effort ID' })
  @IsUUID()
  effortId!: string;

  @ApiPropertyOptional({ description: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Status', default: 'not_started' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Order index', default: 0 })
  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}

export class UpdateFlowProjectDto {
  @ApiPropertyOptional({ description: 'Project name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Order index' })
  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}

export class CreateTaskDto {
  @ApiProperty({ description: 'Task title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Project ID' })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({ description: 'Task description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Status', default: 'pending' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Order index', default: 0 })
  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Documentation URL' })
  @IsOptional()
  @IsString()
  documentationUrl?: string;

  @ApiPropertyOptional({ description: 'Is milestone', default: false })
  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ description: 'Task title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Task description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Order index' })
  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Documentation URL' })
  @IsOptional()
  @IsString()
  documentationUrl?: string;

  @ApiPropertyOptional({ description: 'Is milestone' })
  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;
}

export class CreateSprintDto {
  @ApiProperty({ description: 'Sprint name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Sprint description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Is active', default: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSprintDto {
  @ApiPropertyOptional({ description: 'Sprint name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Sprint description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ============================================================================
// Response DTOs
// ============================================================================

export interface EffortResponseDto {
  id: string;
  teamId?: string | null;
  name: string;
  description?: string | null;
  status: string;
  orderIndex: number;
  icon?: string | null;
  color?: string | null;
  estimatedDays?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectResponseDto {
  id: string;
  effortId: string;
  name: string;
  description?: string | null;
  status: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskResponseDto {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: string;
  orderIndex: number;
  documentationUrl?: string | null;
  isMilestone: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SprintResponseDto {
  id: string;
  teamId?: string | null;
  name: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Shared Tasks (Kanban Tasks)
// ============================================================================

export enum SharedTaskStatus {
  PROJECTS = 'projects',
  THIS_WEEK = 'this_week',
  TODAY = 'today',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

export class CreateSharedTaskDto {
  @ApiProperty({ description: 'Task title' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({
    description: 'Task status',
    enum: SharedTaskStatus,
    default: SharedTaskStatus.IN_PROGRESS,
  })
  @IsOptional()
  @IsEnum(SharedTaskStatus)
  status?: SharedTaskStatus = SharedTaskStatus.IN_PROGRESS;

  @ApiPropertyOptional({ description: 'User ID assigned to task' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Assigned to (text)' })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Sprint ID' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @ApiPropertyOptional({ description: 'Due date' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Team ID' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Parent task ID' })
  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @ApiPropertyOptional({ description: 'Task description (full spec)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Channel ID for conversation traceability',
  })
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiPropertyOptional({
    description: 'Source channel user ID (mobile user who initiated this task)',
  })
  @IsOptional()
  @IsUUID()
  sourceChannelUserId?: string;
}

export class UpdateSharedTaskDto {
  @ApiPropertyOptional({ description: 'Task title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Task status', enum: SharedTaskStatus })
  @IsOptional()
  @IsEnum(SharedTaskStatus)
  status?: SharedTaskStatus;

  @ApiPropertyOptional({ description: 'Is completed' })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ description: 'User ID assigned to task' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Assigned to (text)' })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Sprint ID' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @ApiPropertyOptional({ description: 'Due date' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Pomodoro count' })
  @IsOptional()
  @IsNumber()
  pomodoroCount?: number;

  @ApiPropertyOptional({ description: 'Task description (full spec)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Channel ID for conversation traceability',
  })
  @IsOptional()
  @IsUUID()
  channelId?: string;
}

export class SharedTaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  isCompleted!: boolean;

  @ApiProperty({ nullable: true })
  assignedTo!: string | null;

  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty({ enum: SharedTaskStatus })
  status!: SharedTaskStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ nullable: true })
  parentTaskId!: string | null;

  @ApiProperty()
  pomodoroCount!: number;

  @ApiProperty({ nullable: true })
  projectId!: string | null;

  @ApiProperty({ nullable: true })
  sprintId!: string | null;

  @ApiProperty({ nullable: true })
  dueDate!: string | null;

  @ApiProperty({ nullable: true })
  teamId!: string | null;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true })
  channelId!: string | null;

  @ApiProperty({ nullable: true })
  sourceChannelUserId!: string | null;
}

// ============================================================================
// Notifications
// ============================================================================

export class CreateNotificationDto {
  @ApiPropertyOptional({ description: 'User ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Guest name' })
  @IsOptional()
  @IsString()
  guestName?: string;

  @ApiProperty({ description: 'Notification type' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: 'Task ID' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiProperty({ description: 'Message' })
  @IsString()
  message!: string;
}

export class NotificationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty({ nullable: true })
  guestName!: string | null;

  @ApiProperty()
  type!: string;

  @ApiProperty({ nullable: true })
  taskId!: string | null;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  isRead!: boolean;

  @ApiProperty()
  createdAt!: string;
}

// ============================================================================
// Timer State
// ============================================================================

export class CreateTimerStateDto {
  @ApiPropertyOptional({ description: 'Team ID' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiProperty({ description: 'Duration in seconds' })
  @IsNumber()
  durationSeconds!: number;

  @ApiPropertyOptional({ description: 'Is running', default: false })
  @IsOptional()
  @IsBoolean()
  isRunning?: boolean = false;

  @ApiPropertyOptional({ description: 'Is break', default: false })
  @IsOptional()
  @IsBoolean()
  isBreak?: boolean = false;
}

export class UpdateTimerStateDto {
  @ApiPropertyOptional({ description: 'End time (ISO string)' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Is running' })
  @IsOptional()
  @IsBoolean()
  isRunning?: boolean;

  @ApiPropertyOptional({ description: 'Is break' })
  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  durationSeconds?: number;
}

export class TimerStateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  teamId!: string | null;

  @ApiProperty({ nullable: true })
  endTime!: string | null;

  @ApiProperty()
  isRunning!: boolean;

  @ApiProperty()
  isBreak!: boolean;

  @ApiProperty()
  durationSeconds!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

// ============================================================================
// Profiles
// ============================================================================

export class ProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

// ============================================================================
// Task Collaboration
// ============================================================================

export class CreateTaskCollaboratorDto {
  @ApiProperty({ description: 'Task ID' })
  @IsUUID()
  taskId!: string;

  @ApiPropertyOptional({ description: 'User ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Guest name' })
  @IsOptional()
  @IsString()
  guestName?: string;
}

export class TaskCollaboratorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  taskId!: string;

  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty({ nullable: true })
  guestName!: string | null;

  @ApiProperty()
  joinedAt!: string;
}

export class CreateTaskWatcherDto {
  @ApiProperty({ description: 'Task ID' })
  @IsUUID()
  taskId!: string;

  @ApiPropertyOptional({ description: 'User ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Guest name' })
  @IsOptional()
  @IsString()
  guestName?: string;
}

export class TaskWatcherResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  taskId!: string;

  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty({ nullable: true })
  guestName!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class CreateTaskUpdateRequestDto {
  @ApiProperty({ description: 'Task ID' })
  @IsUUID()
  taskId!: string;

  @ApiPropertyOptional({ description: 'Requested by user ID' })
  @IsOptional()
  @IsUUID()
  requestedByUserId?: string;

  @ApiPropertyOptional({ description: 'Requested by guest' })
  @IsOptional()
  @IsString()
  requestedByGuest?: string;

  @ApiPropertyOptional({ description: 'Message' })
  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateTaskUpdateRequestDto {
  @ApiPropertyOptional({ description: 'Is resolved' })
  @IsOptional()
  @IsBoolean()
  isResolved?: boolean;

  @ApiPropertyOptional({ description: 'Message' })
  @IsOptional()
  @IsString()
  message?: string;
}

export class TaskUpdateRequestResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  taskId!: string;

  @ApiProperty({ nullable: true })
  requestedByUserId!: string | null;

  @ApiProperty({ nullable: true })
  requestedByGuest!: string | null;

  @ApiProperty({ nullable: true })
  message!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  isResolved!: boolean;
}

// ============================================================================
// Claude Task Planning
// ============================================================================

export class PlanClaudeTaskDto {
  @ApiProperty({
    description: 'Freeform description of what the user wants done',
  })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Project ID to associate tasks with' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Sprint ID to associate tasks with' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;
}

export class PlanClaudeTaskResponseDto {
  @ApiProperty({ type: SharedTaskResponseDto })
  parentTask!: SharedTaskResponseDto;

  @ApiProperty({ type: [SharedTaskResponseDto] })
  subtasks!: SharedTaskResponseDto[];
}

// ============================================================================
// Channels
// ============================================================================

export class CreateChannelDto {
  @ApiProperty({ description: 'Channel name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Team ID' })
  @IsUUID()
  teamId!: string;
}

export class UpdateChannelDto {
  @ApiPropertyOptional({ description: 'Channel name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ChannelResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  teamId!: string;

  @ApiProperty({ nullable: true })
  createdByUserId!: string | null;

  @ApiProperty({ nullable: true })
  createdByGuest!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class CreateChannelMessageDto {
  @ApiProperty({ description: 'Channel ID' })
  @IsUUID()
  channelId!: string;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: 'User ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Guest name' })
  @IsOptional()
  @IsString()
  guestName?: string;
}

export class ChannelMessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  channelId!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty({ nullable: true })
  guestName!: string | null;

  @ApiProperty()
  createdAt!: string;
}

// ============================================================================
// Journey Templates
// ============================================================================

export class JourneyTemplateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true })
  icon!: string | null;

  @ApiProperty()
  templateData!: Record<string, unknown>;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;
}

// ============================================================================
// Learning Progress
// ============================================================================

export class CreateLearningProgressDto {
  @ApiProperty({ description: 'Organization slug' })
  @IsString()
  organizationSlug!: string;

  @ApiProperty({ description: 'Milestone key' })
  @IsString()
  milestoneKey!: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Completed at (ISO string)' })
  @IsOptional()
  @IsString()
  completedAt?: string;
}

export class UpdateLearningProgressDto {
  @ApiPropertyOptional({ description: 'Completed at (ISO string)' })
  @IsOptional()
  @IsString()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class LearningProgressResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  organizationSlug!: string;

  @ApiProperty()
  milestoneKey!: string;

  @ApiProperty({ nullable: true })
  completedAt!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: string;
}

// ============================================================================
// Team Files (Documents)
// ============================================================================

export class CreateTeamFileDto {
  @ApiProperty({ description: 'File or folder name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Parent folder ID (null for root)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ description: 'Is this a folder?', default: false })
  @IsBoolean()
  isFolder!: boolean;

  @ApiPropertyOptional({ description: 'File content (null for folders)' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'File type', default: 'markdown' })
  @IsOptional()
  @IsString()
  fileType?: string;
}

export class UpdateTeamFileDto {
  @ApiPropertyOptional({ description: 'File name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Parent folder ID' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: 'File content' })
  @IsOptional()
  @IsString()
  content?: string;
}

export class TeamFileResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty({ nullable: true }) parentId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() isFolder!: boolean;
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty() fileType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true }) createdByUserId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
