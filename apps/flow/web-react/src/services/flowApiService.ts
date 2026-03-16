/**
 * Flow API Service
 *
 * API client for Flow operations (efforts, projects, tasks, sprints).
 * Connects to /teams/:teamId/efforts, /projects, /tasks, /sprints endpoints.
 * Uses API authentication (token from localStorage) instead of direct Supabase calls.
 */
import { getMainApiUrl } from '@/config/api-config';

// Types matching the API responses
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

class FlowApiService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = getMainApiUrl();
  }

  /**
   * Get the current auth token from localStorage (auth store)
   */
  private getAuthToken(): string | null {
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (!authStorage) {
        return null;
      }
      const { state } = JSON.parse(authStorage);
      return state?.token || null;
    } catch (error) {
      console.error('Error reading auth token from storage:', error);
      return null;
    }
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      let errorDetails: Record<string, unknown> = {};

      try {
        const text = await response.text();
        if (text) {
          try {
            const error = JSON.parse(text);
            errorMessage = error.message || error.error || errorMessage;
            errorDetails = error;
          } catch {
            // Not JSON, use text as error message
            errorMessage = text;
          }
        }
      } catch {
        // Ignore parsing errors
      }

      const error = new Error(errorMessage) as Error & { status?: number; details?: Record<string, unknown> };
      error.status = response.status;
      error.details = errorDetails;
      throw error;
    }

    // Handle empty responses (e.g., 204 No Content or null responses)
    const contentType = response.headers.get('content-type');
    const text = await response.text();
    
    // If no content or empty text, return null for nullable types
    if (!text || response.status === 204) {
      return null as T;
    }
    
    // If content-type is not JSON, return text as-is
    if (!contentType || !contentType.includes('application/json')) {
      return text as T;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      // If parsing fails but we have text, it might be a string response
      if (text) {
        return text as T;
      }
      throw new Error(`Failed to parse response: ${error}`);
    }
  }

  // ============================================================================
  // Efforts
  // ============================================================================

  async getEfforts(teamId: string): Promise<EffortResponse[]> {
    return this.request<EffortResponse[]>(`/teams/${teamId}/efforts`);
  }

  async createEffort(teamId: string, effort: {
    name: string;
    description?: string;
    status?: string;
    orderIndex?: number;
    icon?: string;
    color?: string;
    estimatedDays?: number;
  }): Promise<EffortResponse> {
    return this.request<EffortResponse>(`/teams/${teamId}/efforts`, {
      method: 'POST',
      body: JSON.stringify(effort),
    });
  }

  async updateEffort(teamId: string, effortId: string, updates: {
    name?: string;
    description?: string;
    status?: string;
    orderIndex?: number;
    icon?: string;
    color?: string;
    estimatedDays?: number;
  }): Promise<EffortResponse> {
    return this.request<EffortResponse>(`/teams/${teamId}/efforts/${effortId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteEffort(teamId: string, effortId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/efforts/${effortId}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Projects
  // ============================================================================

  async getProjects(teamId: string, effortId?: string): Promise<ProjectResponse[]> {
    const query = effortId ? `?effortId=${effortId}` : '';
    return this.request<ProjectResponse[]>(`/teams/${teamId}/projects${query}`);
  }

  async createProject(teamId: string, project: {
    name: string;
    effortId: string;
    description?: string;
    status?: string;
    orderIndex?: number;
  }): Promise<ProjectResponse> {
    return this.request<ProjectResponse>(`/teams/${teamId}/projects`, {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  async updateProject(teamId: string, projectId: string, updates: {
    name?: string;
    description?: string;
    status?: string;
    orderIndex?: number;
  }): Promise<ProjectResponse> {
    return this.request<ProjectResponse>(`/teams/${teamId}/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteProject(teamId: string, projectId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Tasks
  // ============================================================================

  async getTasks(teamId: string, projectId?: string): Promise<TaskResponse[]> {
    const query = projectId ? `?projectId=${projectId}` : '';
    return this.request<TaskResponse[]>(`/teams/${teamId}/tasks${query}`);
  }

  async createTask(teamId: string, task: {
    title: string;
    projectId: string;
    description?: string;
    status?: string;
    orderIndex?: number;
    documentationUrl?: string;
    isMilestone?: boolean;
  }): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/teams/${teamId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(teamId: string, taskId: string, updates: {
    title?: string;
    description?: string;
    status?: string;
    orderIndex?: number;
    documentationUrl?: string;
    isMilestone?: boolean;
  }): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/teams/${teamId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTask(teamId: string, taskId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Sprints
  // ============================================================================

  async getSprints(teamId: string): Promise<SprintResponse[]> {
    return this.request<SprintResponse[]>(`/teams/${teamId}/sprints`);
  }

  async createSprint(teamId: string, sprint: {
    name: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
  }): Promise<SprintResponse> {
    return this.request<SprintResponse>(`/teams/${teamId}/sprints`, {
      method: 'POST',
      body: JSON.stringify(sprint),
    });
  }

  async updateSprint(teamId: string, sprintId: string, updates: {
    name?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
  }): Promise<SprintResponse> {
    return this.request<SprintResponse>(`/teams/${teamId}/sprints/${sprintId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteSprint(teamId: string, sprintId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/sprints/${sprintId}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Shared Tasks (Kanban Tasks)
  // ============================================================================

  async getSharedTasks(
    teamId: string,
    userIdFilter?: string,
    includeCollaborated?: boolean,
    projectId?: string | null,
  ): Promise<SharedTaskResponseDto[]> {
    const params = new URLSearchParams();
    if (userIdFilter) params.append('userId', userIdFilter);
    if (includeCollaborated) params.append('includeCollaborated', 'true');
    if (projectId) params.append('projectId', projectId);
    const query = params.toString();
    return this.request<SharedTaskResponseDto[]>(`/teams/${teamId}/shared-tasks${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  }

  async createSharedTask(teamId: string, dto: CreateSharedTaskDto): Promise<SharedTaskResponseDto> {
    return this.request<SharedTaskResponseDto>(`/teams/${teamId}/shared-tasks`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateSharedTask(teamId: string, taskId: string, dto: UpdateSharedTaskDto): Promise<SharedTaskResponseDto> {
    return this.request<SharedTaskResponseDto>(`/teams/${teamId}/shared-tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async deleteSharedTask(teamId: string, taskId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/shared-tasks/${taskId}`, {
      method: 'DELETE',
    });
  }

  async planClaudeTask(teamId: string, dto: {
    description: string;
    projectId?: string;
    sprintId?: string;
  }): Promise<{ parentTask: SharedTaskResponseDto; subtasks: SharedTaskResponseDto[] }> {
    return this.request<{ parentTask: SharedTaskResponseDto; subtasks: SharedTaskResponseDto[] }>(
      `/teams/${teamId}/shared-tasks/plan`,
      {
        method: 'POST',
        body: JSON.stringify(dto),
      },
    );
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  async getNotifications(teamId: string, guestName?: string): Promise<NotificationResponseDto[]> {
    const params = new URLSearchParams();
    if (guestName) params.append('guestName', guestName);
    const query = params.toString();
    return this.request<NotificationResponseDto[]>(`/teams/${teamId}/notifications${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  }

  async createNotification(teamId: string, dto: CreateNotificationDto): Promise<NotificationResponseDto> {
    return this.request<NotificationResponseDto>(`/teams/${teamId}/notifications`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async markNotificationsRead(teamId: string, notificationIds: string[], guestName?: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/notifications/mark-read`, {
      method: 'PUT',
      body: JSON.stringify({ notificationIds, guestName }),
    });
  }

  // ============================================================================
  // Timer State
  // ============================================================================

  async getTimerState(teamId: string): Promise<TimerStateResponseDto | null> {
    return this.request<TimerStateResponseDto | null>(`/teams/${teamId}/timer-state`, {
      method: 'GET',
    });
  }

  async createTimerState(teamId: string, dto: CreateTimerStateDto): Promise<TimerStateResponseDto> {
    return this.request<TimerStateResponseDto>(`/teams/${teamId}/timer-state`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateTimerState(teamId: string, timerId: string, dto: UpdateTimerStateDto): Promise<TimerStateResponseDto> {
    return this.request<TimerStateResponseDto>(`/teams/${teamId}/timer-state/${timerId}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  // ============================================================================
  // Profiles
  // ============================================================================

  async getProfiles(userIds?: string[]): Promise<ProfileResponseDto[]> {
    const params = new URLSearchParams();
    if (userIds && userIds.length > 0) {
      params.append('userIds', userIds.join(','));
    }
    const query = params.toString();
    return this.request<ProfileResponseDto[]>(`/flow/profiles${query ? `?${query}` : ''}`);
  }

  async getProfile(userId: string): Promise<ProfileResponseDto | null> {
    return this.request<ProfileResponseDto | null>(`/flow/profiles/${userId}`);
  }

  // ============================================================================
  // Task Collaboration
  // ============================================================================

  async getTaskCollaborators(teamId: string, taskId: string): Promise<TaskCollaboratorResponse[]> {
    return this.request<TaskCollaboratorResponse[]>(`/teams/${teamId}/tasks/${taskId}/collaborators`);
  }

  async createTaskCollaborator(teamId: string, taskId: string, dto: CreateTaskCollaboratorDto): Promise<TaskCollaboratorResponse> {
    return this.request<TaskCollaboratorResponse>(`/teams/${teamId}/tasks/${taskId}/collaborators`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async deleteTaskCollaborator(teamId: string, collaboratorId: string): Promise<void> {
    return this.request<void>(`/teams/${teamId}/tasks/collaborators/${collaboratorId}`, {
      method: 'DELETE',
    });
  }

  async getTaskWatchers(teamId: string, taskId: string): Promise<TaskWatcherResponse[]> {
    return this.request<TaskWatcherResponse[]>(`/teams/${teamId}/tasks/${taskId}/watchers`);
  }

  async createTaskWatcher(teamId: string, taskId: string, dto: CreateTaskWatcherDto): Promise<TaskWatcherResponse> {
    return this.request<TaskWatcherResponse>(`/teams/${teamId}/tasks/${taskId}/watchers`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async deleteTaskWatcher(teamId: string, watcherId: string): Promise<void> {
    return this.request<void>(`/teams/${teamId}/tasks/watchers/${watcherId}`, {
      method: 'DELETE',
    });
  }

  async getTaskUpdateRequests(teamId: string, taskId: string): Promise<TaskUpdateRequestResponse[]> {
    return this.request<TaskUpdateRequestResponse[]>(`/teams/${teamId}/tasks/${taskId}/update-requests`);
  }

  async createTaskUpdateRequest(teamId: string, taskId: string, dto: CreateTaskUpdateRequestDto): Promise<TaskUpdateRequestResponse> {
    return this.request<TaskUpdateRequestResponse>(`/teams/${teamId}/tasks/${taskId}/update-requests`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateTaskUpdateRequest(teamId: string, requestId: string, dto: UpdateTaskUpdateRequestDto): Promise<TaskUpdateRequestResponse> {
    return this.request<TaskUpdateRequestResponse>(`/teams/${teamId}/tasks/update-requests/${requestId}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  // ============================================================================
  // Channels
  // ============================================================================

  async getChannels(teamId: string): Promise<ChannelResponse[]> {
    return this.request<ChannelResponse[]>(`/teams/${teamId}/channels`);
  }

  async createChannel(teamId: string, dto: CreateChannelDto): Promise<ChannelResponse> {
    return this.request<ChannelResponse>(`/teams/${teamId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ ...dto, teamId }),
    });
  }

  async deleteChannel(teamId: string, channelId: string): Promise<void> {
    return this.request<void>(`/teams/${teamId}/channels/${channelId}`, {
      method: 'DELETE',
    });
  }

  async getChannelMessages(teamId: string, channelId: string): Promise<ChannelMessageResponse[]> {
    return this.request<ChannelMessageResponse[]>(`/teams/${teamId}/channels/${channelId}/messages`);
  }

  async createChannelMessage(teamId: string, channelId: string, dto: CreateChannelMessageDto): Promise<ChannelMessageResponse> {
    return this.request<ChannelMessageResponse>(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  // ============================================================================
  // Journey Templates
  // ============================================================================

  async getJourneyTemplates(): Promise<JourneyTemplateResponse[]> {
    return this.request<JourneyTemplateResponse[]>(`/flow/journey-templates`);
  }

  async getJourneyTemplateBySlug(slug: string): Promise<JourneyTemplateResponse> {
    return this.request<JourneyTemplateResponse>(`/flow/journey-templates/${slug}`);
  }

  // ============================================================================
  // Learning Progress
  // ============================================================================

  async getLearningProgress(): Promise<LearningProgressResponse[]> {
    return this.request<LearningProgressResponse[]>(`/flow/learning-progress`);
  }

  async createOrUpdateLearningProgress(dto: CreateOrUpdateLearningProgressDto): Promise<LearningProgressResponse> {
    return this.request<LearningProgressResponse>(`/flow/learning-progress`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  // ============================================================================
  // Global Presence
  // ============================================================================

  async sendHeartbeat(): Promise<void> {
    await this.request<void>(`/flow/heartbeat`, { method: 'POST' });
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.request<string[]>(`/flow/online`);
  }

  // ============================================================================
  // Global Timer
  // ============================================================================

  async getGlobalTimerState(): Promise<TimerStateResponseDto | null> {
    return this.request<TimerStateResponseDto | null>(`/flow/global-timer`);
  }

  async createGlobalTimerState(dto: CreateTimerStateDto): Promise<TimerStateResponseDto> {
    return this.request<TimerStateResponseDto>(`/flow/global-timer`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateGlobalTimerState(timerId: string, dto: UpdateTimerStateDto): Promise<TimerStateResponseDto> {
    return this.request<TimerStateResponseDto>(`/flow/global-timer/${timerId}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  // ============================================================================
  // Personal Cross-Team Tasks
  // ============================================================================

  async getMyTasks(statuses?: string[]): Promise<SharedTaskResponseDto[]> {
    const params = new URLSearchParams();
    if (statuses && statuses.length > 0) {
      params.append('statuses', statuses.join(','));
    }
    const query = params.toString();
    return this.request<SharedTaskResponseDto[]>(`/flow/my-tasks${query ? `?${query}` : ''}`);
  }

  // ============================================================================
  // Team Files (Documents)
  // ============================================================================

  async getTeamFiles(teamId: string): Promise<TeamFileResponse[]> {
    return this.request<TeamFileResponse[]>(`/teams/${teamId}/files`);
  }

  async getTeamFile(teamId: string, fileId: string): Promise<TeamFileResponse> {
    return this.request<TeamFileResponse>(`/teams/${teamId}/files/${fileId}`);
  }

  async createTeamFile(teamId: string, dto: CreateTeamFileDto): Promise<TeamFileResponse> {
    return this.request<TeamFileResponse>(`/teams/${teamId}/files`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateTeamFile(teamId: string, fileId: string, dto: UpdateTeamFileDto): Promise<TeamFileResponse> {
    return this.request<TeamFileResponse>(`/teams/${teamId}/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async deleteTeamFile(teamId: string, fileId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/files/${fileId}`, {
      method: 'DELETE',
    });
  }
}

// ============================================================================
// Type definitions for new endpoints
// ============================================================================

export enum SharedTaskStatus {
  PROJECTS = 'projects',
  THIS_WEEK = 'this_week',
  TODAY = 'today',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
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
  projectId?: string;
  sprintId?: string | null;
  dueDate?: string;
  pomodoroCount?: number;
}

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

export interface CreateNotificationDto {
  userId?: string;
  guestName?: string;
  type: string;
  taskId?: string;
  message: string;
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

export interface ProfileResponseDto {
  id: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Task Collaboration DTOs
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

// Channel DTOs
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

// Journey Template DTOs
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

// Learning Progress DTOs
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

// Team Files DTOs
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

export const flowApiService = new FlowApiService();
