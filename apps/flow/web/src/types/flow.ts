// ============================================================================
// Flow Types — mirrors Flow API response shapes
// ============================================================================

export interface ApiTeam {
  id: string;
  orgSlug: string;
  name: string;
  description?: string;
  memberCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTeamMember {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  role: 'member' | 'lead' | 'admin';
  joinedAt: string;
}

export interface UserContext {
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
  organizations: UserOrganization[];
  teams: UserTeam[];
}

export interface UserOrganization {
  slug: string;
  name: string;
  role: string;
  isGlobal: boolean;
}

export interface UserTeam {
  id: string;
  name: string;
  description?: string;
  orgSlug: string;
  role: string;
  joinedAt: string;
}

export interface EffortResponse {
  id: string;
  teamId?: string | null;
  name: string;
  description?: string | null;
  status: string;
  orderIndex: number;
  icon?: string | null;
  color?: string | null;
  estimatedDays?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectResponse {
  id: string;
  effortId: string;
  name: string;
  description?: string | null;
  status: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskResponse {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: string;
  orderIndex: number;
  documentationUrl?: string | null;
  isMilestone: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SprintResponse {
  id: string;
  teamId?: string | null;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SharedTaskStatus = 'projects' | 'this_week' | 'today' | 'in_progress' | 'done';

export interface SharedTaskResponseDto {
  id: string;
  title: string;
  isCompleted: boolean;
  assignedTo: string | null;
  userId: string | null;
  status: SharedTaskStatus;
  createdAt: string;
  parentTaskId: string | null;
  pomodoroCount: number;
  projectId: string | null;
  sprintId: string | null;
  dueDate: string | null;
  teamId: string | null;
  description?: string | null;
}

export interface CreateSharedTaskDto {
  title: string;
  status?: SharedTaskStatus;
  userId?: string;
  assignedTo?: string;
  projectId?: string;
  sprintId?: string;
  dueDate?: string;
  teamId?: string;
  parentTaskId?: string;
}

export interface UpdateSharedTaskDto {
  title?: string;
  status?: SharedTaskStatus;
  isCompleted?: boolean;
  userId?: string | null;
  assignedTo?: string | null;
  projectId?: string | null;
  sprintId?: string | null;
  dueDate?: string;
  pomodoroCount?: number;
  description?: string | null;
}

export interface TeamFileResponse {
  id: string;
  teamId: string;
  parentId: string | null;
  name: string;
  isFolder: boolean;
  content: string | null;
  fileType: string;
  sizeBytes: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamFileDto {
  name: string;
  parentId?: string;
  isFolder: boolean;
  content?: string;
  fileType?: string;
}

export interface UpdateTeamFileDto {
  name?: string;
  parentId?: string;
  content?: string;
}

export interface NotificationResponseDto {
  id: string;
  userId: string | null;
  guestName: string | null;
  type: string;
  taskId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ProfileResponseDto {
  id: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  token: string | null;
  user: {
    id: string;
    email: string;
    displayName?: string;
  } | null;
}

// ============================================================================
// Timer State
// ============================================================================

export interface TimerStateResponseDto {
  id: string;
  teamId: string | null;
  endTime: string | null;
  isRunning: boolean;
  isBreak: boolean;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTimerStateDto {
  teamId?: string;
  durationSeconds: number;
  isRunning?: boolean;
  isBreak?: boolean;
}

export interface UpdateTimerStateDto {
  endTime?: string;
  isRunning?: boolean;
  isBreak?: boolean;
  durationSeconds?: number;
}

// ============================================================================
// Task Collaboration
// ============================================================================

export interface TaskCollaboratorResponse {
  id: string;
  taskId: string;
  userId: string | null;
  guestName: string | null;
  joinedAt: string;
}

export interface CreateTaskCollaboratorDto {
  userId: string | null;
  guestName: string | null;
}

export interface TaskWatcherResponse {
  id: string;
  taskId: string;
  userId: string | null;
  guestName: string | null;
  createdAt: string;
}

export interface CreateTaskWatcherDto {
  userId: string | null;
  guestName: string | null;
}

export interface TaskUpdateRequestResponse {
  id: string;
  taskId: string;
  requestedByUserId: string | null;
  requestedByGuest: string | null;
  message: string | null;
  createdAt: string;
  isResolved: boolean;
}

export interface CreateTaskUpdateRequestDto {
  requestedByUserId: string | null;
  requestedByGuest: string | null;
  message: string | null;
}

export interface UpdateTaskUpdateRequestDto {
  isResolved?: boolean;
}

// ============================================================================
// Channels / Messaging
// ============================================================================

export interface ChannelResponse {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string | null;
  createdByGuest: string | null;
  createdAt: string;
}

export interface CreateChannelDto {
  name: string;
  description?: string | null;
}

export interface ChannelMessageResponse {
  id: string;
  channelId: string;
  content: string;
  userId: string | null;
  guestName: string | null;
  createdAt: string;
}

export interface CreateChannelMessageDto {
  content: string;
  userId: string | null;
  guestName: string | null;
}

// ============================================================================
// Notifications (extended)
// ============================================================================

export interface CreateNotificationDto {
  userId?: string;
  guestName?: string;
  type: string;
  taskId?: string;
  message: string;
}

// ============================================================================
// Journey Templates
// ============================================================================

export interface JourneyTemplateResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  templateData: {
    efforts: Array<{
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      estimated_days?: number;
      projects: Array<{
        name: string;
        description?: string;
        tasks: Array<{
          title: string;
          description?: string;
          documentation_url?: string;
          is_milestone?: boolean;
        }>;
      }>;
    }>;
  };
  isActive: boolean;
  createdAt: string;
}

// ============================================================================
// Learning Progress
// ============================================================================

export interface LearningProgressResponse {
  id: string;
  userId: string;
  organizationSlug: string;
  milestoneKey: string;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateOrUpdateLearningProgressDto {
  organizationSlug: string;
  milestoneKey: string;
  completedAt?: string;
  notes?: string;
}
