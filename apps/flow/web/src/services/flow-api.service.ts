/**
 * Flow API Service
 *
 * HTTP client for all Flow API calls (port 6900).
 * Reads auth token from the shared 'authToken' localStorage key — the same
 * key that Command writes after login, enabling SSO across all products.
 * Falls back to the shared 'orch_auth_token' cookie for cross-port SSO.
 * All requests go to /api/* which Vite proxies to localhost:6900.
 */

import type {
  ApiTeam,
  ApiTeamMember,
  UserContext,
  EffortResponse,
  ProjectResponse,
  TaskResponse,
  SprintResponse,
  SharedTaskResponseDto,
  CreateSharedTaskDto,
  UpdateSharedTaskDto,
  TeamFileResponse,
  CreateTeamFileDto,
  UpdateTeamFileDto,
  NotificationResponseDto,
  CreateNotificationDto,
  ProfileResponseDto,
  TimerStateResponseDto,
  CreateTimerStateDto,
  UpdateTimerStateDto,
  TaskCollaboratorResponse,
  CreateTaskCollaboratorDto,
  TaskWatcherResponse,
  CreateTaskWatcherDto,
  TaskUpdateRequestResponse,
  CreateTaskUpdateRequestDto,
  UpdateTaskUpdateRequestDto,
  ChannelResponse,
  CreateChannelDto,
  ChannelMessageResponse,
  CreateChannelMessageDto,
  JourneyTemplateResponse,
  LearningProgressResponse,
  CreateOrUpdateLearningProgressDto,
} from '@/types/flow';

class FlowApiService {
  private readonly baseUrl = '/api';

  private getAuthToken(): string | null {
    // Primary: shared localStorage key written by Command after login
    const fromStorage = localStorage.getItem('authToken');
    if (fromStorage) return fromStorage;
    // Secondary: shared cookie for cross-port SSO on localhost
    const match = document.cookie.match(/(?:^|; )orch_auth_token=([^;]*)/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      // Persist into localStorage so subsequent reads are synchronous
      localStorage.setItem('authToken', token);
      return token;
    }
    return null;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let message = `API error: ${response.status}`;
      try {
        const text = await response.text();
        if (text) {
          try {
            const err = JSON.parse(text);
            message = err.message || err.error || message;
          } catch {
            message = text;
          }
        }
      } catch { /* ignore */ }
      const err = new Error(message) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    if (response.status === 204) return null as T;
    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  }

  // ============================================================================
  // Auth / User Context
  // ============================================================================

  async getUserContext(): Promise<UserContext> {
    return this.request<UserContext>('/users/me/context');
  }

  // ============================================================================
  // Teams
  // ============================================================================

  async getTeamsByOrg(orgSlug: string): Promise<ApiTeam[]> {
    return this.request<ApiTeam[]>(`/orgs/${orgSlug}/teams`);
  }

