import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '../planes/database/database.interface';
import {
  CreateAdoShadowTaskInput,
  CreatedAdoShadowTask,
  DatabaseProvider,
  IdentityLinkLookupInput,
  IdentityLinkUpsertInput,
} from './database-provider.interface';

@Injectable()
export class PostgresqlDatabaseProviderService implements DatabaseProvider {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async findIdentityLinkUserId(
    input: IdentityLinkLookupInput,
  ): Promise<string | null> {
    const result = await this.db.rawQuery(
      `SELECT user_id FROM authz.auth_identity_links WHERE issuer = $1 AND subject = $2 LIMIT 1`,
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
      `INSERT INTO authz.auth_identity_links (user_id, issuer, subject, email, raw_claims)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (issuer, subject)
       DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email, raw_claims = EXCLUDED.raw_claims, updated_at = NOW()`,
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, title`,
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
      `SELECT external_task_id FROM orch_flow.shared_tasks WHERE id = $1 AND external_provider = $2 LIMIT 1`,
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
       SET status = $1, is_completed = $2, updated_at = NOW()
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
