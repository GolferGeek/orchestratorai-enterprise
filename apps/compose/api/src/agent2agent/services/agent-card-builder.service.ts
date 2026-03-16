import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentRecord } from '@agent-platform/interfaces/agent.interface';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import { AgentRuntimeMetricsService } from '@agent-platform/services/agent-runtime-metrics.service';

export interface AgentCardOptions {
  includePrivateFields?: boolean;
}

@Injectable()
export class AgentCardBuilderService {
  private static readonly DEFAULT_SPEC_VERSION = '2024-08-07';
  private static readonly DEFAULT_PROVIDER = 'Orchestrator AI';
  private readonly logger = new Logger(AgentCardBuilderService.name);

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly configService: ConfigService,
    private readonly metricsService: AgentRuntimeMetricsService,
  ) {}

  async build(
    organizationSlug: string | null,
    agentSlug: string,
    options: AgentCardOptions = {},
  ): Promise<unknown> {
    const agent = await this.agentRegistry.getAgent(
      organizationSlug,
      agentSlug,
    );

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const specCard = this.composeSpecCard(agent);
    const metadataObj = (agent.metadata as Record<string, unknown>) || {};
    const agentCard = metadataObj.agent_card as
      | Record<string, unknown>
      | undefined;
    const combined = agentCard
      ? this.mergeCards(agentCard, specCard)
      : specCard;

    // When private fields are explicitly requested, attach safe metrics into metadata
    if (options.includePrivateFields === true && this.privateMetricsEnabled()) {
      try {
        const apiSnap = this.metricsService.snapshot('api', agent.slug);
        const extSnap = this.metricsService.snapshot('external', agent.slug);
        const metrics = {
          api: apiSnap[`api:${agent.slug}`] ?? null,
          external: extSnap[`external:${agent.slug}`] ?? null,
        };
        combined.metadata = {
          ...((combined.metadata as Record<string, unknown>) || {}),
          operations: {
            ...(((combined.metadata as Record<string, unknown>)
              ?.operations as Record<string, unknown>) || {}),
            // Provide a stable location for ops metrics; safe numeric summaries only
            metrics,
          },
        };
      } catch (error) {
        // ignore metrics errors for card composition but log at debug level
        this.logger.debug('Failed to attach private metrics to agent card', {
          agent: agent.slug,
          cause: error instanceof Error ? error.message : error,
        });
      }
    }

    return options.includePrivateFields === false
      ? this.stripPrivateFields(combined)
      : combined;
  }

  private privateMetricsEnabled(): boolean {
    const raw =
      this.configService.get<string>('AGENT_CARD_INCLUDE_PRIVATE_METRICS') ??
      'false';
    return String(raw).trim().toLowerCase() === 'true';
  }

  private composeSpecCard(agent: AgentRecord): Record<string, unknown> {
    const baseUrl = this.resolveBaseUrl();
    const metadataObj = (agent.metadata as Record<string, unknown>) || {};
    const orgSegment = agent.organization_slug.join(',') || 'global';
    const encodedOrg = encodeURIComponent(orgSegment);
    const encodedAgent = encodeURIComponent(agent.slug);
    const agentUrl = `${baseUrl}/agent-to-agent/${encodedOrg}/${encodedAgent}`;

    const defaultInputModes = (metadataObj.input_modes as string[]) ?? [
      'text/plain',
    ];
    const defaultOutputModes = (metadataObj.output_modes as string[]) ?? [
      'text/plain',
    ];

    const capabilities = this.deriveCapabilities(agent);
    const skills = this.deriveSkills(agent);
    const securitySchemes = this.buildSecuritySchemes();

    return {
      protocol: 'google/a2a',
      version: this.resolveSpecVersion(),
      name: agent.name,
      description: agent.description,
      url: agentUrl,
      endpoints: {
        health: `${agentUrl}/health`,
        tasks: `${agentUrl}/tasks`,
        card: `${agentUrl}/.well-known/agent.json`,
      },
      defaultInputModes,
      defaultOutputModes,
      capabilities,
      skills,
      securitySchemes,
      security: [{ apiKey: [] }],
      provider: this.deriveProvider(agent),
      supportsAuthenticatedExtendedCard: true,
      metadata: {
        slug: agent.slug,
        organization: agent.organization_slug,
        agentType: agent.agent_type,
        modeProfile: metadataObj.mode_profile,
        status: metadataObj.status ?? 'active',
        version: agent.version,
        updatedAt: agent.updated_at,
        createdAt: agent.created_at,
        // Expose execution fields from metadata for frontend
        execution_profile: metadataObj.execution_profile ?? null,
        execution_capabilities: metadataObj.execution_capabilities ?? null,
      },
    };
  }

  private mergeCards(
    existing: Record<string, unknown>,
    computed: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      ...existing,
      ...computed,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(computed?.metadata ?? {}),
      },
    };

    if (existing?.capabilities) {
      merged.capabilities = this.mergeCapabilities(
        existing.capabilities,
        computed.capabilities,
      );
    }

    if (existing?.skills) {
      const existingSkills = this.ensureStringArray(existing.skills) ?? [];
      const computedSkills = this.ensureStringArray(merged.skills) ?? [];
      merged.skills = Array.from(
        new Set([...computedSkills, ...existingSkills]),
      );
    }

    return merged;
  }

  private mergeCapabilities(
    existing: unknown,
    computed: unknown,
  ): Record<string, unknown> {
    if (!existing) {
      return computed as Record<string, unknown>;
    }

    const normalizedExisting =
      Array.isArray(existing) || typeof existing !== 'object'
        ? { declared: this.ensureStringArray(existing) ?? [] }
        : (existing as Record<string, unknown>);

    const computedRecord = computed as Record<string, unknown>;
    const declared = Array.from(
      new Set(
        [
          ...((computedRecord?.declared as unknown[]) ?? []),
          ...(this.ensureStringArray(normalizedExisting.declared) ?? []),
        ].filter(Boolean),
      ),
    );

    return {
      ...computedRecord,
      ...normalizedExisting,
      declared,
      extensions: Array.from(
        new Set(
          [
            ...((computedRecord?.extensions as unknown[]) ?? []),
            ...(this.ensureStringArray(normalizedExisting.extensions) ?? []),
          ].filter(Boolean),
        ),
      ),
    };
  }

  private deriveCapabilities(agent: AgentRecord): Record<string, unknown> {
    const metadataConfig = (agent.metadata as Record<string, unknown>) ?? {};
    const modes = this.deriveSupportedModes(agent);

    const streamingEnabled = this.lookupBoolean(metadataConfig, [
      'streaming',
      'enabled',
    ]);
    const pushNotifications = this.lookupBoolean(metadataConfig, [
      'notifications',
      'push',
    ]);
    const stateHistory = this.lookupBoolean(metadataConfig, [
      'stateTracking',
      'enabled',
    ]);
    const deliverables = this.lookupBoolean(metadataConfig, [
      'deliverables',
      'enabled',
    ]);

    const declared = agent.capabilities ?? [];

    return {
      modes,
      streaming: streamingEnabled,
      pushNotifications,
      stateTransitions: stateHistory,
      deliverables,
      extensions: this.ensureStringArray(metadataConfig.extensions) ?? [],
      declared,
    };
  }

  private deriveSupportedModes(agent: AgentRecord): string[] {
    const metadataConfig = (agent.metadata as Record<string, unknown>) ?? {};
    const modeProfile: string | null =
      (metadataConfig.mode_profile as string | null) ?? null;

    const sources: Array<string[] | null> = [
      this.ensureStringArray(metadataConfig.supported_modes),
      this.ensureStringArray(metadataConfig.modes),
      this.modesFromProfile(modeProfile),
    ];

    const values = new Set<string>();
    for (const list of sources) {
      if (!list) continue;
      for (const item of list) {
        if (item) {
          values.add(item);
        }
      }
    }

    if (!values.size) {
      values.add('converse');
    }

    return Array.from(values);
  }

  private modesFromProfile(profile: string | null): string[] | null {
    if (!profile) {
      return null;
    }

    switch (profile) {
      case 'autonomous_build':
        return ['converse', 'plan', 'build'];
      case 'conversation_with_gate':
        return ['converse', 'plan'];
      case 'human_gate':
        return ['converse'];
      case 'conversation_only':
      default:
        return ['converse'];
    }
  }

  private deriveSkills(agent: AgentRecord): string[] {
    const contextRecord = this.asRecord(agent.context);
    const metadataRecord = this.asRecord(contextRecord?.metadata);

    const contextSkills = this.ensureStringArray(contextRecord?.skills) ?? [];
    const metadataConfig = (agent.metadata as Record<string, unknown>) ?? {};
    const configSkills = this.ensureStringArray(metadataConfig.skills) ?? [];
    const yamlSkills = this.ensureStringArray(metadataRecord?.skills) ?? [];

    const combined = new Set<string>([
      ...contextSkills,
      ...configSkills,
      ...yamlSkills,
    ]);

    if (!combined.size) {
      combined.add(agent.agent_type);
    }

    return Array.from(combined);
  }

  private buildSecuritySchemes(): Record<string, unknown> {
    return {
      apiKey: {
        type: 'apiKey',
        name: 'X-Agent-Api-Key',
        in: 'header',
        description:
          'Organization-scoped API key issued by Orchestrator AI. Contact support to rotate.',
      },
    };
  }

  private deriveProvider(agent: AgentRecord): Record<string, unknown> {
    const contextRecord = this.asRecord(agent.context);
    const metadataConfig = (agent.metadata as Record<string, unknown>) ?? {};
    const configProvider = metadataConfig.provider;
    const contextProvider = contextRecord?.provider;
    const globalProvider =
      this.configService.get<string>('AGENT_PROVIDER_NAME') ??
      AgentCardBuilderService.DEFAULT_PROVIDER;

    const configProviderName = this.pickString(configProvider);
    if (configProviderName) {
      return {
        name: configProviderName,
        slug: agent.organization_slug ?? 'global',
      };
    }

    const contextProviderName = this.pickString(contextProvider);
    if (contextProviderName) {
      return {
        name: contextProviderName,
        slug: agent.organization_slug ?? 'global',
      };
    }

    const providerObject =
      this.asRecord(configProvider) ?? this.asRecord(contextProvider);

    if (providerObject) {
      const name =
        this.pickString(providerObject.name) ??
        this.pickString(providerObject.displayName) ??
        globalProvider;
      const slug =
        this.pickString(providerObject.slug) ??
        this.pickString(providerObject.id) ??
        agent.organization_slug ??
        'global';
      const contactValue = providerObject.contact;
      const contact =
        typeof contactValue === 'string'
          ? contactValue
          : (this.asRecord(contactValue) ?? null);
      const url = this.pickString(providerObject.url);

      return {
        name,
        slug,
        contact,
        url,
      };
    }

    return {
      name: globalProvider,
      slug: agent.organization_slug ?? 'global',
    };
  }

  private resolveSpecVersion(): string {
    return (
      this.configService.get<string>('AGENT_A2A_SPEC_VERSION') ??
      this.configService.get<string>('AGENT_SPEC_VERSION') ??
      AgentCardBuilderService.DEFAULT_SPEC_VERSION
    );
  }

  private resolveBaseUrl(): string {
    const candidates = [
      this.configService.get<string>('AGENT_PUBLIC_BASE_URL'),
      this.configService.get<string>('PUBLIC_AGENT_BASE_URL'),
      this.configService.get<string>('API_PUBLIC_URL'),
      this.configService.get<string>('APP_PUBLIC_URL'),
      this.configService.get<string>('APP_URL'),
    ];

    const selected = candidates.find(
      (value) => typeof value === 'string' && value.trim().length,
    );

    const fallback = 'https://api.localhost';
    const base = selected ?? fallback;

    return base.replace(/\/$/, '');
  }

  private ensureStringArray(value: unknown): string[] | null {
    if (!value) {
      return null;
    }

    if (Array.isArray(value)) {
      const cleaned = value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : null))
        .filter((entry): entry is string => Boolean(entry));
      return cleaned.length ? cleaned : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : null;
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private pickString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private lookupBoolean(
    source: Record<string, unknown>,
    path: string[],
  ): boolean {
    let cursor: unknown = source;
    for (const segment of path) {
      if (cursor == null || typeof cursor !== 'object') {
        return false;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return Boolean(cursor);
  }

  private stripPrivateFields(
    card: Record<string, unknown>,
  ): Record<string, unknown> {
    const clone = JSON.parse(JSON.stringify(card)) as Record<string, unknown>;

    delete clone.internal;
    delete clone.debug;
    if (Array.isArray(clone.security)) {
      clone.security = clone.security.map((entry: unknown): unknown => {
        if (!entry || typeof entry !== 'object') {
          return entry;
        }
        const sanitized = { ...(entry as Record<string, unknown>) };
        delete sanitized.private;
        return sanitized;
      });
    }

    if (clone.metadata && typeof clone.metadata === 'object') {
      const metadata = clone.metadata as Record<string, unknown>;
      delete metadata.internal;
      delete metadata.secrets;
      delete metadata.debug;
    }

    return clone;
  }
}
