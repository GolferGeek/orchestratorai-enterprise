import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import { toAgentDefinition, type AgentDefinition } from './agent-definition.types';

@Injectable()
export class AgentDefinitionsRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /** Every definition, as stored (no org overrides). */
  async listAll(): Promise<AgentDefinition[]> {
    const { data, error } = await this.db
      .from('workflows', 'agent_definitions')
      .select('*')
      .order('slug');
    if (error) throw new Error(`Failed to list agent definitions: ${error.message}`);
    return this.rows(data).map(toAgentDefinition);
  }

  /**
   * The definition as an org sees it: its instructions override applied, and
   * disabled if either the agent or the org's override disables it. Null when
   * no such agent exists.
   */
  async getForOrg(slug: string, organizationSlug: string): Promise<AgentDefinition | null> {
    const [definition, override] = await Promise.all([
      this.db.from('workflows', 'agent_definitions').select('*').eq('slug', slug),
      this.db
        .from('workflows', 'agent_definition_org_overrides')
        .select('instructions_override, enabled')
        .eq('agent_slug', slug)
        .eq('organization_slug', organizationSlug),
    ]);
    if (definition.error) throw new Error(`Failed to read agent ${slug}: ${definition.error.message}`);
    if (override.error) {
      throw new Error(`Failed to read agent ${slug}'s override for ${organizationSlug}: ${override.error.message}`);
    }
    const row = this.rows(definition.data)[0];
    if (!row) return null;
    const agent = toAgentDefinition(row);
    const orgOverride = this.rows(override.data)[0];
    if (!orgOverride) return agent;
    const instructions = orgOverride.instructions_override;
    return {
      ...agent,
      instructions: typeof instructions === 'string' ? instructions : agent.instructions,
      enabled: agent.enabled && orgOverride.enabled === true,
    };
  }

  private rows(data: unknown): Record<string, unknown>[] {
    if (!Array.isArray(data)) throw new Error('workflows agent query returned no row set');
    return data as Record<string, unknown>[];
  }
}
