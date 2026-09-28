import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type WorkflowAdminAgentChange,
  type WorkflowAdminAgentView,
} from '@orchestrator-ai/transport-types';

type Row = Record<string, unknown>;

function rows(data: unknown, what: string): Row[] {
  if (!Array.isArray(data)) throw new Error(`${what} returned no row set`);
  return data as Row[];
}

/**
 * The agents a workflow runs, and an org's own instructions for them. The
 * definition stays shared; the org's override is what its runs use
 * (AgentDefinitionsRepository.getForOrg). Every change is kept in history.
 */
@Injectable()
export class AgentOverridesRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async forWorkflow(workflowSlug: string, organizationSlug: string): Promise<WorkflowAdminAgentView[]> {
    const links = await this.db.from('workflows', 'agent_definition_links').select('agent_slug, purpose').eq('workflow_slug', workflowSlug);
    if (links.error) throw new Error(`Failed to read the agents of ${workflowSlug}: ${links.error.message}`);
    const linked = rows(links.data, 'agent links');
    if (!linked.length) return [];
    const slugs = linked.map((l) => String(l.agent_slug));
    const [definitions, overrides] = await Promise.all([
      this.db.from('workflows', 'agent_definitions').select('slug, name, description, instructions, model_role').in('slug', slugs),
      this.db.from('workflows', 'agent_definition_org_overrides').select('agent_slug, instructions_override, updated_at').eq('organization_slug', organizationSlug).in('agent_slug', slugs),
    ]);
    if (definitions.error) throw new Error(`Failed to read agent definitions: ${definitions.error.message}`);
    if (overrides.error) throw new Error(`Failed to read ${organizationSlug}'s agent overrides: ${overrides.error.message}`);
    const bySlug = new Map(rows(definitions.data, 'agent definitions').map((d) => [String(d.slug), d]));
    const overrideBySlug = new Map(rows(overrides.data, 'agent overrides').map((o) => [String(o.agent_slug), o]));
    return linked
      .map((link) => {
        const slug = String(link.agent_slug);
        const d = bySlug.get(slug);
        if (!d) throw new Error(`Workflow ${workflowSlug} links agent ${slug}, which does not exist`);
        const o = overrideBySlug.get(slug);
        const override = o && typeof o.instructions_override === 'string' ? o.instructions_override : null;
        return {
          slug,
          name: String(d.name),
          description: typeof d.description === 'string' ? d.description : null,
          modelRole: String(d.model_role),
          purpose: String(link.purpose),
          defaultInstructions: String(d.instructions),
          overrideInstructions: override,
          overrideUpdatedAt: override && o ? String(o.updated_at) : null,
        };
      })
      .sort((a, b) => a.purpose.localeCompare(b.purpose) || a.name.localeCompare(b.name));
  }

  /** Set the org's instructions for an agent, or (null) go back to the default. */
  async save(agentSlug: string, organizationSlug: string, instructions: string | null, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (instructions === null) {
        const { error } = await tx.from('workflows', 'agent_definition_org_overrides').delete().eq('agent_slug', agentSlug).eq('organization_slug', organizationSlug);
        if (error) throw new Error(`Failed to reset ${agentSlug}: ${error.message}`);
      } else {
        const { error } = await tx.from('workflows', 'agent_definition_org_overrides').upsert(
          { agent_slug: agentSlug, organization_slug: organizationSlug, instructions_override: instructions, enabled: true, updated_by: userId, updated_at: new Date().toISOString() },
          { onConflict: 'agent_slug,organization_slug' },
        );
        if (error) throw new Error(`Failed to save ${agentSlug}'s instructions: ${error.message}`);
      }
      const { error } = await tx.from('workflows', 'agent_definition_override_history').insert({ agent_slug: agentSlug, organization_slug: organizationSlug, instructions, changed_by: userId });
      if (error) throw new Error(`Failed to record the change to ${agentSlug}: ${error.message}`);
    });
  }

  async history(agentSlug: string, organizationSlug: string): Promise<WorkflowAdminAgentChange[]> {
    const { data, error } = await this.db
      .from('workflows', 'agent_definition_override_history')
      .select('instructions, changed_by, changed_at')
      .eq('agent_slug', agentSlug)
      .eq('organization_slug', organizationSlug)
      .order('changed_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`Failed to read ${agentSlug}'s history: ${error.message}`);
    return rows(data, 'agent history').map((r) => ({
      instructions: typeof r.instructions === 'string' ? r.instructions : null,
      changedBy: typeof r.changed_by === 'string' ? r.changed_by : null,
      changedAt: String(r.changed_at),
    }));
  }
}
