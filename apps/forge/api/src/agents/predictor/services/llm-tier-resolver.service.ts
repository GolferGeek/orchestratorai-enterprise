import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  LlmTier,
  ResolvedLlmTier,
  LlmTierMapping,
} from '../interfaces/llm-tier.interface';
import { LlmConfig } from '../interfaces/universe.interface';

export interface TierResolutionContext {
  targetLlmConfig?: LlmConfig | null;
  universeLlmConfig?: LlmConfig | null;
  agentLlmConfig?: LlmConfig | null;
}

export interface TierExecutionContextOptions {
  baseContext: ExecutionContext;
  tier: LlmTier;
  analystSlug: string;
  taskId?: string;
}

/**
 * LLM Tier Resolver Service
 *
 * This service resolves which LLM provider/model to use for a given tier (gold/silver/bronze).
 * It follows a priority hierarchy:
 * 1. Target LLM config override
 * 2. Universe LLM config
 * 3. Agent metadata LLM config
 * 4. Default from prediction.llm_tier_mapping view
 *
 * The service also creates ExecutionContext objects for tier-specific LLM calls,
 * ensuring proper cost tracking and observability.
 *
 * @see prediction.llm_tier_mapping view (migration 20260109000010)
 * @see apps/api/src/prediction-runner/interfaces/llm-tier.interface.ts
 */