  async createTeam(orgSlug: string, name: string, description?: string): Promise<ApiTeam> {
    return this.request<ApiTeam>(`/orgs/${orgSlug}/teams`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async getTeam(teamId: string): Promise<ApiTeam> {
    return this.request<ApiTeam>(`/teams/${teamId}`);
  }

  async updateTeam(teamId: string, updates: { name?: string; description?: string }): Promise<ApiTeam> {
    return this.request<ApiTeam>(`/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}`, { method: 'DELETE' });
  }

  async getTeamMembers(teamId: string): Promise<ApiTeamMember[]> {
    return this.request<ApiTeamMember[]>(`/teams/${teamId}/members`);
  }

  async addTeamMember(teamId: string, userId: string, role: 'member' | 'lead' | 'admin' = 'member'): Promise<ApiTeamMember> {
    return this.request<ApiTeamMember>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  }

  async updateTeamMember(teamId: string, userId: string, updates: { role: 'member' | 'lead' | 'admin' }): Promise<ApiTeamMember> {
    return this.request<ApiTeamMember>(`/teams/${teamId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
  }

  // ============================================================================
  // Efforts
  // ============================================================================

  async getEfforts(teamId: string): Promise<EffortResponse[]> {
    return this.request<EffortResponse[]>(`/teams/${teamId}/efforts`);
  }

  async createEffort(teamId: string, effort: Partial<EffortResponse> & { name: string }): Promise<EffortResponse> {
    return this.request<EffortResponse>(`/teams/${teamId}/efforts`, {
      method: 'POST',
      body: JSON.stringify(effort),
    });
  }

  async updateEffort(teamId: string, effortId: string, updates: Partial<EffortResponse>): Promise<EffortResponse> {
    return this.request<EffortResponse>(`/teams/${teamId}/efforts/${effortId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteEffort(teamId: string, effortId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/efforts/${effortId}`, { method: 'DELETE' });
  }

  // ============================================================================
  // Projects
  // ============================================================================

  async getProjects(teamId: string, effortId?: string): Promise<ProjectResponse[]> {
    const q = effortId ? `?effortId=${effortId}` : '';
    return this.request<ProjectResponse[]>(`/teams/${teamId}/projects${q}`);
  }

  async createProject(teamId: string, project: Partial<ProjectResponse> & { name: string; effortId: string }): Promise<ProjectResponse> {
    return this.request<ProjectResponse>(`/teams/${teamId}/projects`, {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  async updateProject(teamId: string, projectId: string, updates: Partial<ProjectResponse>): Promise<ProjectResponse> {
    return this.request<ProjectResponse>(`/teams/${teamId}/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteProject(teamId: string, projectId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/projects/${projectId}`, { method: 'DELETE' });
  }

  // ============================================================================
  // Tasks (Hierarchy)
  // ============================================================================

  async getTasks(teamId: string, projectId?: string): Promise<TaskResponse[]> {
    const q = projectId ? `?projectId=${projectId}` : '';
    return this.request<TaskResponse[]>(`/teams/${teamId}/tasks${q}`);
  }

  async createTask(teamId: string, task: Partial<TaskResponse> & { title: string; projectId: string }): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/teams/${teamId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(teamId: string, taskId: string, updates: Partial<TaskResponse>): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/teams/${teamId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTask(teamId: string, taskId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/tasks/${taskId}`, { method: 'DELETE' });
  }

  // ============================================================================
  // Sprints
  // ============================================================================

  async getSprints(teamId: string): Promise<SprintResponse[]> {
    return this.request<SprintResponse[]>(`/teams/${teamId}/sprints`);
  }

  async createSprint(teamId: string, sprint: Partial<SprintResponse> & { name: string }): Promise<SprintResponse> {
    return this.request<SprintResponse>(`/teams/${teamId}/sprints`, {
      method: 'POST',
      body: JSON.stringify(sprint),
    });
  }

  async updateSprint(teamId: string, sprintId: string, updates: Partial<SprintResponse>): Promise<SprintResponse> {
    return this.request<SprintResponse>(`/teams/${teamId}/sprints/${sprintId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteSprint(teamId: string, sprintId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}/sprints/${sprintId}`, { method: 'DELETE' });
  }

  // ============================================================================
  // Shared Tasks (Kanban)
  // ============================================================================

  async getSharedTasks(
    teamId: string,
    opts?: { userId?: string; includeCollaborated?: boolean; projectId?: string },
  ): Promise<SharedTaskResponseDto[]> {
    const params = new URLSearchParams();
    if (opts?.userId) params.append('userId', opts.userId);
    if (opts?.includeCollaborated) params.append('includeCollaborated', 'true');
    if (opts?.projectId) params.append('projectId', opts.projectId);
    const q = params.toString();
    return this.request<SharedTaskResponseDto[]>(`/teams/${teamId}/shared-tasks${q ? `?${q}` : ''}`);
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
    await this.request<{ message: string }>(`/teams/${teamId}/shared-tasks/${taskId}`, { method: 'DELETE' });
  }

  async getMyTasks(statuses?: string[]): Promise<SharedTaskResponseDto[]> {
    const params = new URLSearchParams();
    if (statuses?.length) params.append('statuses', statuses.join(','));
    const q = params.toString();
    return this.request<SharedTaskResponseDto[]>(`/flow/my-tasks${q ? `?${q}` : ''}`);
  }

  // ============================================================================
  // Files
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
    await this.request<{ message: string }>(`/teams/${teamId}/files/${fileId}`, { method: 'DELETE' });
  }

  // ============================================================================
  // Profiles
  // ============================================================================

  async getProfile(userId: string): Promise<ProfileResponseDto | null> {
    return this.request<ProfileResponseDto | null>(`/flow/profiles/${userId}`);
  }

  async getProfiles(userIds?: string[]): Promise<ProfileResponseDto[]> {
    const params = new URLSearchParams();
    if (userIds?.length) params.append('userIds', userIds.join(','));
    const q = params.toString();
    return this.request<ProfileResponseDto[]>(`/flow/profiles${q ? `?${q}` : ''}`);
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  async getNotifications(teamId: string, guestName?: string): Promise<NotificationResponseDto[]> {
    const params = new URLSearchParams();
    if (guestName) params.append('guestName', guestName);
    const q = params.toString();
    return this.request<NotificationResponseDto[]>(`/teams/${teamId}/notifications${q ? `?${q}` : ''}`);
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
  // Presence
  // ============================================================================

  async sendHeartbeat(): Promise<void> {
    await this.request<void>('/flow/heartbeat', { method: 'POST' });
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.request<string[]>('/flow/online');
  }

  // ============================================================================
  // Timer State (Team)
  // ============================================================================

  async getTimerState(teamId: string): Promise<TimerStateResponseDto | null> {
    return this.request<TimerStateResponseDto | null>(`/teams/${teamId}/timer-state`);
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
  // Timer State (Global)
  // ============================================================================

  async getGlobalTimerState(): Promise<TimerStateResponseDto | null> {
    return this.request<TimerStateResponseDto | null>('/flow/global-timer');
  }

  async createGlobalTimerState(dto: CreateTimerStateDto): Promise<TimerStateResponseDto> {
    return this.request<TimerStateResponseDto>('/flow/global-timer', {
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
    await this.request<void>(`/teams/${teamId}/tasks/collaborators/${collaboratorId}`, {
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
    await this.request<void>(`/teams/${teamId}/tasks/watchers/${watcherId}`, {
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
  // Channels / Messaging
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
    await this.request<void>(`/teams/${teamId}/channels/${channelId}`, {
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
    return this.request<JourneyTemplateResponse[]>('/flow/journey-templates');
  }

  async getJourneyTemplateBySlug(slug: string): Promise<JourneyTemplateResponse> {
    return this.request<JourneyTemplateResponse>(`/flow/journey-templates/${slug}`);
  }

  // ============================================================================
  // Learning Progress
  // ============================================================================

  async getLearningProgress(): Promise<LearningProgressResponse[]> {
    return this.request<LearningProgressResponse[]>('/flow/learning-progress');
  }

  async createOrUpdateLearningProgress(dto: CreateOrUpdateLearningProgressDto): Promise<LearningProgressResponse> {
    return this.request<LearningProgressResponse>('/flow/learning-progress', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }
}

export const flowApiService = new FlowApiService();
