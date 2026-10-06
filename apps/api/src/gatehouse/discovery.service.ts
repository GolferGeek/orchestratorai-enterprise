import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { gatehouseBaseUrl } from './callers.controller';
import { agentCard } from './inbound.controller';
import { GatehouseInboundService } from './inbound.service';

/** The catalog's format name and version, so an agent knows what it is reading. */
export const CATALOG_SCHEMA = 'orchestratorai.gatehouse.agents/1';

export interface Organization {
  slug: string;
  name: string;
  url: string | null;
  frontDoor: string | null;
}

/** Why discovery cannot answer: the org or its front door is not there. */
export class DiscoveryMissing extends Error {}

/**
 * How an outside agent finds a company (Matt, 2026-10-06). A2A defines one
 * card per domain (/.well-known/agent-card.json) and leaves registries
 * unstandardized, so a company publishes both:
 *
 *   - its front door: one published A2A agent, chosen per organization
 *     (organizations.settings.gatehouse.frontDoor), whose card is the
 *     company card, for clients that only know the spec;
 *   - its catalog (agents.json, our own format): every published agent with
 *     its card and endpoint, the MCP endpoint, and how to sign in, for agents
 *     that can read a JSON file and go from there.
 *
 * The company's own domain points its /.well-known/agent-card.json and
 * /.well-known/agents.json at these (a rewrite on its site).
 */
@Injectable()
export class GatehouseDiscoveryService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly agents: AgentDefinitionService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  async organization(slug: string): Promise<Organization> {
    const { data, error } = await this.db.from(null, 'organizations').select('slug, name, url, settings').eq('slug', slug).maybeSingle();
    if (error) throw new Error(`Failed to load organization ${slug}: ${error.message}`);
    if (!data) throw new DiscoveryMissing(`No organization ${slug}`);
    const row = data as { slug: string; name: string; url: string | null; settings: Record<string, unknown> | null };
    const gatehouse = (row.settings?.gatehouse ?? {}) as { frontDoor?: unknown };
    if (gatehouse.frontDoor !== undefined && gatehouse.frontDoor !== null && typeof gatehouse.frontDoor !== 'string') {
      throw new Error(`organizations.settings.gatehouse.frontDoor of ${slug} must be an agent slug`);
    }
    return { slug: row.slug, name: row.name, url: row.url, frontDoor: (gatehouse.frontDoor as string | null | undefined) ?? null };
  }

  /** The org's published A2A agents: active a2a agents of exactly this org. */
  async published(org: string): Promise<AgentDefinition[]> {
    return (await this.agents.listAgents(org)).filter((agent) => agent.agentType === 'a2a' && agent.orgSlug === org);
  }

  /** The company card: its front door's card, with the company as provider and the catalog linked. */
  async companyCard(orgSlug: string) {
    const org = await this.organization(orgSlug);
    if (!org.frontDoor) throw new DiscoveryMissing(`${org.name} has not chosen a front door agent`);
    const door = (await this.published(orgSlug)).find((agent) => agent.slug === org.frontDoor);
    if (!door) throw new DiscoveryMissing(`${org.name}'s front door (${org.frontDoor}) is not a published A2A agent`);
    const base = gatehouseBaseUrl(this.config);
    return {
      ...agentCard(door, base),
      provider: { organization: org.name, url: org.url ?? base.replace(/\/api$/, '') },
      // Every other agent of the company, for an agent that reads on.
      documentationUrl: `${base}/gatehouse/orgs/${orgSlug}/agents.json`,
    };
  }

  /** The company's catalog: every published agent, the MCP endpoint, and how to sign in. */
  async catalog(orgSlug: string) {
    const org = await this.organization(orgSlug);
    const base = gatehouseBaseUrl(this.config);
    const agents = await this.published(orgSlug);
    return {
      schema: CATALOG_SCHEMA,
      organization: { slug: org.slug, name: org.name, ...(org.url ? { url: org.url } : {}) },
      about:
        'The agents this company offers to outside agents. Each speaks A2A v1.0 (JSON-RPC) at its endpoint and has its own agent card; ' +
        'the same agents are tools of the MCP endpoint. Sign in with "Log in with" the company (OAuth 2.1 + PKCE), an agent key, or a registered caller key.',
      frontDoor: org.frontDoor && agents.some((agent) => agent.slug === org.frontDoor) ? `${base}/a2a/${org.frontDoor}/.well-known/agent-card.json` : null,
      mcp: { url: `${base}/mcp/${orgSlug}`, transport: 'streamable-http' },
      auth: {
        oauthAuthorizationServer: `${base}/gatehouse/oauth/metadata`,
        agentKeys: 'Authorization: Bearer <agent key>, issued by the company or through OAuth',
        registerCaller: `${base}/gatehouse/callers/register`,
      },
      agents: agents.map((agent) => ({
        slug: agent.slug,
        name: agent.name,
        description: agent.description ?? agent.name,
        cardUrl: `${base}/a2a/${agent.slug}/.well-known/agent-card.json`,
        a2aEndpoint: `${base}/a2a/${agent.slug}`,
        route: agent.a2a!.target.kind,
        streaming: GatehouseInboundService.streams(agent),
        callers: agent.a2a!.callers === 'any' ? 'any' : 'registered callers it names',
      })),
    };
  }

  /** Choose (or clear, with null) the org's front door: one of its published A2A agents. */
  async setFrontDoor(orgSlug: string, slug: string | null): Promise<Organization> {
    const org = await this.organization(orgSlug);
    if (slug !== null && !(await this.published(orgSlug)).some((agent) => agent.slug === slug)) {
      throw new DiscoveryMissing(`${slug} is not a published A2A agent of ${org.name}`);
    }
    const { data, error } = await this.db.from(null, 'organizations').select('settings').eq('slug', orgSlug).single();
    if (error) throw new Error(`Failed to load organization ${orgSlug}: ${error.message}`);
    const settings = ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
    const gatehouse = { ...((settings.gatehouse ?? {}) as Record<string, unknown>), frontDoor: slug };
    const saved = await this.db.from(null, 'organizations').update({ settings: { ...settings, gatehouse }, updated_at: new Date().toISOString() }).eq('slug', orgSlug);
    if (saved.error) throw new Error(`Failed to save the front door of ${orgSlug}: ${saved.error.message}`);
    return { ...org, frontDoor: slug };
  }
}
