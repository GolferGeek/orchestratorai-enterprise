import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_SERVICE, DatabaseService } from '../database';
import {
  AddWorkTaskCommentInput,
  CreateWorkTaskInput,
  CreatedWorkTask,
  UpdateWorkTaskStatusInput,
  WorkTaskSink,
} from './work-task-sink.interface';

interface CreatedFlowTaskRow {
  id: string;
  title: string;
}

interface FlowTaskChannelRow {
  channel_id: string | null;
}

@Injectable()
export class FlowSupabaseTaskSinkService implements WorkTaskSink {
  private readonly logger = new Logger(FlowSupabaseTaskSinkService.name);
  private readonly defaultTeamId: string;
  private readonly defaultChannelId: string;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTeamId = this.configService.get<string>(
      'FLOW_DEFAULT_TEAM_ID',
      '',
    );
    this.defaultChannelId = this.configService.get<string>(
      'FLOW_DEFAULT_CHANNEL_ID',
      '',
    );
  }

  async createTask(input: CreateWorkTaskInput): Promise<CreatedWorkTask> {
    const teamId = input.teamId || this.defaultTeamId;
    const channelId = input.channelId || this.defaultChannelId;

    if (!input.title) {
      throw new Error('title is required');
    }
    if (!teamId) {
      throw new Error(
        'teamId is required (pass it or set FLOW_DEFAULT_TEAM_ID)',
      );
    }

    const result = await this.db
      .from('orch_flow', 'shared_tasks')
      .insert({
        title: input.title,
        description: input.description || null,
        status: 'in_progress',
        assigned_to: input.assignedTo || 'Claude',
        team_id: teamId,
        channel_id: channelId || null,
        source_channel_user_id: input.sourceChannelUserId || null,
        is_completed: false,
        pomodoro_count: 0,
      })
      .select('id, title')
      .single();

    if (result.error || !result.data) {
      const message = result.error?.message ?? 'No task row returned';
      this.logger.error(`Failed to create task: ${message}`);
      throw new Error(`Failed to create task: ${message}`);
    }

    const data = result.data as CreatedFlowTaskRow;
    this.logger.log(`Task created via Flow sink: ${data.id} — ${data.title}`);

    if (channelId) {
      await this.db.from('orch_flow', 'channel_messages').insert({
        channel_id: channelId,
        content: `New task created: **${input.title}**\n\n${input.description || ''}`,
        guest_name: 'OpenClaw',
      });
    }

    return {
      id: data.id,
      title: data.title,
      provider: 'flow',
    };
  }

  async updateTaskStatus(input: UpdateWorkTaskStatusInput): Promise<void> {
    if (!input.taskId || !input.status) {
      throw new Error('taskId and status are required');
    }

    const { error } = await this.db
      .from('orch_flow', 'shared_tasks')
      .update({
        status: input.status,
        is_completed: input.status === 'done',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.taskId);

    if (error) {
      throw new Error(`Failed to update Flow task status: ${error.message}`);
    }
  }

  async addTaskComment(input: AddWorkTaskCommentInput): Promise<void> {
    if (!input.taskId || !input.comment) {
      throw new Error('taskId and comment are required');
    }

    const lookupResult = await this.db
      .from('orch_flow', 'shared_tasks')
      .select('channel_id')
      .eq('id', input.taskId)
      .single();

    if (lookupResult.error || !lookupResult.data) {
      throw new Error(
        `Failed to fetch Flow task channel: ${lookupResult.error?.message ?? 'No task row returned'}`,
      );
    }

    const channelId = (lookupResult.data as FlowTaskChannelRow)?.channel_id;
    if (!channelId) {
      throw new Error(
        `Flow task ${input.taskId} has no channel_id; cannot attach comment message`,
      );
    }

    const { error: insertError } = await this.db
      .from('orch_flow', 'channel_messages')
      .insert({
        channel_id: channelId,
        content: input.comment,
        guest_name: 'OpenClaw',
      });

    if (insertError) {
      throw new Error(
        `Failed to post Flow task comment: ${insertError.message}`,
      );
    }
  }
}
