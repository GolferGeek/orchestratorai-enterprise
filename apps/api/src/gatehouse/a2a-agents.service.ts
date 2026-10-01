import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { A2AAgentConfig } from '../agents/invoke/agent-definition.types';
import { gatehouseBaseUrl } from './callers.controller';

/** What an admin may set an A2A agent's status to: published, held back, or retired. */
export const A2A_AGENT_STATUSES = ['active', 'disabled', 'archived'] as const;
export type A2AAgentStatus = (typeof A2A_AGENT_STATUSES)[number];

/** An A2A agent as the Gatehouse pages show it. */
export interface A2AAgentView {
  slug: string;
  orgSlug: string;
  name: string;
  description: string;
  version: string;
  status: string;
  /** Published: callers can read its card and call it. */
  published: boolean;
  cardUrl: string;
  a2a: A2AAgentConfig;
  updatedAt: string;
}

/** What an admin sends for an A2A agent; every field is checked here. */
export interface A2AAgentDraft {
  name?: unknown;
  description?: unknown;
  a2a?: unknown;
}

/** Something an admin asked for that cannot be done; the message says why. */
export class A2AAgentRefused extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid' | 'not-found' | 'exists',
  ) {
    super(message);
  }
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A2A agents for the Gatehouse pages: rows of public.agents with agent_type
 * 'a2a', in one organization. Their target and caller policy are checked by
 * the same parser the loader uses, so a saved agent always loads. An agent is
 * retired by status (disabled or archived), never deleted: its tasks keep
 * naming it.
 */
@Injectable()
export class A2AAgentsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly definitions: AgentDefinitionService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  /** Every A2A agent in this org (every org for '*'), by name. */
  async list(orgSlug: string): Promise<A2AAgentView[]> {
    let query = this.db.from(null, 'agents').select('*').eq('agent_type', 'a2a');
    if (orgSlug !== '*') query = query.contains('organization_slug', [orgSlug]);
    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw new Error(`Failed to list A2A agents: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => this.view(row));
  }

  async get(slug: string, orgSlug: string): Promise<A2AAgentView> {
    return this.view(await this.row(slug, orgSlug));
  }

  async create(orgSlug: string, slug: string, draft: A2AAgentDraft): Promise<A2AAgentView> {
    if (orgSlug === '*') throw new A2AAgentRefused('Choose the organization the agent belongs to', 'invalid');
    if (!SLUG.test(slug) || slug.length > 64) throw new A2AAgentRefused('slug must be a lowercase slug of at most 64 characters', 'invalid');
    const { name, description, a2a } = this.checked(draft);
    const existing = await this.db.from(null, 'agents').select('slug').eq('slug', slug).maybeSingle();
    if (existing.error) throw new Error(`Failed to check agent ${slug}: ${existing.error.message}`);
    if (existing.data) throw new A2AAgentRefused(`An agent named ${slug} already exists`, 'exists');

    const { data, error } = await this.db
      .from(null, 'agents')
      .insert({
        slug,
        organization_slug: [orgSlug],
        name,
        description,
        version: '1.0.0',
        agent_type: 'a2a',
        department: orgSlug,
        tags: ['a2a', a2a.target.kind],
        io_schema: {},
        capabilities: [`a2a-${a2a.target.kind}`],
        context: description,
        metadata: { status: 'disabled', a2a },
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create A2A agent ${slug}: ${error.message}`);
    return this.view(data as Record<string, unknown>);
  }

  /** New name, description, target or callers; the published version moves on. */
  async update(slug: string, orgSlug: string, draft: A2AAgentDraft): Promise<A2AAgentView> {
    const row = await this.row(slug, orgSlug);
    const { name, description, a2a } = this.checked(draft);
    const metadata = { ...(row.metadata as Record<string, unknown>), a2a };
    return this.save(slug, { name, description, context: description, tags: ['a2a', a2a.target.kind], capabilities: [`a2a-${a2a.target.kind}`], metadata, version: nextVersion(String(row.version)) });
  }

  async setStatus(slug: string, orgSlug: string, status: unknown): Promise<A2AAgentView> {
    if (!A2A_AGENT_STATUSES.includes(status as A2AAgentStatus)) {
      throw new A2AAgentRefused(`status must be one of ${A2A_AGENT_STATUSES.join(', ')}`, 'invalid');
    }
    const row = await this.row(slug, orgSlug);
    return this.save(slug, { metadata: { ...(row.metadata as Record<string, unknown>), status } });
  }

  private checked(draft: A2AAgentDraft): { name: string; description: string; a2a: A2AAgentConfig } {
    const name = typeof draft.name === 'string' ? draft.name.trim() : '';
    const description = typeof draft.description === 'string' ? draft.description.trim() : '';
    if (!name || name.length > 120) throw new A2AAgentRefused('name must be 1 to 120 characters', 'invalid');
    if (!description || description.length > 2000) throw new A2AAgentRefused('description must be 1 to 2000 characters', 'invalid');
    try {
      return { name, description, a2a: this.definitions.validateA2AConfig(draft.a2a) };
    } catch (error) {
      throw new A2AAgentRefused(error instanceof Error ? error.message : String(error), 'invalid');
    }
  }

  private async row(slug: string, orgSlug: string): Promise<Record<string, unknown>> {
    let query = this.db.from(null, 'agents').select('*').eq('slug', slug).eq('agent_type', 'a2a');
    if (orgSlug !== '*') query = query.contains('organization_slug', [orgSlug]);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Failed to load A2A agent ${slug}: ${error.message}`);
    if (!data) throw new A2AAgentRefused(`No A2A agent ${slug} in this organization`, 'not-found');
    return data as Record<string, unknown>;
  }

  private async save(slug: string, changes: Record<string, unknown>): Promise<A2AAgentView> {
    const { data, error } = await this.db
      .from(null, 'agents')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .select()
      .single();
    if (error) throw new Error(`Failed to save A2A agent ${slug}: ${error.message}`);
    return this.view(data as Record<string, unknown>);
  }

  private view(row: Record<string, unknown>): A2AAgentView {
    const slug = String(row.slug);
    const orgs = row.organization_slug;
    if (!Array.isArray(orgs) || orgs.length !== 1) throw new Error(`A2A agent ${slug} must belong to exactly one organization`);
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const status = String(metadata.status);
    return {
      slug,
      orgSlug: String(orgs[0]),
      name: String(row.name),
      description: String(row.description),
      version: String(row.version),
      status,
      published: status === 'active' && metadata.hidden !== true,
      cardUrl: `${gatehouseBaseUrl(this.config)}/a2a/${slug}/.well-known/agent-card.json`,
      a2a: this.definitions.validateA2AConfig(metadata.a2a),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }
}

/** 1.4.2 → 1.4.3: callers see from the card that the agent changed. */
function nextVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`An A2A agent's version must be major.minor.patch, not "${version}"`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
