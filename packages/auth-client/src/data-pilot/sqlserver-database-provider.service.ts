import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '@orchestratorai/planes/database';
import {
  CreateAdoShadowTaskInput,
  CreatedAdoShadowTask,
  DatabaseProvider,
  IdentityLinkLookupInput,
  IdentityLinkUpsertInput,
} from './database-provider.interface';

@Injectable()
export class SqlServerDatabaseProviderService implements DatabaseProvider {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async findIdentityLinkUserId(
    input: IdentityLinkLookupInput,
  ): Promise<string | null> {
    const result = await this.db.rawQuery(
      `SELECT TOP 1 user_id FROM authz.identity_links WHERE issuer = $1 AND subject = $2`,
      [input.issuer, input.subject],
    );

    if (result.error) {
      throw new Error(
        `Failed to resolve identity link: ${result.error.message}`,
      );
    }

    const rows = result.data as Array<{ user_id: string }> | null;
    return rows?.[0]?.user_id ?? null;
  }

  async upsertIdentityLink(input: IdentityLinkUpsertInput): Promise<void> {
    const result = await this.db.rawQuery(
      `MERGE authz.identity_links AS target
       USING (SELECT $1 AS user_id, $2 AS issuer, $3 AS subject, $4 AS email, $5 AS raw_claims) AS source
       ON target.issuer = source.issuer AND target.subject = source.subject
       WHEN MATCHED THEN
         UPDATE SET user_id = source.user_id, email = source.email, raw_claims = source.raw_claims, updated_at = GETUTCDATE()
       WHEN NOT MATCHED THEN
         INSERT (user_id, issuer, subject, email, raw_claims)
         VALUES (source.user_id, source.issuer, source.subject, source.email, source.raw_claims);`,
      [
        input.userId,
        input.issuer,
        input.subject,
        input.email,
        JSON.stringify(input.rawClaims),
      ],
    );

    if (result.error) {
      throw new Error(
        `Failed to upsert identity link: ${result.error.message}`,
      );
    }
  }

  async createAdoShadowTask(
    input: CreateAdoShadowTaskInput,
  ): Promise<CreatedAdoShadowTask> {
    const result = await this.db.rawQuery(
      `INSERT INTO orch_flow.shared_tasks (
         title,
         description,
         status,
         assigned_to,
         team_id,
         channel_id,
         source_channel_user_id,
         is_completed,
         pomodoro_count,
         external_provider,
         external_task_id
       )
       OUTPUT inserted.id, inserted.title
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.title,
        input.description,
        'in_progress',
        input.assignedTo,
        input.teamId,
        input.channelId,
        input.sourceChannelUserId,
        false,
        0,
        'ado',
        input.externalTaskId,
      ],
    );

    if (result.error) {
      throw new Error(
        `Failed to persist ADO task mapping: ${result.error.message}`,
      );
    }

    const rows = result.data as Array<CreatedAdoShadowTask> | null;
    const created = rows?.[0];
    if (!created) {
      throw new Error(
        'Failed to persist ADO task mapping: No task row returned',
      );
    }

    return created;
  }

  async findAdoExternalTaskIdByInternalId(
    taskId: string,
  ): Promise<string | null> {
    const result = await this.db.rawQuery(
      `SELECT TOP 1 external_task_id FROM orch_flow.shared_tasks WHERE id = $1 AND external_provider = $2`,
      [taskId, 'ado'],
    );

    if (result.error) {
      throw new Error(
        `Failed to resolve ADO task mapping for ${taskId}: ${result.error.message}`,
      );
    }

    const rows = result.data as Array<{
      external_task_id: string | null;
    }> | null;
    return rows?.[0]?.external_task_id ?? null;
  }

  async updateAdoShadowTaskStatus(
    taskId: string,
    status: string,
  ): Promise<void> {
    const result = await this.db.rawQuery(
      `UPDATE orch_flow.shared_tasks
       SET status = $1, is_completed = $2, updated_at = GETUTCDATE()
       WHERE id = $3`,
      [status, status === 'done' || status === 'completed', taskId],
    );

    if (result.error) {
      throw new Error(
        `ADO status update failed for task ${taskId}: ${result.error.message}`,
      );
    }
  }
}
