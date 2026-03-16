import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentsRepository } from '../repositories/agents.repository';
import { AgentRecord } from '../interfaces/agent.interface';

interface CacheEntry {
  record: AgentRecord;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 30_000;
const MIN_CACHE_TTL_MS = 1_000;
const MAX_CACHE_TTL_MS = 600_000;

@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);
  private readonly cache = new Map<string, Map<string, CacheEntry>>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtlMs = this.resolveTtl();
  }

  async getAgent(
    organizationSlug: string | null,
    agentSlug: string,
  ): Promise<AgentRecord | null> {
    const orgKey = this.resolveOrgKey(organizationSlug);
    const cached = this.getCached(orgKey, agentSlug);
    if (cached) {
      return cached;
    }

    const record = await this.agentsRepository.findBySlug(
      organizationSlug,
      agentSlug,
    );

    if (record) {
      this.setCache(orgKey, agentSlug, record);
    }

    return record;
  }

  async listAgents(organizationSlug: string | null): Promise<AgentRecord[]> {
    const orgKey = this.resolveOrgKey(organizationSlug);
    const allRecords =
      await this.agentsRepository.listByOrganization(organizationSlug);

    // Filter out agents disabled via metadata flag
    const records = allRecords.filter((r) => r.metadata?.status !== 'disabled');

    const bucket = this.ensureBucket(orgKey);
    const expiresAt = Date.now() + this.cacheTtlMs;

    for (const record of records) {
      bucket.set(record.slug, { record, expiresAt });
    }

    return records;
  }

  async listAllAgents(): Promise<AgentRecord[]> {
    const allRecords = await this.agentsRepository.listAll();
    return allRecords.filter((r) => r.metadata?.status !== 'disabled');
  }

  async listAgentsForOrganizations(
    organizations: (string | null)[],
  ): Promise<AgentRecord[]> {
    if (!organizations.length) {
      return [];
    }

    const uniqueOrganizations = Array.from(
      new Set(
        organizations.map((org) =>
          org && org.trim().length ? org.trim() : null,
        ),
      ),
    );

    // Always include global agents alongside organization-specific agents
    if (!uniqueOrganizations.includes(null)) {
      uniqueOrganizations.push(null);
    }

    const results = await Promise.all(
      uniqueOrganizations.map((organization) => this.listAgents(organization)),
    );

    // Deduplicate by slug (agents can belong to multiple orgs)
    const seen = new Set<string>();
    return results.flat().filter((agent) => {
      if (seen.has(agent.slug)) {
        return false;
      }
      seen.add(agent.slug);
      return true;
    });
  }

  invalidate(organizationSlug: string | null, agentSlug?: string): void {
    const orgKey = this.resolveOrgKey(organizationSlug);
    const bucket = this.cache.get(orgKey);
    if (!bucket) {
      return;
    }

    if (!agentSlug) {
      this.cache.delete(orgKey);
      return;
    }

    bucket.delete(agentSlug);
    if (bucket.size === 0) {
      this.cache.delete(orgKey);
    }
  }

  clearAll(): void {
    this.cache.clear();
  }

  private getCached(orgKey: string, agentSlug: string): AgentRecord | null {
    const bucket = this.cache.get(orgKey);
    if (!bucket) {
      return null;
    }

    const entry = bucket.get(agentSlug);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      bucket.delete(agentSlug);
      if (bucket.size === 0) {
        this.cache.delete(orgKey);
      }
      return null;
    }

    return entry.record;
  }

  private setCache(
    orgKey: string,
    agentSlug: string,
    record: AgentRecord,
  ): void {
    const bucket = this.ensureBucket(orgKey);
    bucket.set(agentSlug, {
      record,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private ensureBucket(orgKey: string): Map<string, CacheEntry> {
    let bucket = this.cache.get(orgKey);
    if (!bucket) {
      bucket = new Map<string, CacheEntry>();
      this.cache.set(orgKey, bucket);
    }
    return bucket;
  }

  private resolveOrgKey(orgSlug: string | null): string {
    return orgSlug?.trim() || 'global';
  }

  private resolveTtl(): number {
    const raw = this.configService.get<number | string | undefined>(
      'AGENT_REGISTRY_CACHE_TTL_MS',
    );

    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_CACHE_TTL_MS;
    }

    return Math.min(Math.max(numeric, MIN_CACHE_TTL_MS), MAX_CACHE_TTL_MS);
  }
}
