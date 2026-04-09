import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createExternalOriginContext } from './external-origin-context';

/**
 * A2ARouterService — Routes inbound A2A requests to internal agents.
 *
 * Examines the inbound JSON-RPC 2.0 request method and params to determine
 * which internal agent should handle it. Internal agents live at:
 * - Forge API:   port 6200 (complex LangGraph workflows)
 * - Compose API: port 6300 (simple agent runners)
 * - Pulse API:   port 6500 (internal ambient automation)
 *
 * The router maps:
 * - `forge.*`            → Forge API
 * - `compose.*`          → Compose API
 * - `pulse.*`/`ambient.*`→ Pulse API
 * - Skill-based routing: capability names map to agent types
 *
 * ExecutionContext handling:
 * - If the inbound request already carries a context in params.context the
 *   router forwards it unchanged (external orchestrators may provide one).
 * - If no context is present the router uses createExternalOriginContext() to
 *   construct a minimal external-origin context so that internal agents can
 *   attribute usage to the correct org and track the external interaction.
 */

export interface InternalRouteTarget {
  product: 'forge' | 'compose' | 'pulse';
  baseUrl: string;
  path: string;
}

@Injectable()
export class A2ARouterService {
  private readonly logger = new Logger(A2ARouterService.name);

  private readonly forgeBaseUrl: string;
  private readonly composeBaseUrl: string;
  private readonly pulseBaseUrl: string;
  private readonly defaultOrgSlug: string;

  constructor(private readonly config: ConfigService) {
    this.forgeBaseUrl = this.config.get<string>('FORGE_API_URL', 'http://localhost:5200');
    this.composeBaseUrl = this.config.get<string>('COMPOSE_API_URL', 'http://localhost:5300');
    this.pulseBaseUrl = this.config.get<string>('PULSE_API_URL', 'http://localhost:5500');
    this.defaultOrgSlug = this.config.get<string>('DEFAULT_ORG_SLUG', 'default');
  }

  /**
   * Determine which internal agent should handle this inbound A2A request.
   * Returns the routing target (product, baseUrl, path).
   *
   * Routing rules:
   * 1. Explicit product prefix in method: forge.*, compose.*, pulse.*, ambient.*
   * 2. Skill-based: maps capability IDs to products
   * 3. Default: Compose (simple agents handle most external requests)
   *
   * @param agentId  Optional external agent ID — used when constructing a missing ExecutionContext.
   */
  resolveRoute(method: string, params?: Record<string, unknown>, _agentId?: string): InternalRouteTarget {
    // Pulse / ambient routing
    if (method.startsWith('pulse.') || method.startsWith('ambient.')) {
      this.logger.log(`Routing ${method} to Pulse API`);
      return {
        product: 'pulse',
        baseUrl: this.pulseBaseUrl,
        path: '/internal/event',
      };
    }

    // Explicit product routing
    if (method.startsWith('forge.')) {
      this.logger.log(`Routing ${method} to Forge API`);
      return {
        product: 'forge',
        baseUrl: this.forgeBaseUrl,
        path: '/a2a/tasks',
      };
    }

    if (method.startsWith('compose.')) {
      this.logger.log(`Routing ${method} to Compose API`);
      return {
        product: 'compose',
        baseUrl: this.composeBaseUrl,
        path: '/a2a/tasks',
      };
    }

    // Skill-based routing: check if params.skill matches a known Forge capability
    const forgeSkills = [
      'langgraph',
      'workflow',
      'multi-agent',
      'orchestration',
      'plan',
      'plan.create',
      'plan.execute',
    ];

    const skillName = (params?.skill as string) ?? method;
    if (forgeSkills.some((s) => skillName.includes(s))) {
      this.logger.log(`Routing ${method} (skill: ${skillName}) to Forge API`);
      return {
        product: 'forge',
        baseUrl: this.forgeBaseUrl,
        path: '/a2a/tasks',
      };
    }

    // Default: Compose handles context, RAG, API, external, and media agents
    this.logger.log(`Routing ${method} to Compose API (default)`);
    return {
      product: 'compose',
      baseUrl: this.composeBaseUrl,
      path: '/a2a/tasks',
    };
  }

  /**
   * Forward a JSON-RPC 2.0 request to an internal agent and return its response.
   *
   * Before forwarding, ensures the request params contain an ExecutionContext.
   * If the inbound request already carries one it is passed through unchanged.
   * If not, createExternalOriginContext() is used to build a proper context.
   *
   * @param agentId  Optional external agent ID — used when building a missing context.
   */
  async forwardRequest(
    target: InternalRouteTarget,
    jsonRpcRequest: unknown,
    agentId?: string,
  ): Promise<unknown> {
    const request = jsonRpcRequest as {
      jsonrpc: string;
      id?: string | number;
      method: string;
      params?: Record<string, unknown>;
    };

    // Ensure params exists and contains an ExecutionContext
    const enrichedParams = this.ensureExecutionContext(request.params ?? {}, agentId);

    const enrichedRequest = {
      ...request,
      params: enrichedParams,
    };

    const url = `${target.baseUrl}${target.path}`;
    this.logger.log(`Forwarding ${request.method} to ${target.product} at ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Forwarded': 'true',
        'X-Bridge-Version': '0.1.0',
      },
      body: JSON.stringify(enrichedRequest),
    });

    if (!response.ok) {
      throw new Error(`Internal agent ${target.product} returned HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * If params already contain a context object, return params unchanged.
   * Otherwise inject an external-origin ExecutionContext via the sanctioned factory.
   */
  private ensureExecutionContext(
    params: Record<string, unknown>,
    agentId?: string,
  ): Record<string, unknown> {
    if (params['context'] && typeof params['context'] === 'object') {
      // External orchestrator provided a context — forward it whole
      return params;
    }

    const context = createExternalOriginContext({
      orgSlug: this.defaultOrgSlug,
      agentId,
    });

    this.logger.debug(
      `Injected external ExecutionContext for agent ${agentId ?? 'unknown'} (conversationId=${context.conversationId})`,
    );

    return { ...params, context };
  }
}
