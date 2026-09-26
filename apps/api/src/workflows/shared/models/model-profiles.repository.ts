import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import {
  MissingModelProfileError,
  type ModelProfileRecord,
  type RunModelProfile,
} from './model-profile.types';

/** The model is not one the platform knows (llm_models). */
export class UnknownModelError extends Error {
  constructor(provider: string, model: string) {
    super(`Unknown model "${model}" for provider "${provider}"`);
    this.name = 'UnknownModelError';
  }
}

function toRecord(row: Record<string, unknown>): ModelProfileRecord {
  const text = (key: string): string => {
    const value = row[key];
    if (typeof value !== 'string' || value === '') {
      throw new Error(`workflows.model_profiles.${key} is missing or not text`);
    }
    return value;
  };
  const updatedAt = row.updated_at;
  return {
    id: text('id'),
    organizationSlug: text('organization_slug'),
    workflowSlug: text('workflow_slug'),
    role: text('role'),
    provider: text('provider'),
    model: text('model'),
    updatedBy: typeof row.updated_by === 'string' ? row.updated_by : null,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
  };
}

@Injectable()
export class ModelProfilesRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async list(organizationSlug: string, workflowSlug?: string): Promise<ModelProfileRecord[]> {
    let query = this.db
      .from('workflows', 'model_profiles')
      .select('*')
      .eq('organization_slug', organizationSlug);
    if (workflowSlug) query = query.eq('workflow_slug', workflowSlug);
    const { data, error } = await query.order('workflow_slug').order('role');
    if (error) throw new Error(`Failed to list model profiles: ${error.message}`);
    return this.rows(data).map(toRecord);
  }

  async upsert(profile: {
    organizationSlug: string;
    workflowSlug: string;
    role: string;
    provider: string;
    model: string;
    updatedBy: string;
  }): Promise<ModelProfileRecord> {
    const { data, error } = await this.db
      .from('workflows', 'model_profiles')
      .upsert(
        {
          organization_slug: profile.organizationSlug,
          workflow_slug: profile.workflowSlug,
          role: profile.role,
          provider: profile.provider,
          model: profile.model,
          updated_by: profile.updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_slug,workflow_slug,role' },
      )
      .select();
    if (error) {
      if (error.message.includes('model_profiles_known_model')) {
        throw new UnknownModelError(profile.provider, profile.model);
      }
      throw new Error(`Failed to save model profile: ${error.message}`);
    }
    const row = this.rows(data)[0];
    if (!row) throw new Error('Saving a model profile returned no row');
    return toRecord(row);
  }

  async delete(organizationSlug: string, id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('workflows', 'model_profiles')
      .delete()
      .eq('id', id)
      .eq('organization_slug', organizationSlug)
      .select('id');
    if (error) throw new Error(`Failed to delete model profile ${id}: ${error.message}`);
    return this.rows(data).length > 0;
  }

  /**
   * The snapshot a run starts with. Every role must be configured for the
   * org; there is no default model.
   */
  async snapshot(
    organizationSlug: string,
    workflowSlug: string,
    roles: readonly string[],
  ): Promise<RunModelProfile> {
    if (roles.length === 0) return {};
    const configured = await this.list(organizationSlug, workflowSlug);
    const profile: RunModelProfile = {};
    const missing: string[] = [];
    for (const role of roles) {
      const row = configured.find((candidate) => candidate.role === role);
      if (row) profile[role] = { provider: row.provider, model: row.model };
      else missing.push(role);
    }
    if (missing.length > 0) {
      throw new MissingModelProfileError(workflowSlug, organizationSlug, missing);
    }
    return profile;
  }

  private rows(data: unknown): Record<string, unknown>[] {
    if (!Array.isArray(data)) throw new Error('workflows.model_profiles query returned no row set');
    return data as Record<string, unknown>[];
  }
}
