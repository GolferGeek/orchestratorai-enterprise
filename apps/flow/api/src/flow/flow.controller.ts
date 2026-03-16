import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FlowService } from './flow.service';
import {
  CreateEffortDto,
  UpdateEffortDto,
  CreateFlowProjectDto,
  UpdateFlowProjectDto,
  CreateTaskDto,
  UpdateTaskDto,
  CreateSprintDto,
  UpdateSprintDto,
  EffortResponseDto,
  ProjectResponseDto,
  TaskResponseDto,
  SprintResponseDto,
  CreateSharedTaskDto,
  UpdateSharedTaskDto,
  SharedTaskResponseDto,
  CreateNotificationDto,
  NotificationResponseDto,
  CreateTimerStateDto,
  UpdateTimerStateDto,
  TimerStateResponseDto,
  ProfileResponseDto,
  CreateTaskCollaboratorDto,
  TaskCollaboratorResponseDto,
  CreateTaskWatcherDto,
  TaskWatcherResponseDto,
  CreateTaskUpdateRequestDto,
  UpdateTaskUpdateRequestDto,
  TaskUpdateRequestResponseDto,
  CreateChannelDto,
  ChannelResponseDto,
  CreateChannelMessageDto,
  ChannelMessageResponseDto,
  JourneyTemplateResponseDto,
  CreateLearningProgressDto,
  UpdateLearningProgressDto,
  LearningProgressResponseDto,
  CreateTeamFileDto,
  UpdateTeamFileDto,
  TeamFileResponseDto,
} from './flow.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('Flow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId')
export class FlowController {
  constructor(private readonly flowService: FlowService) {}

  // ============================================================================
  // Efforts
  // ============================================================================

