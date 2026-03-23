import {
  Injectable,
  Logger,
  NotFoundException,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';
import { OriginValidatorService } from '../security/origin-validator.service';
import { BridgeDatabaseService } from '../database/bridge-database.service';
import { ExternalAgentRow } from '../database/bridge-database.types';

/**
 * ExternalRegistryService — Registry of known external agents backed by Supabase.
 *
 * Bridge maintains a registry of external agents it knows about.
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
  url: string;
  version: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'unknown';
  lastSeen: string;
  trustScore: number;
  trustLevel: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  registeredAt: string;
}

@Injectable()
export class ExternalRegistryService {
  private readonly logger = new Logger(ExternalRegistryService.name);

  private readonly defaultOrgSlug = process.env.DEFAULT_ORG_SLUG ?? 'default';

  constructor(
    private readonly originValidator: OriginValidatorService,
    private readonly db: BridgeDatabaseService,
  ) {}

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private rowToInfo(row: ExternalAgentRow): ExternalAgentInfo {
    return {
      id: row.agent_id,
      name: row.name ?? row.agent_id,
      description: row.description ?? '',
      url: row.url,
      version: row.version ?? '0.0.0',
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      status: row.status,
      lastSeen: row.last_heartbeat ?? row.updated_at ?? row.created_at ?? new Date().toISOString(),
      trustScore: row.trust_score,
      trustLevel: row.trust_level,
      interactions: row.interactions_count,
      registeredAt: row.created_at ?? new Date().toISOString(),
    };
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
  async discoverAgent(url: string, orgSlug?: string): Promise<ExternalAgentInfo> {
    const org = orgSlug ?? this.defaultOrgSlug;

    // Strip trailing slash and .well-known/agent.json if the user included it
    let baseUrl = url.replace(/\/$/, '');
    baseUrl = baseUrl.replace(/\/\.well-known\/agent\.json$/, '');

    const cardUrl = `${baseUrl}/.well-known/agent.json`;

    this.logger.log(`Discovering external agent at ${cardUrl}`);

    let response: Response;
    try {
      response = await fetch(cardUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OrchestratorAI-Bridge/0.1.0',
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

    const card = (await response.json()) as {
      id?: string;
      name?: string;
      description?: string;
      url?: string;
      version?: string;
      capabilities?: Array<{ id: string } | string>;
    };

    const agentId = card.id ?? `external-${Date.now()}`;
    const capabilityIds = (card.capabilities ?? []).map((c) =>
      typeof c === 'string' ? c : c.id,
    );

    const origin = new URL(baseUrl).origin;

    const row = await this.db.upsertAgent({
      org_slug: org,
      agent_id: agentId,
      name: card.name ?? agentId,
      description: card.description ?? '',
      url: card.url ?? baseUrl,
      version: card.version ?? '0.0.0',
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
    orgSlug?: string,
  ): Promise<ExternalAgentInfo> {
    const org = orgSlug ?? this.defaultOrgSlug;

    const row = await this.db.upsertAgent({
      org_slug: org,
      agent_id: data.id,
      name: data.name,
      description: data.description,
      url: data.url,
      version: data.version,
      capabilities: data.capabilities,
      status: 'unknown',
      trust_score: data.trustScore,
      trust_level: data.trustLevel,
      interactions_count: data.interactions,
      last_heartbeat: new Date().toISOString(),
      allowed_origin: true,
    });

    const origin = new URL(data.url).origin;
    this.originValidator.addTrustedOrigin(origin);

    this.logger.log(`Manually registered external agent ${data.id}`);
    return this.rowToInfo(row);
  }

  async getAllAgents(orgSlug?: string): Promise<ExternalAgentInfo[]> {
    const org = orgSlug ?? this.defaultOrgSlug;
    const rows = await this.db.getAllAgents(org);
    return rows.map((r) => this.rowToInfo(r));
  }

  async getAgent(id: string): Promise<ExternalAgentInfo> {
    const row = await this.db.getAgent(id);

    if (!row) {
      throw new NotFoundException(`External agent not found: ${id}`);
    }

    return this.rowToInfo(row);
  }

  async updateHeartbeat(agentId: string): Promise<ExternalAgentInfo> {
    // Confirm the agent exists first
    const existing = await this.db.getAgent(agentId);

    if (!existing) {
      throw new NotFoundException(`External agent not found: ${agentId}`);
    }

    await this.db.updateHeartbeat(agentId);

    // Return the updated record
    const updated = await this.db.getAgent(agentId);

    if (!updated) {
      throw new NotFoundException(`External agent not found after heartbeat update: ${agentId}`);
    }

    return this.rowToInfo(updated);
  }

  async incrementInteractions(agentId: string, success: boolean): Promise<void> {
    const row = await this.db.getAgent(agentId);

    if (!row) {
      // Agent may have been deregistered during an in-flight request — log and return
      this.logger.warn(`incrementInteractions: agent ${agentId} not found, skipping`);
      return;
    }

    const newCount = row.interactions_count + 1;
    const delta = success ? 5 : -10;
    const newScore = Math.min(100, Math.max(0, row.trust_score + delta));
    const newLevel = this.calculateTrustLevel(newScore, newCount);

    await this.db.updateInteractions(agentId, newCount, newScore, newLevel);
  }

  async deregisterAgent(agentId: string): Promise<void> {
    const row = await this.db.getAgent(agentId);

    if (!row) {
      throw new NotFoundException(`External agent not found: ${agentId}`);
    }

    await this.db.deleteAgent(agentId);

    const origin = new URL(row.url).origin;
    this.originValidator.removeTrustedOrigin(origin);

    this.logger.log(`Deregistered external agent ${agentId}`);
  }
}
