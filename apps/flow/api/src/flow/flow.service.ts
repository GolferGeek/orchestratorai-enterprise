import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '../database';
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
  SharedTaskStatus,
  CreateTeamFileDto,
  UpdateTeamFileDto,
  TeamFileResponseDto,
} from './flow.dto';

// ============================================================================
// Database Row Interfaces
// ============================================================================

interface EffortRow {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  status: string;
  order_index: number;
  icon: string | null;
  color: string | null;
  estimated_days: number | null;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  effort_id: string;
  name: string;
  description: string | null;
  status: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  order_index: number;
  documentation_url: string | null;
  is_milestone: boolean;
  created_at: string;
  updated_at: string;
}

interface SprintRow {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SharedTaskRow {
  id: string;
  title: string;
  is_completed: boolean;
  assigned_to: string | null;
  user_id: string | null;
  status: SharedTaskStatus;
  created_at: string;
  parent_task_id: string | null;
  pomodoro_count: number;
  project_id: string | null;
  sprint_id: string | null;
  due_date: string | null;
  team_id: string | null;
  description: string | null;
  channel_id: string | null;
  source_channel_user_id: string | null;
}

interface NotificationRow {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  type: string;
  task_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface TimerStateRow {
  id: string;
  team_id: string | null;
  end_time: string | null;
  is_running: boolean;
  is_break: boolean;
  duration_seconds: number;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskCollaboratorRow {
  id: string;
  task_id: string;
  user_id: string | null;
  guest_name: string | null;
  joined_at: string;
}

interface TaskWatcherRow {
  id: string;
  task_id: string;
  user_id: string | null;
  guest_name: string | null;
  created_at: string;
}

interface TaskUpdateRequestRow {
  id: string;
  task_id: string;
  requested_by_user_id: string | null;
  requested_by_guest: string | null;
  message: string | null;
  created_at: string;
  is_resolved: boolean;
}

interface ChannelRow {
  id: string;
  name: string;
  description: string | null;
  team_id: string;
  created_by_user_id: string | null;
  created_by_guest: string | null;
  created_at: string;
}

interface ChannelMessageRow {
  id: string;
  channel_id: string;
  content: string;
  user_id: string | null;
  guest_name: string | null;
  created_at: string;
}

interface JourneyTemplateRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  template_data: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

interface LearningProgressRow {
  id: string;
  user_id: string;
  organization_slug: string;
  milestone_key: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface TeamFileRow {
  id: string;
  team_id: string;
  parent_id: string | null;
  name: string;
  is_folder: boolean;
  content: string | null;
  file_type: string;
  size_bytes: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Verify user is a member of the team
   */
  private async verifyTeamMember(
    userId: string,
    teamId: string,
  ): Promise<void> {
    const { data, error } = (await this.db
      .from(null, 'team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single()) as QueryResult<unknown>;

    if (error || !data) {
      throw new ForbiddenException('You are not a member of this team');
    }
  }

  // ============================================================================
  // Efforts
  // ============================================================================

  async getEfforts(
    teamId: string,
    userId: string,
  ): Promise<EffortResponseDto[]> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'efforts')
      .select('*')
      .eq('team_id', teamId)
      .order('order_index', { ascending: true })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get efforts: ${error.message}`);
      throw new BadRequestException(`Failed to get efforts: ${error.message}`);
    }

    const efforts = (data as EffortRow[] | null) || [];
    return efforts.map((effort) => ({
      id: effort.id,
      teamId: effort.team_id,
      name: effort.name,
      description: effort.description,
      status: effort.status || 'not_started',
      orderIndex: effort.order_index || 0,
      icon: effort.icon,
      color: effort.color,
      estimatedDays: effort.estimated_days,
      createdAt: new Date(effort.created_at),
      updatedAt: new Date(effort.updated_at),
    }));
  }

  async createEffort(
    teamId: string,
    userId: string,
    dto: CreateEffortDto,
  ): Promise<EffortResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'efforts')
      .insert({
        team_id: teamId,
        name: dto.name,
        description: dto.description,
        status: dto.status || 'not_started',
        order_index: dto.orderIndex ?? 0,
        icon: dto.icon,
        color: dto.color,
        estimated_days: dto.estimatedDays,
      })
      .select()
      .single()) as QueryResult<EffortRow>;

    if (error) {
      this.logger.error(`Failed to create effort: ${error.message}`);
      throw new BadRequestException(
        `Failed to create effort: ${error.message}`,
      );
    }

    const effort = data as EffortRow;
    return {
      id: effort.id,
      teamId: effort.team_id,
      name: effort.name,
      description: effort.description,
      status: effort.status || 'not_started',
      orderIndex: effort.order_index || 0,
      icon: effort.icon,
      color: effort.color,
      estimatedDays: effort.estimated_days,
      createdAt: new Date(effort.created_at),
      updatedAt: new Date(effort.updated_at),
    };
  }

  async updateEffort(
    teamId: string,
    effortId: string,
    userId: string,
    dto: UpdateEffortDto,
  ): Promise<EffortResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    // Verify effort belongs to team
    const { data: effort, error: fetchError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('id', effortId)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !effort) {
      throw new NotFoundException('Effort not found');
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.orderIndex !== undefined) updateData.order_index = dto.orderIndex;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.estimatedDays !== undefined)
      updateData.estimated_days = dto.estimatedDays;

    const { data, error } = (await this.db
      .from('orch_flow', 'efforts')
      .update(updateData)
      .eq('id', effortId)
      .select()
      .single()) as QueryResult<EffortRow>;

    if (error) {
      this.logger.error(`Failed to update effort: ${error.message}`);
      throw new BadRequestException(
        `Failed to update effort: ${error.message}`,
      );
    }

    const updatedEffort = data as EffortRow;
    return {
      id: updatedEffort.id,
      teamId: updatedEffort.team_id,
      name: updatedEffort.name,
      description: updatedEffort.description,
      status: updatedEffort.status || 'not_started',
      orderIndex: updatedEffort.order_index || 0,
      icon: updatedEffort.icon,
      color: updatedEffort.color,
      estimatedDays: updatedEffort.estimated_days,
      createdAt: new Date(updatedEffort.created_at),
      updatedAt: new Date(updatedEffort.updated_at),
    };
  }

  async deleteEffort(
    teamId: string,
    effortId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyTeamMember(userId, teamId);

    // Verify effort belongs to team
    const { data: effort, error: fetchError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('id', effortId)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !effort) {
      throw new NotFoundException('Effort not found');
    }

    const { error } = await this.db
      .from('orch_flow', 'efforts')
      .delete()
      .eq('id', effortId);

    if (error) {
      this.logger.error(`Failed to delete effort: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete effort: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // Projects
  // ============================================================================

  async getProjects(
    teamId: string,
    effortId: string | undefined,
    userId: string,
  ): Promise<ProjectResponseDto[]> {
    await this.verifyTeamMember(userId, teamId);

    // First get effort IDs for this team
    const { data: efforts, error: effortsError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('team_id', teamId)) as QueryResult<unknown>;

    if (effortsError) {
      this.logger.error(`Failed to get efforts: ${effortsError.message}`);
      throw new BadRequestException(
        `Failed to get efforts: ${effortsError.message}`,
      );
    }

    const effortRows = (efforts as Pick<EffortRow, 'id'>[] | null) || [];
    const effortIds = effortRows.map((e) => e.id);
    if (effortIds.length === 0) {
      return [];
    }

    let query = this.db
      .from('orch_flow', 'projects')
      .select('*')
      .in('effort_id', effortIds);

    if (effortId) {
      query = query.eq('effort_id', effortId);
    }

    const { data, error } = (await query.order('order_index', {
      ascending: true,
    })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get projects: ${error.message}`);
      throw new BadRequestException(`Failed to get projects: ${error.message}`);
    }

    const projects = (data as ProjectRow[] | null) || [];
    return projects.map((project) => ({
      id: project.id,
      effortId: project.effort_id,
      name: project.name,
      description: project.description,
      status: project.status || 'not_started',
      orderIndex: project.order_index || 0,
      createdAt: new Date(project.created_at),
      updatedAt: new Date(project.updated_at),
    }));
  }

  async createProject(
    teamId: string,
    userId: string,
    dto: CreateFlowProjectDto,
  ): Promise<ProjectResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    // Verify effort belongs to team
    const { data: effort, error: effortError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('id', dto.effortId)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (effortError || !effort) {
      throw new NotFoundException('Effort not found');
    }

    // Note: Projects may use effort_id directly (not goal_id) based on seeding script
    // Check if effort_id column exists, otherwise use goal_id
    const { data, error } = (await this.db
      .from('orch_flow', 'projects')
      .insert({
        effort_id: dto.effortId, // Try effort_id first (matches seeding script)
        name: dto.name,
        description: dto.description,
        status: dto.status || 'not_started',
        order_index: dto.orderIndex ?? 0,
      })
      .select()
      .single()) as QueryResult<ProjectRow>;

    if (error) {
      this.logger.error(`Failed to create project: ${error.message}`);
      throw new BadRequestException(
        `Failed to create project: ${error.message}`,
      );
    }

    const project = data as ProjectRow;
    return {
      id: project.id,
      effortId: project.effort_id,
      name: project.name,
      description: project.description,
      status: project.status || 'not_started',
      orderIndex: project.order_index || 0,
      createdAt: new Date(project.created_at),
      updatedAt: new Date(project.updated_at),
    };
  }

  async updateProject(
    teamId: string,
    projectId: string,
    userId: string,
    dto: UpdateFlowProjectDto,
  ): Promise<ProjectResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    // Verify project belongs to team via effort
    const { data: project, error: fetchError } = (await this.db
      .from('orch_flow', 'projects')
      .select('effort_id')
      .eq('id', projectId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !project) {
      throw new NotFoundException('Project not found');
    }

    const projectRow = project as Pick<ProjectRow, 'effort_id'>;

    // Verify effort belongs to team
    const { data: effort, error: effortError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('id', projectRow.effort_id)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (effortError || !effort) {
      throw new NotFoundException('Project not found');
    }

    if (fetchError || !project) {
      throw new NotFoundException('Project not found');
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.orderIndex !== undefined) updateData.order_index = dto.orderIndex;

    const { data, error } = (await this.db
      .from('orch_flow', 'projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single()) as QueryResult<ProjectRow>;

    if (error) {
      this.logger.error(`Failed to update project: ${error.message}`);
      throw new BadRequestException(
        `Failed to update project: ${error.message}`,
      );
    }

    const updatedProject = data as ProjectRow;
    return {
      id: updatedProject.id,
      effortId: updatedProject.effort_id,
      name: updatedProject.name,
      description: updatedProject.description,
      status: updatedProject.status || 'not_started',
      orderIndex: updatedProject.order_index || 0,
      createdAt: new Date(updatedProject.created_at),
      updatedAt: new Date(updatedProject.updated_at),
    };
  }

  async deleteProject(
    teamId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyTeamMember(userId, teamId);

    // Verify project belongs to team via effort
    const { data: project, error: fetchError } = (await this.db
      .from('orch_flow', 'projects')
      .select('effort_id')
      .eq('id', projectId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !project) {
      throw new NotFoundException('Project not found');
    }

    const projectRow = project as Pick<ProjectRow, 'effort_id'>;

    // Verify effort belongs to team
    const { data: effort, error: effortError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('id', projectRow.effort_id)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (effortError || !effort) {
      throw new NotFoundException('Project not found');
    }

    if (fetchError || !project) {
      throw new NotFoundException('Project not found');
    }

    const { error } = await this.db
      .from('orch_flow', 'projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      this.logger.error(`Failed to delete project: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete project: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // Tasks
  // ============================================================================

  async getTasks(
    teamId: string,
    projectId: string | undefined,
    userId: string,
  ): Promise<TaskResponseDto[]> {
    await this.verifyTeamMember(userId, teamId);

    // First get project IDs for this team via efforts
    const { data: efforts, error: effortsError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('team_id', teamId)) as QueryResult<unknown>;

    if (effortsError) {
      this.logger.error(`Failed to get efforts: ${effortsError.message}`);
      throw new BadRequestException(
        `Failed to get efforts: ${effortsError.message}`,
      );
    }

    const effortRows = (efforts as Pick<EffortRow, 'id'>[] | null) || [];
    const effortIds = effortRows.map((e) => e.id);
    if (effortIds.length === 0) {
      return [];
    }

    // Get project IDs for these efforts
    const { data: projects, error: projectsError } = (await this.db
      .from('orch_flow', 'projects')
      .select('id')
      .in('effort_id', effortIds)) as QueryResult<unknown>;

    if (projectsError) {
      this.logger.error(`Failed to get projects: ${projectsError.message}`);
      throw new BadRequestException(
        `Failed to get projects: ${projectsError.message}`,
      );
    }

    const projectRows = (projects as Pick<ProjectRow, 'id'>[] | null) || [];
    const projectIds = projectRows.map((p) => p.id);
    if (projectIds.length === 0) {
      return [];
    }

    let query = this.db
      .from('orch_flow', 'tasks')
      .select('*')
      .in('project_id', projectIds);

    if (projectId) {
      // Verify projectId is in the allowed list
      if (!projectIds.includes(projectId)) {
        throw new NotFoundException('Project not found');
      }
      query = query.eq('project_id', projectId);
    }

    const { data, error } = (await query.order('order_index', {
      ascending: true,
    })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get tasks: ${error.message}`);
      throw new BadRequestException(`Failed to get tasks: ${error.message}`);
    }

    const tasks = (data as TaskRow[] | null) || [];
    return tasks.map((task) => ({
      id: task.id,
      projectId: task.project_id,
      title: task.title,
      description: task.description,
      status: task.status || 'pending',
      orderIndex: task.order_index || 0,
      documentationUrl: task.documentation_url,
      isMilestone: task.is_milestone || false,
      createdAt: new Date(task.created_at),
      updatedAt: new Date(task.updated_at),
    }));
  }

  async createTask(
    teamId: string,
    userId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    // Verify project belongs to team via effort
    const { data: project, error: projectError } = (await this.db
      .from('orch_flow', 'projects')
      .select(
        `
        id,
        efforts!inner(team_id)
      `,
      )
      .eq('id', dto.projectId)
      .eq('efforts.team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (projectError || !project) {
      throw new NotFoundException('Project not found');
    }

    const { data, error } = (await this.db
      .from('orch_flow', 'tasks')
      .insert({
        project_id: dto.projectId,
        title: dto.title,
        description: dto.description,
        status: dto.status || 'pending',
        order_index: dto.orderIndex ?? 0,
        documentation_url: dto.documentationUrl,
        is_milestone: dto.isMilestone || false,
      })
      .select()
      .single()) as QueryResult<TaskRow>;

    if (error) {
      this.logger.error(`Failed to create task: ${error.message}`);
      throw new BadRequestException(`Failed to create task: ${error.message}`);
    }

    const task = data as TaskRow;
    return {
      id: task.id,
      projectId: task.project_id,
      title: task.title,
      description: task.description,
      status: task.status || 'pending',
      orderIndex: task.order_index || 0,
      documentationUrl: task.documentation_url,
      isMilestone: task.is_milestone || false,
      createdAt: new Date(task.created_at),
      updatedAt: new Date(task.updated_at),
    };
  }

  async updateTask(
    teamId: string,
    taskId: string,
    userId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    // Verify task belongs to team via project -> effort
    const { data: task, error: fetchError } = (await this.db
      .from('orch_flow', 'tasks')
      .select('project_id')
      .eq('id', taskId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !task) {
      throw new NotFoundException('Task not found');
    }

    const taskRow = task as Pick<TaskRow, 'project_id'>;

    // Get project's effort
    const { data: project, error: projectError } = (await this.db
      .from('orch_flow', 'projects')
      .select('effort_id')
      .eq('id', taskRow.project_id)
      .single()) as QueryResult<unknown>;

    if (projectError || !project) {
      throw new NotFoundException('Task not found');
    }

    const projectRow = project as Pick<ProjectRow, 'effort_id'>;

    // Verify effort belongs to team
    const { data: effort, error: effortError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('id', projectRow.effort_id)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (effortError || !effort) {
      throw new NotFoundException('Task not found');
    }

    if (fetchError || !task) {
      throw new NotFoundException('Task not found');
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.orderIndex !== undefined) updateData.order_index = dto.orderIndex;
    if (dto.documentationUrl !== undefined)
      updateData.documentation_url = dto.documentationUrl;
    if (dto.isMilestone !== undefined)
      updateData.is_milestone = dto.isMilestone;

    const { data, error } = (await this.db
      .from('orch_flow', 'tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single()) as QueryResult<TaskRow>;

    if (error) {
      this.logger.error(`Failed to update task: ${error.message}`);
      throw new BadRequestException(`Failed to update task: ${error.message}`);
    }

    const updatedTask = data as TaskRow;
    return {
      id: updatedTask.id,
      projectId: updatedTask.project_id,
      title: updatedTask.title,
      description: updatedTask.description,
      status: updatedTask.status || 'pending',
      orderIndex: updatedTask.order_index || 0,
      documentationUrl: updatedTask.documentation_url,
      isMilestone: updatedTask.is_milestone || false,
      createdAt: new Date(updatedTask.created_at),
      updatedAt: new Date(updatedTask.updated_at),
    };
  }

  async deleteTask(
    teamId: string,
    taskId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyTeamMember(userId, teamId);

    // Verify task belongs to team via project -> effort
    const { data: task, error: fetchError } = (await this.db
      .from('orch_flow', 'tasks')
      .select('project_id')
      .eq('id', taskId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !task) {
      throw new NotFoundException('Task not found');
    }

    const taskRow = task as Pick<TaskRow, 'project_id'>;

    // Get project's effort
    const { data: project, error: projectError } = (await this.db
      .from('orch_flow', 'projects')
      .select('effort_id')
      .eq('id', taskRow.project_id)
      .single()) as QueryResult<unknown>;

    if (projectError || !project) {
      throw new NotFoundException('Task not found');
    }

    const projectRow = project as Pick<ProjectRow, 'effort_id'>;

    // Verify effort belongs to team
    const { data: effort, error: effortError } = (await this.db
      .from('orch_flow', 'efforts')
      .select('id')
      .eq('id', projectRow.effort_id)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (effortError || !effort) {
      throw new NotFoundException('Task not found');
    }

    if (fetchError || !task) {
      throw new NotFoundException('Task not found');
    }

    const { error } = await this.db
      .from('orch_flow', 'tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      this.logger.error(`Failed to delete task: ${error.message}`);
      throw new BadRequestException(`Failed to delete task: ${error.message}`);
    }
  }

  // ============================================================================
  // Sprints
  // ============================================================================

  async getSprints(
    teamId: string,
    userId: string,
  ): Promise<SprintResponseDto[]> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'sprints')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get sprints: ${error.message}`);
      throw new BadRequestException(`Failed to get sprints: ${error.message}`);
    }

    const sprints = (data as SprintRow[] | null) || [];
    return sprints.map((sprint) => ({
      id: sprint.id,
      teamId: sprint.team_id,
      name: sprint.name,
      description: sprint.description,
      startDate: sprint.start_date ? new Date(sprint.start_date) : null,
      endDate: sprint.end_date ? new Date(sprint.end_date) : null,
      isActive: sprint.is_active || false,
      createdAt: new Date(sprint.created_at),
      updatedAt: new Date(sprint.updated_at),
    }));
  }

  async createSprint(
    teamId: string,
    userId: string,
    dto: CreateSprintDto,
  ): Promise<SprintResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'sprints')
      .insert({
        team_id: teamId,
        name: dto.name,
        description: dto.description,
        start_date: dto.startDate || null,
        end_date: dto.endDate || null,
        is_active: dto.isActive || false,
      })
      .select()
      .single()) as QueryResult<SprintRow>;

    if (error) {
      this.logger.error(`Failed to create sprint: ${error.message}`);
      throw new BadRequestException(
        `Failed to create sprint: ${error.message}`,
      );
    }

    const sprint = data as SprintRow;
    return {
      id: sprint.id,
      teamId: sprint.team_id,
      name: sprint.name,
      description: sprint.description,
      startDate: sprint.start_date ? new Date(sprint.start_date) : null,
      endDate: sprint.end_date ? new Date(sprint.end_date) : null,
      isActive: sprint.is_active || false,
      createdAt: new Date(sprint.created_at),
      updatedAt: new Date(sprint.updated_at),
    };
  }

  async updateSprint(
    teamId: string,
    sprintId: string,
    userId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    // Verify sprint belongs to team
    const { data: sprint, error: fetchError } = (await this.db
      .from('orch_flow', 'sprints')
      .select('id')
      .eq('id', sprintId)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !sprint) {
      throw new NotFoundException('Sprint not found');
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.startDate !== undefined)
      updateData.start_date = dto.startDate || null;
    if (dto.endDate !== undefined) updateData.end_date = dto.endDate || null;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;

    const { data, error } = (await this.db
      .from('orch_flow', 'sprints')
      .update(updateData)
      .eq('id', sprintId)
      .select()
      .single()) as QueryResult<SprintRow>;

    if (error) {
      this.logger.error(`Failed to update sprint: ${error.message}`);
      throw new BadRequestException(
        `Failed to update sprint: ${error.message}`,
      );
    }

    const updatedSprint = data as SprintRow;
    return {
      id: updatedSprint.id,
      teamId: updatedSprint.team_id,
      name: updatedSprint.name,
      description: updatedSprint.description,
      startDate: updatedSprint.start_date
        ? new Date(updatedSprint.start_date)
        : null,
      endDate: updatedSprint.end_date ? new Date(updatedSprint.end_date) : null,
      isActive: updatedSprint.is_active || false,
      createdAt: new Date(updatedSprint.created_at),
      updatedAt: new Date(updatedSprint.updated_at),
    };
  }

  async deleteSprint(
    teamId: string,
    sprintId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyTeamMember(userId, teamId);

    // Verify sprint belongs to team
    const { data: sprint, error: fetchError } = (await this.db
      .from('orch_flow', 'sprints')
      .select('id')
      .eq('id', sprintId)
      .eq('team_id', teamId)
      .single()) as QueryResult<unknown>;

    if (fetchError || !sprint) {
      throw new NotFoundException('Sprint not found');
    }

    const { error } = await this.db
      .from('orch_flow', 'sprints')
      .delete()
      .eq('id', sprintId);

    if (error) {
      this.logger.error(`Failed to delete sprint: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete sprint: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // Shared Tasks (Kanban Tasks)
  // ============================================================================

  async getSharedTasks(
    teamId: string | null,
    userId: string | null,
    userIdFilter: string | undefined,
    includeCollaborated: boolean,
    projectId: string | null | undefined,
  ): Promise<SharedTaskResponseDto[]> {
    // If teamId provided, verify membership
    if (teamId && userId) {
      await this.verifyTeamMember(userId, teamId);
    }

    let query = this.db
      .from('orch_flow', 'shared_tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    if (userIdFilter && !includeCollaborated) {
      query = query.eq('user_id', userIdFilter);
    }

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get shared tasks: ${error.message}`);
      throw new BadRequestException(
        `Failed to get shared tasks: ${error.message}`,
      );
    }

    const sharedTasks = (data as SharedTaskRow[] | null) || [];
    return sharedTasks.map((task) => ({
      id: task.id,
      title: task.title,
      isCompleted: task.is_completed || false,
      assignedTo: task.assigned_to,
      userId: task.user_id,
      status: task.status,
      createdAt: task.created_at,
      parentTaskId: task.parent_task_id,
      pomodoroCount: task.pomodoro_count || 0,
      projectId: task.project_id,
      sprintId: task.sprint_id,
      dueDate: task.due_date,
      teamId: task.team_id,
      description: task.description,
      channelId: task.channel_id,
      sourceChannelUserId: task.source_channel_user_id,
    }));
  }

  async createSharedTask(
    teamId: string | null,
    userId: string,
    dto: CreateSharedTaskDto,
  ): Promise<SharedTaskResponseDto> {
    if (teamId) {
      await this.verifyTeamMember(userId, teamId);
    }

    const { data, error } = (await this.db
      .from('orch_flow', 'shared_tasks')
      .insert({
        title: dto.title,
        status: dto.status || 'in_progress',
        user_id: dto.userId || userId,
        assigned_to: dto.assignedTo,
        project_id: dto.projectId,
        sprint_id: dto.sprintId,
        due_date: dto.dueDate,
        team_id: dto.teamId || teamId,
        parent_task_id: dto.parentTaskId,
        is_completed: false,
        pomodoro_count: 0,
        description: dto.description,
        channel_id: dto.channelId,
        source_channel_user_id: dto.sourceChannelUserId,
      })
      .select()
      .single()) as QueryResult<SharedTaskRow>;

    if (error) {
      this.logger.error(`Failed to create shared task: ${error.message}`);
      throw new BadRequestException(
        `Failed to create shared task: ${error.message}`,
      );
    }

    const sharedTask = data as SharedTaskRow;
    return {
      id: sharedTask.id,
      title: sharedTask.title,
      isCompleted: sharedTask.is_completed || false,
      assignedTo: sharedTask.assigned_to,
      userId: sharedTask.user_id,
      status: sharedTask.status,
      createdAt: sharedTask.created_at,
      parentTaskId: sharedTask.parent_task_id,
      pomodoroCount: sharedTask.pomodoro_count || 0,
      projectId: sharedTask.project_id,
      sprintId: sharedTask.sprint_id,
      dueDate: sharedTask.due_date,
      teamId: sharedTask.team_id,
      description: sharedTask.description,
      channelId: sharedTask.channel_id,
      sourceChannelUserId: sharedTask.source_channel_user_id,
    };
  }

  async updateSharedTask(
    teamId: string,
    taskId: string,
    userId: string,
    dto: UpdateSharedTaskDto,
  ): Promise<SharedTaskResponseDto> {
    // Verify team membership
    await this.verifyTeamMember(userId, teamId);

    // Verify task exists in shared_tasks; if missing, it may still exist in hierarchy tasks.
    const { data: existingSharedTask, error: fetchError } = (await this.db
      .from('orch_flow', 'shared_tasks')
      .select('id, team_id')
      .eq('id', taskId)
      .maybeSingle()) as QueryResult<Pick<SharedTaskRow, 'id' | 'team_id'>>;

    if (fetchError) {
      this.logger.error(`Failed to fetch shared task: ${fetchError.message}`, {
        taskId,
        teamId,
        error: fetchError,
      });
      throw new BadRequestException(
        `Failed to fetch shared task: ${fetchError.message}`,
      );
    }

    let task: Pick<SharedTaskRow, 'id' | 'team_id'> | null = existingSharedTask;

    // Auto-materialize a shared task from hierarchy task if needed.
    if (!task) {
      const { data: hierarchyTask, error: hierarchyTaskError } = (await this.db
        .from('orch_flow', 'tasks')
        .select('id, title, status, project_id')
        .eq('id', taskId)
        .maybeSingle()) as QueryResult<
        Pick<TaskRow, 'id' | 'title' | 'status' | 'project_id'>
      >;

      if (hierarchyTaskError) {
        this.logger.error(
          `Failed to fetch hierarchy task for shared fallback: ${hierarchyTaskError.message}`,
          { taskId, teamId, error: hierarchyTaskError },
        );
        throw new BadRequestException(
          `Failed to fetch hierarchy task: ${hierarchyTaskError.message}`,
        );
      }

      if (!hierarchyTask) {
        this.logger.warn(`Shared task not found: ${taskId}`, {
          taskId,
          teamId,
        });
        throw new NotFoundException(`Shared task not found: ${taskId}`);
      }

      // Verify the hierarchy task belongs to this team through project -> effort.
      const { data: project, error: projectError } = (await this.db
        .from('orch_flow', 'projects')
        .select('id, effort_id')
        .eq('id', hierarchyTask.project_id)
        .maybeSingle()) as QueryResult<Pick<ProjectRow, 'id' | 'effort_id'>>;

      if (projectError || !project) {
        this.logger.error(
          `Failed to verify project ownership for hierarchy task: ${projectError?.message || 'Project not found'}`,
          { taskId, teamId, projectId: hierarchyTask.project_id },
        );
        throw new NotFoundException('Hierarchy task project not found');
      }

      const { data: effort, error: effortError } = (await this.db
        .from('orch_flow', 'efforts')
        .select('id, team_id')
        .eq('id', project.effort_id)
        .maybeSingle()) as QueryResult<Pick<EffortRow, 'id' | 'team_id'>>;

      if (effortError || !effort) {
        this.logger.error(
          `Failed to verify effort ownership for hierarchy task: ${effortError?.message || 'Effort not found'}`,
          { taskId, teamId, effortId: project.effort_id },
        );
        throw new NotFoundException('Hierarchy task effort not found');
      }

      if (effort.team_id !== teamId) {
        throw new ForbiddenException(
          'Hierarchy task does not belong to this team',
        );
      }

      const validStatuses: string[] = Object.values(SharedTaskStatus);
      const normalizedStatus: SharedTaskStatus = validStatuses.includes(
        hierarchyTask.status,
      )
        ? (hierarchyTask.status as SharedTaskStatus)
        : SharedTaskStatus.TODAY;

      const { data: createdSharedTask, error: createSharedTaskError } =
        (await this.db
          .from('orch_flow', 'shared_tasks')
          .insert({
            id: hierarchyTask.id,
            title: hierarchyTask.title,
            status: normalizedStatus,
            user_id: userId,
            project_id: hierarchyTask.project_id,
            team_id: teamId,
            is_completed: normalizedStatus === SharedTaskStatus.DONE,
            pomodoro_count: 0,
          })
          .select('id, team_id')
          .maybeSingle()) as QueryResult<Pick<SharedTaskRow, 'id' | 'team_id'>>;

      if (createSharedTaskError) {
        this.logger.error(
          `Failed to create shared task from hierarchy task: ${createSharedTaskError.message}`,
          {
            taskId,
            teamId,
            errorCode: createSharedTaskError.code,
            errorDetails: createSharedTaskError.details,
          },
        );
        throw new BadRequestException(
          `Failed to create shared task from hierarchy task: ${createSharedTaskError.message}`,
        );
      }

      task = createdSharedTask;
    }

    if (!task) {
      throw new NotFoundException(`Shared task not found: ${taskId}`);
    }

    // Verify task belongs to the team (if team_id is set)
    if (task.team_id && task.team_id !== teamId) {
      throw new ForbiddenException('Task does not belong to this team');
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.isCompleted !== undefined)
      updateData.is_completed = dto.isCompleted;
    if (dto.userId !== undefined) updateData.user_id = dto.userId;
    if (dto.assignedTo !== undefined) updateData.assigned_to = dto.assignedTo;
    if (dto.projectId !== undefined) updateData.project_id = dto.projectId;
    if (dto.sprintId !== undefined) updateData.sprint_id = dto.sprintId;
    if (dto.dueDate !== undefined) updateData.due_date = dto.dueDate;
    if (dto.pomodoroCount !== undefined)
      updateData.pomodoro_count = dto.pomodoroCount;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.channelId !== undefined) updateData.channel_id = dto.channelId;

    // Always set team_id if not already set (ensures task is associated with team)
    if (!task.team_id) {
      updateData.team_id = teamId;
    }

    // Build update query - always filter by id, conditionally by team_id
    // If team_id is being set, we can't filter by it yet, so only filter by id
    let updateQuery = this.db
      .from('orch_flow', 'shared_tasks')
      .update(updateData)
      .eq('id', taskId);

    // Only add team_id filter if task already has one (prevents updating wrong team's tasks)
    if (task.team_id) {
      updateQuery = updateQuery.eq('team_id', teamId);
    }

    // Use select().single() like updateSprint does - PostgREST should handle this correctly
    const { data: updatedData, error: updateError } = (await updateQuery
      .select()
      .single()) as QueryResult<SharedTaskRow>;

    if (updateError) {
      this.logger.error(
        `Failed to update shared task: ${updateError.message}`,
        {
          taskId,
          teamId,
          updateData,
          taskTeamId: task.team_id,
          errorCode: updateError.code,
          errorDetails: updateError.details,
        },
      );
      throw new BadRequestException(
        `Failed to update shared task: ${updateError.message}`,
      );
    }

    if (!updatedData) {
      this.logger.error(`Shared task not found after update`, {
        taskId,
        teamId,
        taskTeamId: task.team_id,
      });
      throw new NotFoundException('Shared task not found after update');
    }

    const updatedTask = updatedData;
    return {
      id: updatedTask.id,
      title: updatedTask.title,
      isCompleted: updatedTask.is_completed || false,
      assignedTo: updatedTask.assigned_to,
      userId: updatedTask.user_id,
      status: updatedTask.status,
      createdAt: updatedTask.created_at,
      parentTaskId: updatedTask.parent_task_id,
      pomodoroCount: updatedTask.pomodoro_count || 0,
      projectId: updatedTask.project_id,
      sprintId: updatedTask.sprint_id,
      dueDate: updatedTask.due_date,
      teamId: updatedTask.team_id || teamId,
      description: updatedTask.description,
      channelId: updatedTask.channel_id,
      sourceChannelUserId: updatedTask.source_channel_user_id,
    };
  }

  async deleteSharedTask(taskId: string, _userId: string): Promise<void> {
    const { error } = await this.db
      .from('orch_flow', 'shared_tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      this.logger.error(`Failed to delete shared task: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete shared task: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  async getNotifications(
    userId: string | null,
    guestName: string | null,
  ): Promise<NotificationResponseDto[]> {
    let query = this.db
      .from('orch_flow', 'notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (guestName) {
      query = query.eq('guest_name', guestName);
    } else {
      return [];
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get notifications: ${error.message}`);
      throw new BadRequestException(
        `Failed to get notifications: ${error.message}`,
      );
    }

    const notifications = (data as NotificationRow[] | null) || [];
    return notifications.map((notif) => ({
      id: notif.id,
      userId: notif.user_id,
      guestName: notif.guest_name,
      type: notif.type,
      taskId: notif.task_id,
      message: notif.message,
      isRead: notif.is_read || false,
      createdAt: notif.created_at,
    }));
  }

  async createNotification(
    dto: CreateNotificationDto,
  ): Promise<NotificationResponseDto> {
    const { data, error } = (await this.db
      .from('orch_flow', 'notifications')
      .insert({
        user_id: dto.userId,
        guest_name: dto.guestName,
        type: dto.type,
        task_id: dto.taskId,
        message: dto.message,
        is_read: false,
      })
      .select()
      .single()) as QueryResult<NotificationRow>;

    if (error) {
      this.logger.error(`Failed to create notification: ${error.message}`);
      throw new BadRequestException(
        `Failed to create notification: ${error.message}`,
      );
    }

    const notification = data as NotificationRow;
    return {
      id: notification.id,
      userId: notification.user_id,
      guestName: notification.guest_name,
      type: notification.type,
      taskId: notification.task_id,
      message: notification.message,
      isRead: notification.is_read || false,
      createdAt: notification.created_at,
    };
  }

  async markNotificationsRead(
    userId: string | null,
    guestName: string | null,
    notificationIds: string[],
  ): Promise<void> {
    let query = this.db
      .from('orch_flow', 'notifications')
      .update({ is_read: true })
      .in('id', notificationIds);

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (guestName) {
      query = query.eq('guest_name', guestName);
    }

    const { error } = await query;

    if (error) {
      this.logger.error(
        `Failed to mark notifications as read: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to mark notifications as read: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // Timer State
  // ============================================================================

  async getTimerState(
    teamId: string,
    userId: string,
  ): Promise<TimerStateResponseDto | null> {
    let query = this.db.from('orch_flow', 'timer_state').select('*').limit(1);

    await this.verifyTeamMember(userId, teamId);
    query = query.eq('team_id', teamId);

    const { data, error } =
      (await query.maybeSingle()) as QueryResult<TimerStateRow>;

    if (error) {
      this.logger.error(`Failed to get timer state: ${error.message}`);
      throw new BadRequestException(
        `Failed to get timer state: ${error.message}`,
      );
    }

    if (!data) {
      return null;
    }

    const timerState = data;
    return {
      id: timerState.id,
      teamId: timerState.team_id,
      endTime: timerState.end_time,
      isRunning: timerState.is_running || false,
      isBreak: timerState.is_break || false,
      durationSeconds: timerState.duration_seconds || 0,
      createdAt: timerState.created_at,
      updatedAt: timerState.updated_at,
    };
  }

  async createTimerState(
    teamId: string | null,
    userId: string,
    dto: CreateTimerStateDto,
  ): Promise<TimerStateResponseDto> {
    if (teamId) {
      await this.verifyTeamMember(userId, teamId);
    }

    const { data, error } = (await this.db
      .from('orch_flow', 'timer_state')
      .insert({
        team_id: teamId || null,
        duration_seconds: dto.durationSeconds,
        is_running: dto.isRunning || false,
        is_break: dto.isBreak || false,
      })
      .select()
      .single()) as QueryResult<TimerStateRow>;

    if (error) {
      this.logger.error(`Failed to create timer state: ${error.message}`);
      throw new BadRequestException(
        `Failed to create timer state: ${error.message}`,
      );
    }

    const timerState = data as TimerStateRow;
    return {
      id: timerState.id,
      teamId: timerState.team_id,
      endTime: timerState.end_time,
      isRunning: timerState.is_running || false,
      isBreak: timerState.is_break || false,
      durationSeconds: timerState.duration_seconds || 0,
      createdAt: timerState.created_at,
      updatedAt: timerState.updated_at,
    };
  }

  async updateTimerState(
    timerId: string,
    userId: string,
    dto: UpdateTimerStateDto,
  ): Promise<TimerStateResponseDto> {
    const updateData: Record<string, unknown> = {};
    if (dto.endTime !== undefined) updateData.end_time = dto.endTime;
    if (dto.isRunning !== undefined) updateData.is_running = dto.isRunning;
    if (dto.isBreak !== undefined) updateData.is_break = dto.isBreak;
    if (dto.durationSeconds !== undefined)
      updateData.duration_seconds = dto.durationSeconds;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = (await this.db
      .from('orch_flow', 'timer_state')
      .update(updateData)
      .eq('id', timerId)
      .select()
      .single()) as QueryResult<TimerStateRow>;

    if (error) {
      this.logger.error(`Failed to update timer state: ${error.message}`);
      throw new BadRequestException(
        `Failed to update timer state: ${error.message}`,
      );
    }

    const updatedTimerState = data as TimerStateRow;
    return {
      id: updatedTimerState.id,
      teamId: updatedTimerState.team_id,
      endTime: updatedTimerState.end_time,
      isRunning: updatedTimerState.is_running || false,
      isBreak: updatedTimerState.is_break || false,
      durationSeconds: updatedTimerState.duration_seconds || 0,
      createdAt: updatedTimerState.created_at,
      updatedAt: updatedTimerState.updated_at,
    };
  }

  // ============================================================================
  // Profiles
  // ============================================================================

  async getProfiles(userIds?: string[]): Promise<ProfileResponseDto[]> {
    // User profiles are in public.users table (not profiles table)
    // Use the service client without schema() to access public schema
    let query = this.db
      .from('authz', 'users')
      .select('id, display_name, created_at, updated_at');

    if (userIds && userIds.length > 0) {
      query = query.in('id', userIds);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get profiles: ${error.message}`);
      throw new BadRequestException(`Failed to get profiles: ${error.message}`);
    }

    const users = (data as UserRow[] | null) || [];
    return users.map((user) => ({
      id: user.id,
      displayName: user.display_name,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }));
  }

  async getProfile(userId: string): Promise<ProfileResponseDto | null> {
    // User profiles are in public.users table (not profiles table)
    // Use the service client without schema() to access public schema
    const { data, error } = (await this.db
      .from('authz', 'users')
      .select('id, display_name, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle()) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get profile: ${error.message}`);
      throw new BadRequestException(`Failed to get profile: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const user = data as UserRow;
    return {
      id: user.id,
      displayName: user.display_name,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  // ============================================================================
  // Task Collaboration
  // ============================================================================

  async getTaskCollaborators(
    taskId: string,
    _userId: string,
  ): Promise<TaskCollaboratorResponseDto[]> {
    // Verify user has access to the task (via team membership)
    // For now, allow if user is authenticated - can add more checks later
    const { data, error } = (await this.db
      .from('orch_flow', 'task_collaborators')
      .select('*')
      .eq('task_id', taskId)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get task collaborators: ${error.message}`);
      throw new BadRequestException(
        `Failed to get task collaborators: ${error.message}`,
      );
    }

    const collaborators = (data as TaskCollaboratorRow[] | null) || [];
    return collaborators.map((c) => ({
      id: c.id,
      taskId: c.task_id,
      userId: c.user_id,
      guestName: c.guest_name,
      joinedAt: c.joined_at,
    }));
  }

  async createTaskCollaborator(
    taskId: string,
    userId: string,
    dto: CreateTaskCollaboratorDto,
  ): Promise<TaskCollaboratorResponseDto> {
    const { data, error } = (await this.db
      .from('orch_flow', 'task_collaborators')
      .insert({
        task_id: taskId,
        user_id: dto.userId || null,
        guest_name: dto.guestName || null,
      })
      .select()
      .single()) as QueryResult<TaskCollaboratorRow>;

    if (error) {
      this.logger.error(`Failed to create task collaborator: ${error.message}`);
      throw new BadRequestException(
        `Failed to create task collaborator: ${error.message}`,
      );
    }

    const collaborator = data as TaskCollaboratorRow;
    return {
      id: collaborator.id,
      taskId: collaborator.task_id,
      userId: collaborator.user_id,
      guestName: collaborator.guest_name,
      joinedAt: collaborator.joined_at,
    };
  }

  async deleteTaskCollaborator(
    collaboratorId: string,
    _userId: string,
  ): Promise<void> {
    const { error } = await this.db
      .from('orch_flow', 'task_collaborators')
      .delete()
      .eq('id', collaboratorId);

    if (error) {
      this.logger.error(`Failed to delete task collaborator: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete task collaborator: ${error.message}`,
      );
    }
  }

  async getTaskWatchers(
    taskId: string,
    _userId: string,
  ): Promise<TaskWatcherResponseDto[]> {
    const { data, error } = (await this.db
      .from('orch_flow', 'task_watchers')
      .select('*')
      .eq('task_id', taskId)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get task watchers: ${error.message}`);
      throw new BadRequestException(
        `Failed to get task watchers: ${error.message}`,
      );
    }

    const watchers = (data as TaskWatcherRow[] | null) || [];
    return watchers.map((w) => ({
      id: w.id,
      taskId: w.task_id,
      userId: w.user_id,
      guestName: w.guest_name,
      createdAt: w.created_at,
    }));
  }

  async createTaskWatcher(
    taskId: string,
    userId: string,
    dto: CreateTaskWatcherDto,
  ): Promise<TaskWatcherResponseDto> {
    // Check if already watching
    const { data: existing } = (await this.db
      .from('orch_flow', 'task_watchers')
      .select('id')
      .eq('task_id', taskId)
      .eq('user_id', dto.userId || null)
      .eq('guest_name', dto.guestName || null)
      .maybeSingle()) as QueryResult<unknown>;

    if (existing) {
      const existingWatcher = existing as Pick<TaskWatcherRow, 'id'>;
      return {
        id: existingWatcher.id,
        taskId,
        userId: dto.userId || null,
        guestName: dto.guestName || null,
        createdAt: new Date().toISOString(),
      };
    }

    const { data, error } = (await this.db
      .from('orch_flow', 'task_watchers')
      .insert({
        task_id: taskId,
        user_id: dto.userId || null,
        guest_name: dto.guestName || null,
      })
      .select()
      .single()) as QueryResult<TaskWatcherRow>;

    if (error) {
      this.logger.error(`Failed to create task watcher: ${error.message}`);
      throw new BadRequestException(
        `Failed to create task watcher: ${error.message}`,
      );
    }

    const watcher = data as TaskWatcherRow;
    return {
      id: watcher.id,
      taskId: watcher.task_id,
      userId: watcher.user_id,
      guestName: watcher.guest_name,
      createdAt: watcher.created_at,
    };
  }

  async deleteTaskWatcher(watcherId: string, _userId: string): Promise<void> {
    const { error } = await this.db
      .from('orch_flow', 'task_watchers')
      .delete()
      .eq('id', watcherId);

    if (error) {
      this.logger.error(`Failed to delete task watcher: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete task watcher: ${error.message}`,
      );
    }
  }

  async getTaskUpdateRequests(
    taskId: string,
    _userId: string,
  ): Promise<TaskUpdateRequestResponseDto[]> {
    const { data, error } = (await this.db
      .from('orch_flow', 'task_update_requests')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get task update requests: ${error.message}`);
      throw new BadRequestException(
        `Failed to get task update requests: ${error.message}`,
      );
    }

    const requests = (data as TaskUpdateRequestRow[] | null) || [];
    return requests.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      requestedByUserId: r.requested_by_user_id,
      requestedByGuest: r.requested_by_guest,
      message: r.message,
      createdAt: r.created_at,
      isResolved: r.is_resolved,
    }));
  }