@Injectable()
export class LlmTierResolverService {
  private readonly logger = new Logger(LlmTierResolverService.name);
  private tierMappingCache: Map<LlmTier, LlmTierMapping> | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Load tier mappings from the prediction.llm_tier_mapping view.
   * This view maps tiers to models from public.llm_models.
   *
   * IMPORTANT: Environment variables DEFAULT_LLM_PROVIDER and DEFAULT_LLM_MODEL
   * take HIGHEST priority and will override database mappings. This allows
   * switching to local LLMs (Ollama) without database changes.
   *
   * The view structure:
   * - prediction_tier: 'gold' | 'silver' | 'bronze' (mapped from model_tier)
   * - provider: provider name
   * - model: model name
   * - model_tier: 'flagship' | 'standard' | 'economy' | 'local'
   */
  private async loadTierMappings(): Promise<Map<LlmTier, LlmTierMapping>> {
    // Check for environment override FIRST - highest priority
    const envProvider = this.configService.get<string>('DEFAULT_LLM_PROVIDER');
    const envModel = this.configService.get<string>('DEFAULT_LLM_MODEL');

    if (envProvider && envModel) {
      this.logger.log(
        `Environment LLM override active: ${envProvider}/${envModel} for all tiers`,
      );
      return this.getDefaultMappings(); // This will return env-based mappings
    }

    const now = Date.now();

    // Return cached if still valid
    if (this.tierMappingCache && now < this.cacheExpiry) {
      return this.tierMappingCache;
    }

    this.logger.debug('Loading LLM tier mappings from database');

    const { data, error } = (await this.db
      .from('prediction', 'llm_tier_mapping')
      .select('prediction_tier, provider, model, model_tier')
      .eq('is_enabled', true)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to load tier mappings: ${error.message}`);
      // Return defaults if DB fails
      return this.getDefaultMappings();
    }

    interface TierMappingRow {
      prediction_tier: string;
      provider: string;
      model: string;
      model_tier: string;
    }

    const mappings = new Map<LlmTier, LlmTierMapping>();
    for (const row of (data as TierMappingRow[] | null) || []) {
      const tier = row.prediction_tier as LlmTier;
      // Only use first mapping per tier (highest priority)
      if (!mappings.has(tier)) {
        mappings.set(tier, {
          tier,
          provider: row.provider,
          model: row.model,
          model_tier: row.model_tier,
        });
      }
    }

    // Ensure all tiers have mappings (use defaults if missing)
    const defaults = this.getDefaultMappings();
    for (const tier of ['gold', 'silver', 'bronze'] as LlmTier[]) {
      if (!mappings.has(tier)) {
        const defaultMapping = defaults.get(tier);
        if (defaultMapping) {
          mappings.set(tier, defaultMapping);
        }
      }
    }

    this.tierMappingCache = mappings;
    this.cacheExpiry = now + this.CACHE_TTL_MS;

    return mappings;
  }

  /**
   * Get default tier mappings as fallback.
   * These are used when the database is unavailable or missing tier mappings.
   *
   * If DEFAULT_LLM_PROVIDER and DEFAULT_LLM_MODEL are set in environment,
   * all tiers will use that provider/model to avoid API costs.
   */
  private getDefaultMappings(): Map<LlmTier, LlmTierMapping> {
    const defaults = new Map<LlmTier, LlmTierMapping>();

    // Check for environment override - if set, use for ALL tiers
    const envProvider = this.configService.get<string>('DEFAULT_LLM_PROVIDER');
    const envModel = this.configService.get<string>('DEFAULT_LLM_MODEL');

    if (envProvider && envModel) {
      this.logger.log(
        `Using environment LLM override for all tiers: ${envProvider}/${envModel}`,
      );

      for (const tier of ['gold', 'silver', 'bronze'] as LlmTier[]) {
        defaults.set(tier, {
          tier,
          provider: envProvider,
          model: envModel,
          model_tier: 'local',
        });
      }
      return defaults;
    }

    // Using Ollama qwen2.5:7b for all tiers - local, no API cost
    defaults.set('gold', {
      tier: 'gold',
      provider: 'ollama',
      model: 'qwen2.5:7b',
      model_tier: 'local',
    });

    defaults.set('silver', {
      tier: 'silver',
      provider: 'ollama',
      model: 'qwen2.5:7b',
      model_tier: 'local',
    });

    defaults.set('bronze', {
      tier: 'bronze',
      provider: 'ollama',
      model: 'qwen2.5:7b',
      model_tier: 'local',
    });

    return defaults;
  }

  /**
   * Resolve the LLM provider/model for a given tier.
   *
   * Priority order:
   * 1. Target override (from target.llm_config_override)
   * 2. Universe config (from universe.llm_config)
   * 3. Agent metadata (from agent metadata)
   * 4. Default (from prediction.llm_tier_mapping view)
   *
   * @param tier - The LLM tier to resolve ('gold', 'silver', or 'bronze')
   * @param context - Optional resolution context with config overrides
   * @returns Resolved provider and model for the tier
   */
  async resolveTier(
    tier: LlmTier,
    context?: TierResolutionContext,
  ): Promise<ResolvedLlmTier> {
    // Check target override first
    if (context?.targetLlmConfig?.[tier]) {
      const config = context.targetLlmConfig[tier];
      this.logger.debug(
        `Resolved tier ${tier} from target override: ${config.provider}/${config.model}`,
      );
      return {
        tier,
        provider: config.provider,
        model: config.model,
      };
    }

    // Check universe config
    if (context?.universeLlmConfig?.[tier]) {
      const config = context.universeLlmConfig[tier];
      this.logger.debug(
        `Resolved tier ${tier} from universe config: ${config.provider}/${config.model}`,
      );
      return {
        tier,
        provider: config.provider,
        model: config.model,
      };
    }

    // Check agent config
    if (context?.agentLlmConfig?.[tier]) {
      const config = context.agentLlmConfig[tier];
      this.logger.debug(
        `Resolved tier ${tier} from agent config: ${config.provider}/${config.model}`,
      );
      return {
        tier,
        provider: config.provider,
        model: config.model,
      };
    }

    // Fall back to default from tier mappings
    const mappings = await this.loadTierMappings();
    const mapping = mappings.get(tier);

    if (!mapping) {
      this.logger.warn(
        `No mapping found for tier ${tier}, using silver as fallback`,
      );
      const silverMapping =
        mappings.get('silver') || this.getDefaultMappings().get('silver')!;
      return {
        tier: 'silver',
        provider: silverMapping.provider,
        model: silverMapping.model,
      };
    }

    this.logger.debug(
      `Resolved tier ${tier} from default mapping: ${mapping.provider}/${mapping.model}`,
    );
    return {
      tier,
      provider: mapping.provider,
      model: mapping.model,
    };
  }

  /**
   * Create an ExecutionContext for tier-specific LLM calls.
   * This ensures proper cost tracking and observability.
   *
   * Note: The provider and model fields should be set by the caller
   * after resolving the tier using resolveTier().
   *
   * @param options - Options for creating the tier execution context
   * @returns ExecutionContext with analyst tracking
   */
  createTierExecutionContext(
    options: TierExecutionContextOptions,
  ): ExecutionContext {
    const { baseContext, analystSlug, taskId } = options;

    return {
      ...baseContext,
      taskId: taskId || baseContext.taskId,
      // Provider and model will be set by the caller after resolving tier
      // This is just a base context with analyst tracking
      agentSlug: analystSlug,
      agentType: 'analyst',
    };
  }

  /**
   * Resolve tier and create ExecutionContext in one call.
   * This is a convenience method that combines resolveTier and createTierExecutionContext.
   *
   * @param baseContext - Base ExecutionContext to clone
   * @param tier - LLM tier to resolve
   * @param analystSlug - Analyst slug for tracking
   * @param resolutionContext - Optional resolution context with config overrides
   * @returns ExecutionContext with resolved provider/model and ResolvedLlmTier
   */
  async createTierContext(
    baseContext: ExecutionContext,
    tier: LlmTier,
    analystSlug: string,
    resolutionContext?: TierResolutionContext,
  ): Promise<{ context: ExecutionContext; resolved: ResolvedLlmTier }> {
    const resolved = await this.resolveTier(tier, resolutionContext);

    const context: ExecutionContext = {
      ...baseContext,
      provider: resolved.provider,
      model: resolved.model,
      agentSlug: analystSlug,
      agentType: 'analyst',
    };

    return { context, resolved };
  }

  /**
   * Clear the tier mapping cache.
   * Useful for testing or when LLM model configurations are updated.
   */
  clearCache(): void {
    this.tierMappingCache = null;
    this.cacheExpiry = 0;
    this.logger.debug('Tier mapping cache cleared');
  }
}
