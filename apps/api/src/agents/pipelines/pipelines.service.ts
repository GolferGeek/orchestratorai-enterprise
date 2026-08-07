import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type { DatabaseService } from '@orchestrator-ai/transport-types';
import {
  validateSavePipelineInput,
  type SavePipelineInput,
} from './pipeline-validation';

export interface AgentPipelineRecord extends SavePipelineInput {
  id: string;
  createdAt: string;
}

@Injectable()
export class PipelinesService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async save(
    context: ExecutionContext,
    input: SavePipelineInput,
  ): Promise<AgentPipelineRecord> {
    const id = randomUUID();
    const result = (await this.db
      .from(null, 'agent_pipelines')
      .insert({
        id,
        organization_slug: context.orgSlug,
        user_id: context.userId,
        name: input.name,
        runners: input.runners,
      })
      .select('id, name, runners, created_at')
      .single()) as {
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    };
    if (result.error) {
      throw new Error(`Failed to save pipeline: ${result.error.message}`);
    }
    if (!result.data) {
      throw new Error('Failed to save pipeline: no data returned');
    }
    return this.parseRow(result.data);
  }

  async list(
    userId: string,
    organizationSlug: string,
  ): Promise<AgentPipelineRecord[]> {
    let query = this.db
      .from(null, 'agent_pipelines')
      .select('id, name, runners, created_at')
      .eq('user_id', userId);
    if (organizationSlug !== '*') {
      query = query.eq('organization_slug', organizationSlug);
    }
    const result = (await query.order('created_at', { ascending: false })) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (result.error) {
      throw new Error(`Failed to load pipelines: ${result.error.message}`);
    }
    if (!Array.isArray(result.data)) {
      throw new Error('Failed to load pipelines: invalid database response');
    }
    return result.data.map((row) =>
      this.parseRow(row as Record<string, unknown>),
    );
  }

  private parseRow(row: Record<string, unknown>): AgentPipelineRecord {
    const validation = validateSavePipelineInput({
      name: row.name,
      runners: row.runners,
    });
    if (!validation.valid) {
      throw new Error(`Stored pipeline is invalid: ${validation.message}`);
    }
    return {
      id: requireUuid(row.id, 'pipeline.id'),
      name: validation.input.name,
      runners: validation.input.runners,
      createdAt: requireTimestamp(row.created_at, 'pipeline.created_at'),
    };
  }
}

function requireUuid(value: unknown, field: string): string {
  const uuid = requireString(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      uuid,
    )
  ) {
    throw new Error(`${field} must be a UUID`);
  }
  return uuid;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  const timestamp = requireString(value, field);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return timestamp;
}
