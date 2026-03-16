import { Injectable, Inject } from '@nestjs/common';
import {
  MESSAGING_DATABASE_SERVICE,
  MessagingDatabaseService,
  QueryResult,
} from './messaging-database.interface';
import {
  OpenClawBridgePersistence,
  OpenClawCreatedTask,
  OpenClawHistoryMessage,
} from './openclaw-bridge-persistence.interface';

@Injectable()
export class OpenClawBridgeSupabasePersistenceService
  implements OpenClawBridgePersistence
{
  constructor(
    @Inject(MESSAGING_DATABASE_SERVICE)
    private readonly db: MessagingDatabaseService,
  ) {}

  async getRecentHistory(
    channelUserId: string,
    maxMessages: number,
  ): Promise<OpenClawHistoryMessage[]> {
    const { data } = (await this.db
      .from(null, 'channel_message_log')
      .select('direction, message_text')
      .eq('channel_user_id', channelUserId)
      .order('created_at', { ascending: false })
      .limit(maxMessages)) as QueryResult<unknown>;

    if (!data || (data as unknown[]).length === 0) {
      return [];
    }

    return data as unknown as OpenClawHistoryMessage[];
  }

  async createFlowTask(input: {
    title: string;
    description: string;
    channelUserId: string;
    teamId: string | null;
    channelId: string | null;
  }): Promise<OpenClawCreatedTask> {
    const { data, error } = (await this.db
      .from('orch_flow', 'shared_tasks')
      .insert({
        title: input.title,
        description: input.description,
        status: 'in_progress',
        assigned_to: 'Claude',
        team_id: input.teamId,
        channel_id: input.channelId,
        source_channel_user_id: input.channelUserId,
        is_completed: false,
        pomodoro_count: 0,
      })
      .select('id, title')
      .single()) as QueryResult<unknown>;

    if (error || !data) {
      throw new Error(
        `Failed to create Flow task: ${error?.message ?? 'unknown error'}`,
      );
    }

    return data as unknown as OpenClawCreatedTask;
  }

  async postChannelMessage(input: {
    channelId: string;
    content: string;
    guestName: string;
  }): Promise<void> {
    const { error } = (await this.db
      .from('orch_flow', 'channel_messages')
      .insert({
        channel_id: input.channelId,
        content: input.content,
        guest_name: input.guestName,
      })) as QueryResult<unknown>;

    if (error) {
      throw new Error(`Failed to post channel message: ${error.message}`);
    }
  }
}