  @Get('efforts')
  @ApiOperation({
    summary: 'Get efforts for a team',
    description: 'Returns all efforts for the specified team',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Efforts retrieved successfully',
  })
  async getEfforts(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<EffortResponseDto[]> {
    return this.flowService.getEfforts(teamId, req.user.id);
  }

  @Post('efforts')
  @ApiOperation({
    summary: 'Create effort',
    description: 'Creates a new effort for the team',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Effort created successfully',
  })
  async createEffort(
    @Param('teamId') teamId: string,
    @Body() dto: CreateEffortDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EffortResponseDto> {
    return this.flowService.createEffort(teamId, req.user.id, dto);
  }

  @Put('efforts/:effortId')
  @ApiOperation({
    summary: 'Update effort',
    description: 'Updates an existing effort',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'effortId', description: 'Effort ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Effort updated successfully',
  })
  async updateEffort(
    @Param('teamId') teamId: string,
    @Param('effortId') effortId: string,
    @Body() dto: UpdateEffortDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EffortResponseDto> {
    return this.flowService.updateEffort(teamId, effortId, req.user.id, dto);
  }

  @Delete('efforts/:effortId')
  @ApiOperation({
    summary: 'Delete effort',
    description: 'Deletes an effort and all its projects and tasks',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'effortId', description: 'Effort ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Effort deleted successfully' })
  async deleteEffort(
    @Param('teamId') teamId: string,
    @Param('effortId') effortId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.flowService.deleteEffort(teamId, effortId, req.user.id);
    return { message: 'Effort deleted successfully' };
  }

  // ============================================================================
  // Projects
  // ============================================================================

  @Get('projects')
  @ApiOperation({
    summary: 'Get projects for a team',
    description:
      'Returns all projects for the team, optionally filtered by effort',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiQuery({
    name: 'effortId',
    required: false,
    description: 'Filter by effort ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Projects retrieved successfully',
  })
  async getProjects(
    @Param('teamId') teamId: string,
    @Query('effortId') effortId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponseDto[]> {
    return this.flowService.getProjects(teamId, effortId, req.user.id);
  }

  @Post('projects')
  @ApiOperation({
    summary: 'Create project',
    description: 'Creates a new project under an effort',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
  })
  async createProject(
    @Param('teamId') teamId: string,
    @Body() dto: CreateFlowProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    return this.flowService.createProject(teamId, req.user.id, dto);
  }

  @Put('projects/:projectId')
  @ApiOperation({
    summary: 'Update project',
    description: 'Updates an existing project',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'projectId', description: 'Project ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Project updated successfully',
  })
  async updateProject(
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateFlowProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    return this.flowService.updateProject(teamId, projectId, req.user.id, dto);
  }

  @Delete('projects/:projectId')
  @ApiOperation({
    summary: 'Delete project',
    description: 'Deletes a project and all its tasks',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'projectId', description: 'Project ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  async deleteProject(
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.flowService.deleteProject(teamId, projectId, req.user.id);
    return { message: 'Project deleted successfully' };
  }

  // ============================================================================
  // Tasks
  // ============================================================================

  @Get('tasks')
  @ApiOperation({
    summary: 'Get tasks for a team',
    description:
      'Returns all tasks for the team, optionally filtered by project',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter by project ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully',
  })
  async getTasks(
    @Param('teamId') teamId: string,
    @Query('projectId') projectId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskResponseDto[]> {
    return this.flowService.getTasks(teamId, projectId, req.user.id);
  }

  @Post('tasks')
  @ApiOperation({
    summary: 'Create task',
    description: 'Creates a new task under a project',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Task created successfully',
  })
  async createTask(
    @Param('teamId') teamId: string,
    @Body() dto: CreateTaskDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskResponseDto> {
    return this.flowService.createTask(teamId, req.user.id, dto);
  }

  @Put('tasks/:taskId')
  @ApiOperation({
    summary: 'Update task',
    description: 'Updates an existing task',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'taskId', description: 'Task ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Task updated successfully',
  })
  async updateTask(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskResponseDto> {
    return this.flowService.updateTask(teamId, taskId, req.user.id, dto);
  }

  @Delete('tasks/:taskId')
  @ApiOperation({
    summary: 'Delete task',
    description: 'Deletes a task',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'taskId', description: 'Task ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  async deleteTask(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.flowService.deleteTask(teamId, taskId, req.user.id);
    return { message: 'Task deleted successfully' };
  }

  // ============================================================================
  // Sprints
  // ============================================================================

  @Get('sprints')
  @ApiOperation({
    summary: 'Get sprints for a team',
    description: 'Returns all sprints for the specified team',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Sprints retrieved successfully',
  })
  async getSprints(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<SprintResponseDto[]> {
    return this.flowService.getSprints(teamId, req.user.id);
  }

  @Post('sprints')
  @ApiOperation({
    summary: 'Create sprint',
    description: 'Creates a new sprint for the team',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Sprint created successfully',
  })
  async createSprint(
    @Param('teamId') teamId: string,
    @Body() dto: CreateSprintDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SprintResponseDto> {
    return this.flowService.createSprint(teamId, req.user.id, dto);
  }

  @Put('sprints/:sprintId')
  @ApiOperation({
    summary: 'Update sprint',
    description: 'Updates an existing sprint',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Sprint updated successfully',
  })
  async updateSprint(
    @Param('teamId') teamId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: UpdateSprintDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SprintResponseDto> {
    return this.flowService.updateSprint(teamId, sprintId, req.user.id, dto);
  }

  @Delete('sprints/:sprintId')
  @ApiOperation({
    summary: 'Delete sprint',
    description: 'Deletes a sprint',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Sprint deleted successfully' })
  async deleteSprint(
    @Param('teamId') teamId: string,
    @Param('sprintId') sprintId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.flowService.deleteSprint(teamId, sprintId, req.user.id);
    return { message: 'Sprint deleted successfully' };
  }

  // ============================================================================
  // Shared Tasks (Kanban Tasks)
  // ============================================================================

  @Get('shared-tasks')
  @ApiOperation({ summary: 'Get shared tasks (kanban tasks) for a team' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'includeCollaborated',
    required: false,
    description: 'Include collaborated tasks',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter by project ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Shared tasks retrieved successfully',
    type: SharedTaskResponseDto,
    isArray: true,
  })
  async getSharedTasks(
    @Param('teamId') teamId: string,
    @Query('userId') userIdFilter: string | undefined,
    @Query('includeCollaborated') includeCollaborated: string | undefined,
    @Query('projectId') projectId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<SharedTaskResponseDto[]> {
    return this.flowService.getSharedTasks(
      teamId,
      req.user.id,
      userIdFilter,
      includeCollaborated === 'true',
      projectId || null,
    );
  }

  @Post('shared-tasks')
  @ApiOperation({ summary: 'Create shared task' })
  @ApiResponse({
    status: 201,
    description: 'Shared task created successfully',
    type: SharedTaskResponseDto,
  })
  async createSharedTask(
    @Param('teamId') teamId: string,
    @Body() dto: CreateSharedTaskDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SharedTaskResponseDto> {
    return this.flowService.createSharedTask(teamId, req.user.id, dto);
  }

  @Put('shared-tasks/:taskId')
  @ApiOperation({ summary: 'Update shared task' })
  @ApiResponse({
    status: 200,
    description: 'Shared task updated successfully',
    type: SharedTaskResponseDto,
  })
  async updateSharedTask(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateSharedTaskDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SharedTaskResponseDto> {
    return this.flowService.updateSharedTask(teamId, taskId, req.user.id, dto);
  }

  @Delete('shared-tasks/:taskId')
  @ApiOperation({ summary: 'Delete shared task' })
  @ApiResponse({ status: 200, description: 'Shared task deleted successfully' })
  async deleteSharedTask(
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.flowService.deleteSharedTask(taskId, req.user.id);
    return { message: 'Shared task deleted successfully' };
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  @Get('notifications')
  @ApiOperation({ summary: 'Get notifications for current user' })
  @ApiQuery({
    name: 'guestName',
    required: false,
    description: 'Guest name for guest users',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    type: NotificationResponseDto,
    isArray: true,
  })
  async getNotifications(
    @Query('guestName') guestName: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<NotificationResponseDto[]> {
    return this.flowService.getNotifications(req.user.id, guestName || null);
  }

  @Post('notifications')
  @ApiOperation({ summary: 'Create notification' })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
    type: NotificationResponseDto,
  })
  async createNotification(
    @Body() dto: CreateNotificationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NotificationResponseDto> {
    // Set userId if not provided
    if (!dto.userId) {
      dto.userId = req.user.id;
    }
    return this.flowService.createNotification(dto);
  }

  @Put('notifications/mark-read')
  @ApiOperation({ summary: 'Mark notifications as read' })
  @ApiResponse({ status: 200, description: 'Notifications marked as read' })
  async markNotificationsRead(
    @Body() body: { notificationIds: string[]; guestName?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.flowService.markNotificationsRead(
      req.user.id,
      body.guestName || null,
      body.notificationIds,
    );
    return { message: 'Notifications marked as read' };
  }

  // ============================================================================
  // Timer State
  // ============================================================================

  @Get('timer-state')
  @ApiOperation({ summary: 'Get timer state for team or global' })
  @ApiResponse({
    status: 200,
    description: 'Timer state retrieved successfully',
    type: TimerStateResponseDto,
  })
  async getTimerState(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TimerStateResponseDto | null> {
    return this.flowService.getTimerState(teamId, req.user.id);
  }

  @Post('timer-state')
  @ApiOperation({ summary: 'Create timer state' })
  @ApiResponse({
    status: 201,
    description: 'Timer state created successfully',
    type: TimerStateResponseDto,
  })
  async createTimerState(
    @Param('teamId') teamId: string,
    @Body() dto: CreateTimerStateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TimerStateResponseDto> {
    return this.flowService.createTimerState(teamId, req.user.id, dto);
  }

  @Put('timer-state/:timerId')
  @ApiOperation({ summary: 'Update timer state' })
  @ApiResponse({
    status: 200,
    description: 'Timer state updated successfully',
    type: TimerStateResponseDto,
  })
  async updateTimerState(
    @Param('timerId') timerId: string,
    @Body() dto: UpdateTimerStateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TimerStateResponseDto> {
    return this.flowService.updateTimerState(timerId, req.user.id, dto);
  }

  // ============================================================================
  // Profiles
  // ============================================================================

  @Get('profiles')
  @ApiOperation({ summary: 'Get user profiles' })
  @ApiQuery({
    name: 'userIds',
    required: false,
    description: 'Comma-separated user IDs to filter',
  })
  @ApiResponse({
    status: 200,
    description: 'Profiles retrieved successfully',
    type: ProfileResponseDto,
    isArray: true,
  })
  async getProfiles(
    @Query('userIds') userIds: string | undefined,
    @Req() _req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto[]> {
    const userIdArray = userIds ? userIds.split(',') : undefined;
    return this.flowService.getProfiles(userIdArray);
  }

  @Get('profiles/:userId')
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: ProfileResponseDto,
  })
  async getProfile(
    @Param('userId') userId: string,
    @Req() _req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto | null> {
    return this.flowService.getProfile(userId);
  }

  // ============================================================================
  // Task Collaboration
  // ============================================================================

  @Get('tasks/:taskId/collaborators')
  @ApiOperation({ summary: 'Get task collaborators' })
  @ApiResponse({
    status: 200,
    description: 'Collaborators retrieved successfully',
    type: Object,
    isArray: true,
  })
  async getTaskCollaborators(
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskCollaboratorResponseDto[]> {
    return this.flowService.getTaskCollaborators(taskId, req.user.id);
  }

  @Post('tasks/:taskId/collaborators')
  @ApiOperation({ summary: 'Add task collaborator' })
  @ApiResponse({ status: 201, description: 'Collaborator added successfully' })
  async createTaskCollaborator(
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskCollaboratorDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskCollaboratorResponseDto> {
    return this.flowService.createTaskCollaborator(taskId, req.user.id, dto);
  }

  @Delete('tasks/collaborators/:collaboratorId')
  @ApiOperation({ summary: 'Remove task collaborator' })
  @ApiResponse({
    status: 200,
    description: 'Collaborator removed successfully',
  })
  async deleteTaskCollaborator(
    @Param('collaboratorId') collaboratorId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.flowService.deleteTaskCollaborator(collaboratorId, req.user.id);
  }

  @Get('tasks/:taskId/watchers')
  @ApiOperation({ summary: 'Get task watchers' })
  @ApiResponse({
    status: 200,
    description: 'Watchers retrieved successfully',
    type: Object,
    isArray: true,
  })
  async getTaskWatchers(
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskWatcherResponseDto[]> {
    return this.flowService.getTaskWatchers(taskId, req.user.id);
  }

  @Post('tasks/:taskId/watchers')
  @ApiOperation({ summary: 'Add task watcher' })
  @ApiResponse({ status: 201, description: 'Watcher added successfully' })
  async createTaskWatcher(
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskWatcherDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskWatcherResponseDto> {
    return this.flowService.createTaskWatcher(taskId, req.user.id, dto);
  }

  @Delete('tasks/watchers/:watcherId')
  @ApiOperation({ summary: 'Remove task watcher' })
  @ApiResponse({ status: 200, description: 'Watcher removed successfully' })
  async deleteTaskWatcher(
    @Param('watcherId') watcherId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.flowService.deleteTaskWatcher(watcherId, req.user.id);
  }

  @Get('tasks/:taskId/update-requests')
  @ApiOperation({ summary: 'Get task update requests' })
  @ApiResponse({
    status: 200,
    description: 'Update requests retrieved successfully',
    type: Object,
    isArray: true,
  })
  async getTaskUpdateRequests(
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskUpdateRequestResponseDto[]> {
    return this.flowService.getTaskUpdateRequests(taskId, req.user.id);
  }

  @Post('tasks/:taskId/update-requests')
  @ApiOperation({ summary: 'Create task update request' })
  @ApiResponse({
    status: 201,
    description: 'Update request created successfully',
  })
  async createTaskUpdateRequest(
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskUpdateRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskUpdateRequestResponseDto> {
    return this.flowService.createTaskUpdateRequest(taskId, req.user.id, dto);
  }

  @Put('tasks/update-requests/:requestId')
  @ApiOperation({ summary: 'Update task update request' })
  @ApiResponse({
    status: 200,
    description: 'Update request updated successfully',
  })
  async updateTaskUpdateRequest(
    @Param('requestId') requestId: string,
    @Body() dto: UpdateTaskUpdateRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TaskUpdateRequestResponseDto> {
    return this.flowService.updateTaskUpdateRequest(
      requestId,
      req.user.id,
      dto,
    );
  }

  // ============================================================================
  // Channels
  // ============================================================================

  @Get('channels')
  @ApiOperation({ summary: 'Get channels for team' })
  @ApiResponse({
    status: 200,
    description: 'Channels retrieved successfully',
    type: Object,
    isArray: true,
  })
  async getChannels(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto[]> {
    return this.flowService.getChannels(teamId, req.user.id);
  }

  @Post('channels')
  @ApiOperation({ summary: 'Create channel' })
  @ApiResponse({ status: 201, description: 'Channel created successfully' })
  async createChannel(
    @Param('teamId') teamId: string,
    @Body() dto: CreateChannelDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto> {
    return this.flowService.createChannel(teamId, req.user.id, dto);
  }

  @Delete('channels/:channelId')
  @ApiOperation({ summary: 'Delete channel' })
  @ApiResponse({ status: 200, description: 'Channel deleted successfully' })
  async deleteChannel(
    @Param('channelId') channelId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.flowService.deleteChannel(channelId, req.user.id);
  }

  @Get('channels/:channelId/messages')
  @ApiOperation({ summary: 'Get channel messages' })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    type: Object,
    isArray: true,
  })
  async getChannelMessages(
    @Param('channelId') channelId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChannelMessageResponseDto[]> {
    return this.flowService.getChannelMessages(channelId, req.user.id);
  }

  @Post('channels/:channelId/messages')
  @ApiOperation({ summary: 'Create channel message' })
  @ApiResponse({ status: 201, description: 'Message created successfully' })
  async createChannelMessage(
    @Param('channelId') channelId: string,
    @Body() dto: CreateChannelMessageDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChannelMessageResponseDto> {
    return this.flowService.createChannelMessage(channelId, req.user.id, dto);
  }

  // ============================================================================
  // Team Files (Documents)
  // ============================================================================

  @Get('files')
  @ApiOperation({ summary: 'Get all files for a team (without content)' })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved successfully',
    type: TeamFileResponseDto,
    isArray: true,
  })
  async getTeamFiles(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamFileResponseDto[]> {
    return this.flowService.getTeamFiles(teamId, req.user.id);
  }

  @Get('files/:fileId')
  @ApiOperation({ summary: 'Get a single file with content' })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'fileId', description: 'File ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'File retrieved successfully',
    type: TeamFileResponseDto,
  })
  async getTeamFile(
    @Param('teamId') teamId: string,
    @Param('fileId') fileId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamFileResponseDto> {
    return this.flowService.getTeamFile(teamId, fileId, req.user.id);
  }

  @Post('files')
  @ApiOperation({ summary: 'Create a file or folder' })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'File created successfully',
    type: TeamFileResponseDto,
  })
  async createTeamFile(
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamFileDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamFileResponseDto> {
    return this.flowService.createTeamFile(teamId, req.user.id, dto);
  }

  @Put('files/:fileId')
  @ApiOperation({ summary: 'Update a file (rename, edit content, move)' })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'fileId', description: 'File ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'File updated successfully',
    type: TeamFileResponseDto,
  })
  async updateTeamFile(
    @Param('teamId') teamId: string,
    @Param('fileId') fileId: string,
    @Body() dto: UpdateTeamFileDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamFileResponseDto> {
    return this.flowService.updateTeamFile(teamId, fileId, req.user.id, dto);
  }

  @Delete('files/:fileId')
  @ApiOperation({ summary: 'Delete a file or folder (cascades to children)' })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'fileId', description: 'File ID (UUID)' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  async deleteTeamFile(
    @Param('teamId') teamId: string,
    @Param('fileId') fileId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.flowService.deleteTeamFile(teamId, fileId, req.user.id);
    return { message: 'File deleted successfully' };
  }
}

// ============================================================================
// Global Flow Endpoints (not team-specific)
// ============================================================================

@ApiTags('Flow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('flow')
export class FlowGlobalController {
  constructor(private readonly flowService: FlowService) {}

  // ============================================================================
  // Profiles (global, accessible without teamId)
  // ============================================================================

  @Get('profiles')
  @ApiOperation({ summary: 'Get user profiles (global)' })
  @ApiQuery({
    name: 'userIds',
    required: false,
    description: 'Comma-separated user IDs to filter',
  })
  @ApiResponse({
    status: 200,
    description: 'Profiles retrieved successfully',
    type: ProfileResponseDto,
    isArray: true,
  })
  async getProfiles(
    @Query('userIds') userIds: string | undefined,
    @Req() _req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto[]> {
    const userIdArray = userIds ? userIds.split(',') : undefined;
    return this.flowService.getProfiles(userIdArray);
  }

  @Get('profiles/:userId')
  @ApiOperation({ summary: 'Get user profile by ID (global)' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: ProfileResponseDto,
  })
  async getProfile(
    @Param('userId') userId: string,
    @Req() _req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto | null> {
    return this.flowService.getProfile(userId);
  }

  // ============================================================================
  // Journey Templates (global)
  // ============================================================================

  @Get('journey-templates')
  @ApiOperation({ summary: 'Get journey templates' })
  @ApiResponse({
    status: 200,
    description: 'Templates retrieved successfully',
    type: Object,
    isArray: true,
  })
  async getJourneyTemplates(): Promise<JourneyTemplateResponseDto[]> {
    return this.flowService.getJourneyTemplates();
  }

  @Get('journey-templates/:slug')
  @ApiOperation({ summary: 'Get journey template by slug' })
  @ApiResponse({ status: 200, description: 'Template retrieved successfully' })
  async getJourneyTemplateBySlug(
    @Param('slug') slug: string,
  ): Promise<JourneyTemplateResponseDto> {
    return this.flowService.getJourneyTemplateBySlug(slug);
  }

  // ============================================================================
  // Learning Progress (global)
  // ============================================================================

  @Get('learning-progress')
  @ApiOperation({ summary: 'Get learning progress for current user' })
  @ApiResponse({
    status: 200,
    description: 'Progress retrieved successfully',
    type: Object,
    isArray: true,
  })
  async getLearningProgress(
    @Req() req: AuthenticatedRequest,
  ): Promise<LearningProgressResponseDto[]> {
    return this.flowService.getLearningProgress(req.user.id);
  }

  @Post('learning-progress')
  @ApiOperation({ summary: 'Create or update learning progress' })
  @ApiResponse({ status: 201, description: 'Progress saved successfully' })
  async createOrUpdateLearningProgress(
    @Body() dto: CreateLearningProgressDto | UpdateLearningProgressDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LearningProgressResponseDto> {
    return this.flowService.createOrUpdateLearningProgress(req.user.id, dto);
  }

  // ============================================================================
  // Global Presence
  // ============================================================================

  @Post('heartbeat')
  @ApiOperation({ summary: 'Send presence heartbeat' })
  @ApiResponse({ status: 201, description: 'Heartbeat recorded' })
  async sendHeartbeat(@Req() req: AuthenticatedRequest): Promise<void> {
    return this.flowService.sendPresenceHeartbeat(req.user.id);
  }

  @Get('online')
  @ApiOperation({ summary: 'Get online user IDs' })
  @ApiResponse({
    status: 200,
    description: 'List of online user IDs',
    type: [String],
  })
  async getOnlineUsers(): Promise<string[]> {
    return this.flowService.getOnlineUsers();
  }

  // ============================================================================
  // Global Timer
  // ============================================================================

  @Get('global-timer')
  @ApiOperation({ summary: 'Get global timer state' })
  @ApiResponse({
    status: 200,
    description: 'Global timer state',
    type: TimerStateResponseDto,
  })
  async getGlobalTimerState(): Promise<TimerStateResponseDto | null> {
    return this.flowService.getGlobalTimerState();
  }

  @Post('global-timer')
  @ApiOperation({ summary: 'Create global timer state' })
  @ApiResponse({
    status: 201,
    description: 'Global timer state created',
    type: TimerStateResponseDto,
  })
  async createGlobalTimerState(
    @Body() dto: CreateTimerStateDto,
  ): Promise<TimerStateResponseDto> {
    return this.flowService.createGlobalTimerState(dto);
  }

  @Put('global-timer/:timerId')
  @ApiOperation({ summary: 'Update global timer state' })
  @ApiResponse({
    status: 200,
    description: 'Global timer state updated',
    type: TimerStateResponseDto,
  })
  async updateGlobalTimerState(
    @Param('timerId') timerId: string,
    @Body() dto: UpdateTimerStateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TimerStateResponseDto> {
    return this.flowService.updateTimerState(timerId, req.user.id, dto);
  }

  // ============================================================================
  // Personal Cross-Team Tasks
  // ============================================================================

  @Get('my-tasks')
  @ApiOperation({ summary: 'Get current user tasks across all teams' })
  @ApiQuery({
    name: 'statuses',
    required: false,
    description: 'Comma-separated statuses to filter (e.g. in_progress,today)',
  })
  @ApiResponse({
    status: 200,
    description: 'User tasks across all teams',
    type: SharedTaskResponseDto,
    isArray: true,
  })
  async getMyTasks(
    @Query('statuses') statuses: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<SharedTaskResponseDto[]> {
    const statusArray = statuses ? statuses.split(',') : [];
    return this.flowService.getMyTasks(req.user.id, statusArray);
  }
}
