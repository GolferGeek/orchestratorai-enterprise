import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../planes/supabase-core/supabase.service';
import {
  CreateAdoShadowTaskInput,
  CreatedAdoShadowTask,
  DatabaseProvider,
  IdentityLinkLookupInput,
  IdentityLinkUpsertInput,
} from './database-provider.interface';

interface IdentityLinkRow {
  user_id: string;
}

interface AdoMappingRow {
  external_task_id: string | null;
}

@Injectable()
export class SupabaseDatabaseProviderService implements DatabaseProvider {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findIdentityLinkUserId(
    input: IdentityLinkLookupInput,
  ): Promise<string | null> {
    const client = this.supabaseService.getServiceClient();
    const { data, error } = await client
      .schema('authz')
      .from('auth_identity_links')
      .select('user_id')
      .eq('issuer', input.issuer)
      .eq('subject', input.subject)
      .maybeSingle<IdentityLinkRow>();

    if (error) {
      throw new Error(`Failed to resolve identity link: ${error.message}`);
    }

    return data?.user_id ?? null;
  }

  async upsertIdentityLink(input: IdentityLinkUpsertInput): Promise<void> {
    const client = this.supabaseService.getServiceClient();
    const { error } = await client
      .schema('authz')
      .from('auth_identity_links')
      .upsert(
        {
          user_id: input.userId,
          issuer: input.issuer,
          subject: input.subject,
          email: input.email,
          raw_claims: input.rawClaims,
        },
        {
          onConflict: 'issuer,subject',
        },
      );

    if (error) {
      throw new Error(`Failed to upsert identity link: ${error.message}`);
    }
  }

  async createAdoShadowTask(
    input: CreateAdoShadowTaskInput,
  ): Promise<CreatedAdoShadowTask> {
    const client = this.supabaseService.getServiceClient();
    const { data, error } = await client
      .schema('orch_flow')
      .from('shared_tasks')
      .insert({
        title: input.title,
        description: input.description,
        status: 'in_progress',
        assigned_to: input.assignedTo,
        team_id: input.teamId,
        channel_id: input.channelId,
        source_channel_user_id: input.sourceChannelUserId,
        is_completed: false,
        pomodoro_count: 0,
        external_provider: 'ado',
        external_task_id: input.externalTaskId,
      })
      .select('id, title')
      .single<CreatedAdoShadowTask>();

    if (error || !data) {
      const message = error?.message ?? 'No task row returned';
      throw new Error(`Failed to persist ADO task mapping: ${message}`);
    }

    return data;
  }

  async findAdoExternalTaskIdByInternalId(
    taskId: string,
  ): Promise<string | null> {
    const client = this.supabaseService.getServiceClient();
    const { data, error } = await client
      .schema('orch_flow')
      .from('shared_tasks')
      .select('external_task_id')
      .eq('id', taskId)
      .eq('external_provider', 'ado')
      .single<AdoMappingRow>();

    if (error) {
      throw new Error(
        `Failed to resolve ADO task mapping for ${taskId}: ${error.message}`,
      );
    }

    return data?.external_task_id ?? null;
  }

  async updateAdoShadowTaskStatus(
    taskId: string,
    status: string,
  ): Promise<void> {
    const client = this.supabaseService.getServiceClient();
    const { error } = await client
      .schema('orch_flow')
      .from('shared_tasks')
      .update({
        status,
        is_completed: status === 'done' || status === 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
      throw new Error(
        `ADO status updated but failed to sync local task status: ${error.message}`,
      );
    }
  }
}
