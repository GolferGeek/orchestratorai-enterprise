import {
  Injectable,
  Logger,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common';
import { OriginValidatorService } from '../security/origin-validator.service';
import { OutboundUrlValidatorService } from '../security/outbound-url-validator.service';
import { readBoundedJsonResponse } from '../security/bounded-json-response';
import { SecureConversationsDatabaseService } from '../database/secure-conversations-database.service';
import { ExternalAgentRow } from '../database/secure-conversations-database.types';

/**
 * ExternalRegistryService — Registry of known external agents backed by Supabase.
 *
 * Secure Conversations maintains a registry of external agents it knows about.
 * Registration happens via:
 * - Explicit POST /registry/agents/discover (fetches .well-known/agent.json)
 * - Manual POST /registry/agents (admin registration)
 *
 * The registry drives:
 * - Origin validation (registered agents get their origin trusted)
 * - Outbound routing (a2a-sender.service uses registry to find endpoints)
 * - Trust scoring (reputation tracking per agent)
 *
 * Previously backed by an in-memory Map — now persisted to ambient.external_agents
 * so the registry survives restarts.
 */

export interface ExternalAgentInfo {
  id: string;
  name: string;
  description: string;
  /** Discovery / base URL */
  url: string;
  /** Dedicated A2A invoke endpoint — takes precedence over `url` for outbound calls */
  a2aEndpoint?: string;
  /** A2A protocol variants advertised by this agent */
  protocols?: string[];
  version: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'unknown';
  lastSeen: string;
  trustScore: number;
  trustLevel: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  registeredAt: string;
}

export interface ExternalAgentConnection extends ExternalAgentInfo {
  /** Secret used only by internal outbound dispatch. Never return from controllers. */
  apiKey?: string;
}

@Injectable()
export class ExternalRegistryService {
  private readonly logger = new Logger(ExternalRegistryService.name);

  constructor(
    private readonly originValidator: OriginValidatorService,
    private readonly outboundUrlValidator: OutboundUrlValidatorService,
    private readonly db: SecureConversationsDatabaseService,
  ) {}

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private rowToInfo(
    row: ExternalAgentRow,
    includeConnectionSecret = false,
  ): ExternalAgentConnection {
    this.assertStoredAgent(row);
    const info: ExternalAgentConnection = {
      id: row.agent_id,
      name: row.name,
      description: row.description,
      url: row.url,
      a2aEndpoint: row.a2a_endpoint ?? undefined,
      protocols: Array.isArray(row.protocols) ? row.protocols : undefined,
      version: row.version,
      capabilities: row.capabilities,
      status: row.status,
      lastSeen: row.last_heartbeat,
      trustScore: row.trust_score,
      trustLevel: row.trust_level,
      interactions: row.interactions_count,
      registeredAt: row.created_at,
    };
    if (includeConnectionSecret && row.api_key) {
      info.apiKey = row.api_key;
    }
    return info;
  }

  private assertStoredAgent(row: ExternalAgentRow): asserts row is ExternalAgentRow & {
    name: string;
    description: string;
    version: string;
    capabilities: string[];
    last_heartbeat: string;
    created_at: string;
  } {
    if (
      typeof row.agent_id !== 'string' ||
      !row.agent_id.trim() ||
      typeof row.org_slug !== 'string' ||
      !row.org_slug.trim() ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      typeof row.description !== 'string' ||
      typeof row.version !== 'string' ||
      !row.version.trim() ||
      !Array.isArray(row.capabilities) ||
      !row.capabilities.every(
        (capability) =>
          typeof capability === 'string' && capability.trim().length > 0,
      ) ||
      typeof row.last_heartbeat !== 'string' ||
      !Number.isFinite(Date.parse(row.last_heartbeat)) ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at))
    ) {
      throw new Error(
        `Stored external agent ${row.agent_id} is malformed`,
      );
    }
  }

  private calculateTrustLevel(
    score: number,
    interactions: number,
  ): 'trusted' | 'neutral' | 'untrusted' | 'unknown' {
    if (interactions === 0) return 'unknown';
    if (score >= 70) return 'trusted';
    if (score >= 30) return 'neutral';
    return 'untrusted';
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Discover and register an external agent by fetching its .well-known/agent.json.
   * On success, upserts the agent into Supabase and registers its origin as trusted.
   */
  async discoverAgent(url: string, orgSlug: string): Promise<ExternalAgentInfo> {

    // Strip trailing slash and .well-known/agent.json if the user included it
    let baseUrl = url.replace(/\/$/, '');
    baseUrl = baseUrl.replace(/\/\.well-known\/agent\.json$/, '');
    const validatedBaseUrl =
      await this.outboundUrlValidator.assertSafe(baseUrl);
    baseUrl = validatedBaseUrl.toString().replace(/\/$/, '');

    const cardUrl = `${baseUrl}/.well-known/agent.json`;

    this.logger.log(`Discovering external agent at ${cardUrl}`);

    let response: Response;
    try {
      response = await fetch(cardUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OrchestratorAI-Secure-Conversations/0.1.0',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(
        `Could not reach agent at ${cardUrl}: ${msg}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Failed to fetch agent card from ${cardUrl}: HTTP ${response.status}`,
      );
    }

    let card: {
      id: string;
      name: string;
      description: string;
      url: string;
      version: string;
      capabilities: Array<{ id: string } | string>;
    };
    try {
      card = (await readBoundedJsonResponse(
        response,
        262_144,
        'External agent card',
      )) as typeof card;
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error ? error.message : 'Invalid external agent card',
      );
    }

    if (
      typeof card.id !== 'string' ||
      !card.id.trim() ||
      card.id.length > 128 ||
      typeof card.name !== 'string' ||
      !card.name.trim() ||
      typeof card.description !== 'string' ||
      typeof card.url !== 'string' ||
      !card.url.trim() ||
      typeof card.version !== 'string' ||
      !card.version.trim() ||
      !Array.isArray(card.capabilities) ||
      !card.capabilities.every(
        (capability) =>
          (typeof capability === 'string' && capability.trim().length > 0) ||
          (typeof capability === 'object' &&
            capability !== null &&
            typeof capability.id === 'string' &&
            capability.id.trim().length > 0),
      )
    ) {
      throw new BadGatewayException('External agent card has an invalid shape');
    }

    const agentId = card.id;
    const capabilityIds = card.capabilities.map((c) =>
      typeof c === 'string' ? c : c.id,
    );

    const advertisedUrl = card.url;
    const validatedAdvertisedUrl =
      await this.outboundUrlValidator.assertSafe(advertisedUrl);
    const origin = validatedBaseUrl.origin;

    const row = await this.db.upsertAgent({
      org_slug: orgSlug,
      agent_id: agentId,
      name: card.name,
      description: card.description,
      url: validatedAdvertisedUrl.toString(),
      version: card.version,
      agent_card: card as unknown,
      capabilities: capabilityIds,
      status: 'online',
      trust_score: 0,
      trust_level: 'unknown',
      interactions_count: 0,
      last_heartbeat: new Date().toISOString(),
      allowed_origin: true,
    });

    // Register the agent's origin in the in-process origin allowlist
    this.originValidator.addTrustedOrigin(origin);

    this.logger.log(`Registered external agent ${agentId} (${row.name}) from ${origin}`);
    return this.rowToInfo(row);
  }

  /**
   * Manually register an external agent without fetching its agent card.
   */
  async registerAgent(
    data: Omit<ExternalAgentInfo, 'registeredAt' | 'status' | 'lastSeen'>,
    orgSlug: string,
  ): Promise<ExternalAgentInfo> {
    const validatedUrl = await this.outboundUrlValidator.assertSafe(data.url);

    const row = await this.db.upsertAgent({
      org_slug: orgSlug,
      agent_id: data.id,
      name: data.name,
      description: data.description,
      url: validatedUrl.toString(),
      version: data.version,
      capabilities: data.capabilities,
      status: 'unknown',
      trust_score: data.trustScore,
      trust_level: data.trustLevel,
      interactions_count: data.interactions,
      last_heartbeat: new Date().toISOString(),
      allowed_origin: true,
    });

    const origin = validatedUrl.origin;
    this.originValidator.addTrustedOrigin(origin);

    this.logger.log(`Manually registered external agent ${data.id}`);
    return this.rowToInfo(row);
  }

  async getAllAgents(orgSlug: string): Promise<ExternalAgentInfo[]> {
    const rows = await this.db.getAllAgents(orgSlug);
    return rows.map((r) => this.rowToInfo(r));
  }

  async getAgent(id: string, orgSlug: string): Promise<ExternalAgentInfo> {
    const row = await this.db.getAgent(id, orgSlug);

    if (!row) {
      throw new NotFoundException(`External agent not found: ${id}`);
    }

    return this.rowToInfo(row);
  }

  async getAgentConnection(
    id: string,
    orgSlug: string,
  ): Promise<ExternalAgentConnection> {
    const row = await this.db.getAgent(id, orgSlug);
    if (!row) {
      throw new NotFoundException(`External agent not found: ${id}`);
    }
    return this.rowToInfo(row, true);
  }

  async updateHeartbeat(
    agentId: string,
    orgSlug: string,
  ): Promise<ExternalAgentInfo> {
    const org = orgSlug;
    // Confirm the agent exists first
    const existing = await this.db.getAgent(agentId, org);

    if (!existing) {
      throw new NotFoundException(`External agent not found: ${agentId}`);
    }

    await this.db.updateHeartbeat(agentId, org);

    // Return the updated record
    const updated = await this.db.getAgent(agentId, org);

    if (!updated) {
      throw new NotFoundException(`External agent not found after heartbeat update: ${agentId}`);
    }

    return this.rowToInfo(updated);
  }

  async incrementInteractions(
    agentId: string,
    success: boolean,
    orgSlug: string,
  ): Promise<void> {
    const org = orgSlug;
    const row = await this.db.getAgent(agentId, org);

    if (!row) {
      throw new NotFoundException(`External agent not found for interaction update: ${agentId}`);
    }

    const newCount = row.interactions_count + 1;
    const delta = success ? 5 : -10;
    const newScore = Math.min(100, Math.max(0, row.trust_score + delta));
    const newLevel = this.calculateTrustLevel(newScore, newCount);

    await this.db.updateInteractions(
      agentId,
      newCount,
      newScore,
      newLevel,
      org,
    );
  }

  /**
   * Update the dedicated A2A endpoint and API key for a registered agent.
   * Called after initial discovery when additional connection details are known
   * (e.g. from environment config rather than the agent card itself).
   */
  async updateAgentConnection(
    agentId: string,
    a2aEndpoint: string,
    apiKey: string,
    orgSlug: string,
  ): Promise<ExternalAgentInfo> {
    const org = orgSlug;
    const validatedEndpoint =
      await this.outboundUrlValidator.assertSafe(a2aEndpoint);
    await this.db.updateAgentEndpointAndKey(
      agentId,
      validatedEndpoint.toString(),
      apiKey,
      org,
    );

    const row = await this.db.getAgent(agentId, org);

    if (!row) {
      throw new NotFoundException(`External agent not found after connection update: ${agentId}`);
    }

    this.logger.log(`Updated A2A endpoint + API key for agent ${agentId}`);
    return this.rowToInfo(row);
  }

  async deregisterAgent(agentId: string, orgSlug: string): Promise<void> {
    const org = orgSlug;
    const row = await this.db.getAgent(agentId, org);

    if (!row) {
      throw new NotFoundException(`External agent not found: ${agentId}`);
    }

    await this.db.deleteAgent(agentId, org);

    const origin = new URL(row.url).origin;
    this.originValidator.removeTrustedOrigin(origin);

    this.logger.log(`Deregistered external agent ${agentId}`);
  }

  async resolveAuthenticatedAgent(
    agentId: string,
    origin: string,
  ): Promise<{ organizationSlug: string }> {
    const normalizedOrigin = new URL(origin).origin;
    const candidates = await this.db.getAgentsByIdentity(agentId);
    const matches = candidates.filter((candidate) => {
      const registeredOrigins = [candidate.url, candidate.a2a_endpoint]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => new URL(value).origin);
      return registeredOrigins.includes(normalizedOrigin);
    });
    if (matches.length !== 1) {
      throw new NotFoundException(
        'External agent identity is not uniquely registered for this origin',
      );
    }
    const [match] = matches;
    if (!match) {
      throw new Error('External agent identity resolution failed');
    }
    return { organizationSlug: match.org_slug };
  }
}