  async createTaskUpdateRequest(
    taskId: string,
    userId: string,
    dto: CreateTaskUpdateRequestDto,
  ): Promise<TaskUpdateRequestResponseDto> {
    const { data, error } = (await this.db
      .from('orch_flow', 'task_update_requests')
      .insert({
        task_id: taskId,
        requested_by_user_id: dto.requestedByUserId || null,
        requested_by_guest: dto.requestedByGuest || null,
        message: dto.message || null,
        is_resolved: false,
      })
      .select()
      .single()) as QueryResult<TaskUpdateRequestRow>;

    if (error) {
      this.logger.error(
        `Failed to create task update request: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to create task update request: ${error.message}`,
      );
    }

    const request = data as TaskUpdateRequestRow;
    return {
      id: request.id,
      taskId: request.task_id,
      requestedByUserId: request.requested_by_user_id,
      requestedByGuest: request.requested_by_guest,
      message: request.message,
      createdAt: request.created_at,
      isResolved: request.is_resolved,
    };
  }

  async updateTaskUpdateRequest(
    requestId: string,
    userId: string,
    dto: UpdateTaskUpdateRequestDto,
  ): Promise<TaskUpdateRequestResponseDto> {
    const updateData: Record<string, unknown> = {};
    if (dto.isResolved !== undefined) updateData.is_resolved = dto.isResolved;
    if (dto.message !== undefined) updateData.message = dto.message;

    const { data, error } = (await this.db
      .from('orch_flow', 'task_update_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single()) as QueryResult<TaskUpdateRequestRow>;

    if (error) {
      this.logger.error(
        `Failed to update task update request: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to update task update request: ${error.message}`,
      );
    }

    const updatedRequest = data as TaskUpdateRequestRow;
    return {
      id: updatedRequest.id,
      taskId: updatedRequest.task_id,
      requestedByUserId: updatedRequest.requested_by_user_id,
      requestedByGuest: updatedRequest.requested_by_guest,
      message: updatedRequest.message,
      createdAt: updatedRequest.created_at,
      isResolved: updatedRequest.is_resolved,
    };
  }

  // ============================================================================
  // Channels
  // ============================================================================

  async getChannels(
    teamId: string,
    userId: string,
  ): Promise<ChannelResponseDto[]> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'channels')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get channels: ${error.message}`);
      throw new BadRequestException(`Failed to get channels: ${error.message}`);
    }

    const channels = (data as ChannelRow[] | null) || [];
    return channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      teamId: c.team_id,
      createdByUserId: c.created_by_user_id,
      createdByGuest: c.created_by_guest,
      createdAt: c.created_at,
    }));
  }

  async createChannel(
    teamId: string,
    userId: string,
    dto: CreateChannelDto,
  ): Promise<ChannelResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'channels')
      .insert({
        team_id: teamId,
        name: dto.name,
        description: dto.description || null,
        created_by_user_id: userId,
        created_by_guest: null,
      })
      .select()
      .single()) as QueryResult<ChannelRow>;

    if (error) {
      this.logger.error(`Failed to create channel: ${error.message}`);
      throw new BadRequestException(
        `Failed to create channel: ${error.message}`,
      );
    }

    const channel = data as ChannelRow;
    return {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      teamId: channel.team_id,
      createdByUserId: channel.created_by_user_id,
      createdByGuest: channel.created_by_guest,
      createdAt: channel.created_at,
    };
  }

  async deleteChannel(channelId: string, _userId: string): Promise<void> {
    const { error } = await this.db
      .from('orch_flow', 'channels')
      .delete()
      .eq('id', channelId);

    if (error) {
      this.logger.error(`Failed to delete channel: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete channel: ${error.message}`,
      );
    }
  }

  async getChannelMessages(
    channelId: string,
    _userId: string,
  ): Promise<ChannelMessageResponseDto[]> {
    const { data, error } = (await this.db
      .from('orch_flow', 'channel_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get channel messages: ${error.message}`);
      throw new BadRequestException(
        `Failed to get channel messages: ${error.message}`,
      );
    }

    const messages = (data as ChannelMessageRow[] | null) || [];
    return messages.map((m) => ({
      id: m.id,
      channelId: m.channel_id,
      content: m.content,
      userId: m.user_id,
      guestName: m.guest_name,
      createdAt: m.created_at,
    }));
  }

  async createChannelMessage(
    channelId: string,
    userId: string,
    dto: CreateChannelMessageDto,
  ): Promise<ChannelMessageResponseDto> {
    const { data, error } = (await this.db
      .from('orch_flow', 'channel_messages')
      .insert({
        channel_id: channelId,
        content: dto.content,
        user_id: dto.userId || null,
        guest_name: dto.guestName || null,
      })
      .select()
      .single()) as QueryResult<ChannelMessageRow>;

    if (error) {
      this.logger.error(`Failed to create channel message: ${error.message}`);
      throw new BadRequestException(
        `Failed to create channel message: ${error.message}`,
      );
    }

    const message = data as ChannelMessageRow;
    return {
      id: message.id,
      channelId: message.channel_id,
      content: message.content,
      userId: message.user_id,
      guestName: message.guest_name,
      createdAt: message.created_at,
    };
  }

  // ============================================================================
  // Journey Templates
  // ============================================================================

  async getJourneyTemplates(): Promise<JourneyTemplateResponseDto[]> {
    const { data, error } = (await this.db
      .from('orch_flow', 'journey_templates')
      .select('*')
      .eq('is_active', true)
      .order('name')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get journey templates: ${error.message}`);
      throw new BadRequestException(
        `Failed to get journey templates: ${error.message}`,
      );
    }

    const templates = (data as JourneyTemplateRow[] | null) || [];
    return templates.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      icon: t.icon,
      templateData: t.template_data,
      isActive: t.is_active,
      createdAt: t.created_at,
    }));
  }

  async getJourneyTemplateBySlug(
    slug: string,
  ): Promise<JourneyTemplateResponseDto> {
    const { data, error } = (await this.db
      .from('orch_flow', 'journey_templates')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()) as QueryResult<JourneyTemplateRow>;

    if (error) {
      this.logger.error(`Failed to get journey template: ${error.message}`);
      throw new NotFoundException(`Journey template not found: ${slug}`);
    }

    const template = data as JourneyTemplateRow;
    return {
      id: template.id,
      slug: template.slug,
      name: template.name,
      description: template.description,
      icon: template.icon,
      templateData: template.template_data,
      isActive: template.is_active,
      createdAt: template.created_at,
    };
  }

  // ============================================================================
  // Learning Progress
  // ============================================================================

  async getLearningProgress(
    userId: string,
  ): Promise<LearningProgressResponseDto[]> {
    const { data, error } = (await this.db
      .from('orch_flow', 'learning_progress')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get learning progress: ${error.message}`);
      throw new BadRequestException(
        `Failed to get learning progress: ${error.message}`,
      );
    }

    const progressRecords = (data as LearningProgressRow[] | null) || [];
    return progressRecords.map((p) => ({
      id: p.id,
      userId: p.user_id,
      organizationSlug: p.organization_slug,
      milestoneKey: p.milestone_key,
      completedAt: p.completed_at,
      notes: p.notes,
      createdAt: p.created_at,
    }));
  }

  async createOrUpdateLearningProgress(
    userId: string,
    dto: CreateLearningProgressDto | UpdateLearningProgressDto,
  ): Promise<LearningProgressResponseDto> {
    // These fields exist on both DTOs for lookup purposes
    const createDto = dto as CreateLearningProgressDto;

    // Check if exists
    const { data: existing } = (await this.db
      .from('orch_flow', 'learning_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_slug', createDto.organizationSlug)
      .eq('milestone_key', createDto.milestoneKey)
      .maybeSingle()) as QueryResult<unknown>;

    if (existing) {
      const existingProgress = existing as Pick<LearningProgressRow, 'id'>;
      const updateData: Record<string, unknown> = {};
      if (dto.completedAt !== undefined)
        updateData.completed_at = dto.completedAt || null;
      if (dto.notes !== undefined) updateData.notes = dto.notes || null;

      const { data, error } = (await this.db
        .from('orch_flow', 'learning_progress')
        .update(updateData)
        .eq('id', existingProgress.id)
        .select()
        .single()) as QueryResult<LearningProgressRow>;

      if (error) {
        this.logger.error(
          `Failed to update learning progress: ${error.message}`,
        );
        throw new BadRequestException(
          `Failed to update learning progress: ${error.message}`,
        );
      }

      const updatedProgress = data as LearningProgressRow;
      return {
        id: updatedProgress.id,
        userId: updatedProgress.user_id,
        organizationSlug: updatedProgress.organization_slug,
        milestoneKey: updatedProgress.milestone_key,
        completedAt: updatedProgress.completed_at,
        notes: updatedProgress.notes,
        createdAt: updatedProgress.created_at,
      };
    } else {
      const createDto = dto as CreateLearningProgressDto;
      const { data, error } = (await this.db
        .from('orch_flow', 'learning_progress')
        .insert({
          user_id: userId,
          organization_slug: createDto.organizationSlug,
          milestone_key: createDto.milestoneKey,
          completed_at: createDto.completedAt || null,
          notes: createDto.notes || null,
        })
        .select()
        .single()) as QueryResult<LearningProgressRow>;

      if (error) {
        this.logger.error(
          `Failed to create learning progress: ${error.message}`,
        );
        throw new BadRequestException(
          `Failed to create learning progress: ${error.message}`,
        );
      }

      const newProgress = data as LearningProgressRow;
      return {
        id: newProgress.id,
        userId: newProgress.user_id,
        organizationSlug: newProgress.organization_slug,
        milestoneKey: newProgress.milestone_key,
        completedAt: newProgress.completed_at,
        notes: newProgress.notes,
        createdAt: newProgress.created_at,
      };
    }
  }

  // ============================================================================
  // Global Presence
  // ============================================================================

  async sendPresenceHeartbeat(userId: string): Promise<void> {
    const { error } = await this.db
      .from('orch_flow', 'user_presence')
      .upsert(
        { user_id: userId, last_active_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    if (error) {
      this.logger.error(`Failed to send heartbeat: ${error.message}`);
      throw new BadRequestException(
        `Failed to send heartbeat: ${error.message}`,
      );
    }
  }

  async getOnlineUsers(): Promise<string[]> {
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();

    const { data, error } = (await this.db
      .from('orch_flow', 'user_presence')
      .select('user_id')
      .gte('last_active_at', cutoff)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get online users: ${error.message}`);
      throw new BadRequestException(
        `Failed to get online users: ${error.message}`,
      );
    }

    return (data as { user_id: string }[] | null)?.map((r) => r.user_id) || [];
  }

  // ============================================================================
  // Global Timer
  // ============================================================================

  async getGlobalTimerState(): Promise<TimerStateResponseDto | null> {
    const { data, error } = (await this.db
      .from('orch_flow', 'timer_state')
      .select('*')
      .is('team_id', null)
      .limit(1)
      .maybeSingle()) as QueryResult<TimerStateRow>;

    if (error) {
      this.logger.error(`Failed to get global timer state: ${error.message}`);
      throw new BadRequestException(
        `Failed to get global timer state: ${error.message}`,
      );
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      teamId: data.team_id,
      endTime: data.end_time,
      isRunning: data.is_running || false,
      isBreak: data.is_break || false,
      durationSeconds: data.duration_seconds || 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async createGlobalTimerState(
    dto: CreateTimerStateDto,
  ): Promise<TimerStateResponseDto> {
    const { data, error } = (await this.db
      .from('orch_flow', 'timer_state')
      .insert({
        team_id: null,
        duration_seconds: dto.durationSeconds,
        is_running: dto.isRunning || false,
        is_break: dto.isBreak || false,
      })
      .select()
      .single()) as QueryResult<TimerStateRow>;

    if (error) {
      this.logger.error(
        `Failed to create global timer state: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to create global timer state: ${error.message}`,
      );
    }

    const timerState = data as TimerStateRow;
    return {
      id: timerState.id,
      teamId: timerState.team_id,
      endTime: timerState.end_time,
      isRunning: timerState.is_running || false,
      isBreak: timerState.is_break || false,
      durationSeconds: timerState.duration_seconds || 0,
      createdAt: timerState.created_at,
      updatedAt: timerState.updated_at,
    };
  }

  // ============================================================================
  // Personal Cross-Team Tasks
  // ============================================================================

  async getMyTasks(
    userId: string,
    statuses: string[],
  ): Promise<SharedTaskResponseDto[]> {
    let query = this.db
      .from('orch_flow', 'shared_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (statuses.length > 0) {
      query = query.in('status', statuses);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get my tasks: ${error.message}`);
      throw new BadRequestException(`Failed to get my tasks: ${error.message}`);
    }

    const tasks = (data as SharedTaskRow[] | null) || [];
    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      isCompleted: task.is_completed || false,
      assignedTo: task.assigned_to,
      userId: task.user_id,
      status: task.status,
      createdAt: task.created_at,
      parentTaskId: task.parent_task_id,
      pomodoroCount: task.pomodoro_count || 0,
      projectId: task.project_id,
      sprintId: task.sprint_id,
      dueDate: task.due_date,
      teamId: task.team_id,
      description: task.description,
      channelId: task.channel_id,
      sourceChannelUserId: task.source_channel_user_id,
    }));
  }

  // ============================================================================
  // Team Files (Documents)
  // ============================================================================

  private mapTeamFileRow(row: TeamFileRow): TeamFileResponseDto {
    return {
      id: row.id,
      teamId: row.team_id,
      parentId: row.parent_id,
      name: row.name,
      isFolder: row.is_folder,
      content: row.content,
      fileType: row.file_type,
      sizeBytes: row.size_bytes,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getTeamFiles(
    teamId: string,
    userId: string,
  ): Promise<TeamFileResponseDto[]> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'team_files')
      .select(
        'id, team_id, parent_id, name, is_folder, file_type, size_bytes, created_by_user_id, created_at, updated_at',
      )
      .eq('team_id', teamId)
      .order('is_folder', { ascending: false })
      .order('name', { ascending: true })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get team files: ${error.message}`);
      throw new BadRequestException(
        `Failed to get team files: ${error.message}`,
      );
    }

    const rows = (data as TeamFileRow[] | null) || [];
    return rows.map((row) => this.mapTeamFileRow({ ...row, content: null }));
  }

  async getTeamFile(
    teamId: string,
    fileId: string,
    userId: string,
  ): Promise<TeamFileResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'team_files')
      .select('*')
      .eq('id', fileId)
      .eq('team_id', teamId)
      .single()) as QueryResult<TeamFileRow>;

    if (error || !data) {
      throw new NotFoundException(`Team file not found: ${fileId}`);
    }

    return this.mapTeamFileRow(data);
  }

  async createTeamFile(
    teamId: string,
    userId: string,
    dto: CreateTeamFileDto,
  ): Promise<TeamFileResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    const { data, error } = (await this.db
      .from('orch_flow', 'team_files')
      .insert({
        team_id: teamId,
        parent_id: dto.parentId || null,
        name: dto.name,
        is_folder: dto.isFolder,
        content: dto.content || null,
        file_type: dto.fileType || 'markdown',
        size_bytes: dto.content ? dto.content.length : 0,
        created_by_user_id: userId,
      })
      .select()
      .single()) as QueryResult<TeamFileRow>;

    if (error || !data) {
      this.logger.error(`Failed to create team file: ${error?.message}`);
      throw new BadRequestException(
        `Failed to create team file: ${error?.message}`,
      );
    }

    return this.mapTeamFileRow(data);
  }

  async updateTeamFile(
    teamId: string,
    fileId: string,
    userId: string,
    dto: UpdateTeamFileDto,
  ): Promise<TeamFileResponseDto> {
    await this.verifyTeamMember(userId, teamId);

    const updateFields: Record<string, unknown> = {};
    if (dto.name !== undefined) updateFields.name = dto.name;
    if (dto.parentId !== undefined) updateFields.parent_id = dto.parentId;
    if (dto.content !== undefined) {
      updateFields.content = dto.content;
      updateFields.size_bytes = dto.content.length;
    }

    const { data, error } = (await this.db
      .from('orch_flow', 'team_files')
      .update(updateFields)
      .eq('id', fileId)
      .eq('team_id', teamId)
      .select()
      .single()) as QueryResult<TeamFileRow>;

    if (error || !data) {
      this.logger.error(`Failed to update team file: ${error?.message}`);
      throw new BadRequestException(
        `Failed to update team file: ${error?.message}`,
      );
    }

    return this.mapTeamFileRow(data);
  }

  async deleteTeamFile(
    teamId: string,
    fileId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyTeamMember(userId, teamId);

    const { error } = await this.db
      .from('orch_flow', 'team_files')
      .delete()
      .eq('id', fileId)
      .eq('team_id', teamId);

    if (error) {
      this.logger.error(`Failed to delete team file: ${error.message}`);
      throw new BadRequestException(
        `Failed to delete team file: ${error.message}`,
      );
    }
  }
}
