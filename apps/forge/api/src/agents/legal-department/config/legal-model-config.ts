/**
 * legal-model-config — central place where every legal-department node and
 * the worker decide which (provider, model) to use.
 *
 * Lookup order (first hit wins):
 *   1. Per-node override from env var LEGAL_NODE_MODELS, e.g.
 *      LEGAL_NODE_MODELS='{"contract-agent":"gemma4:26b","clo-routing":"gemma4:e4b"}'
 *   2. Per-capability + per-role override from legal.capability_model_config
 *      (the database settings UI). Each node maps to a role:
 *        clo-routing, synthesis, report-generation → 'thinking'
 *        all 8 specialist agents, metadata extraction → 'workhorse'
 *        any vision/image step → 'image'
 *   3. Fall back to ExecutionContext.model that was on the request.
 *
 * The DB layer is preloaded once at module init and refreshed lazily; the
 * function is sync from the caller's point of view because nodes need it on
 * a hot path. If the DB row hasn't been loaded yet, the helper falls through
 * to the env var or the context model.
 */
import { Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { CapabilityRole } from '../jobs/legal-capability-config.repository';

const logger = new Logger('legal-model-config');

interface ResolvedModel {
  provider: string;
  model: string;
}

const NODE_TO_ROLE: Record<string, CapabilityRole> = {
  'clo-routing': 'thinking',
  synthesis: 'thinking',
  'report-generation': 'thinking',
  'contract-agent': 'workhorse',
  'compliance-agent': 'workhorse',
  'corporate-agent': 'workhorse',
  'employment-agent': 'workhorse',
  'ip-agent': 'workhorse',
  'litigation-agent': 'workhorse',
  'privacy-agent': 'workhorse',
  'real-estate-agent': 'workhorse',
};

let envOverrides: Record<string, string> | null = null;
function getEnvOverrides(): Record<string, string> {
  if (envOverrides) return envOverrides;
  const raw = process.env.LEGAL_NODE_MODELS;
  if (!raw) {
    envOverrides = {};
    return envOverrides;
  }
  try {
    envOverrides = JSON.parse(raw) as Record<string, string>;
  } catch (error) {
    logger.warn(
      `Failed to parse LEGAL_NODE_MODELS: ${error instanceof Error ? error.message : String(error)}`,
    );
    envOverrides = {};
  }
  return envOverrides;
}

/**
 * In-memory cache of the DB-backed config, populated by the repository at
 * service init via `preloadCapabilityModelConfig()`.
 */
const dbCache = new Map<
  string,
  { provider: string | null; model: string | null }
>();

/**
 * Called by `LegalJobsWorkerService.onModuleInit()` after reading
 * legal.capability_model_config. Subsequent updates from the settings PUT
 * endpoint should also call this to keep the cache fresh.
 */
export function setCapabilityModelConfig(
  rows: Array<{
    capability_slug: string;
    role: CapabilityRole;
    provider: string | null;
    model: string | null;
  }>,
): void {
  for (const row of rows) {
    dbCache.set(`${row.capability_slug}:${row.role}`, {
      provider: row.provider,
      model: row.model,
    });
  }
  logger.log(`Cached ${rows.length} capability_model_config rows`);
}

/**
 * Resolve the (provider, model) every node should use for `nodeName`.
 *
 * @param ctx        The whole ExecutionContext (passed in case the fallback
 *                   to ctx.provider/ctx.model is needed)
 * @param nodeName   Logical node identifier ('contract-agent', 'synthesis', …)
 * @param capabilitySlug  e.g. 'document-onboarding'. If omitted, only env +
 *                   context fallback are consulted.
 */
export function resolveModelForNode(
  ctx: ExecutionContext,
  nodeName: string,
  capabilitySlug?: string,
): ResolvedModel {
  // 1. Per-node env override
  const env = getEnvOverrides();
  if (env[nodeName]) {
    return { provider: ctx.provider, model: env[nodeName] };
  }

  // 2. Per-capability + per-role DB override
  if (capabilitySlug) {
    const role = NODE_TO_ROLE[nodeName];
    if (role) {
      const cached = dbCache.get(`${capabilitySlug}:${role}`);
      if (cached?.provider && cached?.model) {
        return { provider: cached.provider, model: cached.model };
      }
    }
  }

  // 3. Fall back to context
  return { provider: ctx.provider, model: ctx.model };
}

/** Test/observability helper. */
export function clearCapabilityModelConfigCache(): void {
  dbCache.clear();
  envOverrides = null;
}
