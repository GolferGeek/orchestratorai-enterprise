import { Injectable, Logger } from '@nestjs/common';
import { StrategyRepository } from '../repositories/strategy.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import {
  Strategy,
  StrategyParameters,
  AppliedStrategy,
  DEFAULT_STRATEGY_PARAMETERS,
} from '../interfaces/strategy.interface';

/**
 * StrategyService - Manages investment/prediction strategies
 *
 * Strategies define:
 * - Threshold configurations for prediction generation
 * - Analyst weight adjustments
 * - LLM tier preferences
 * - Custom rules and behaviors
 */
@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    private readonly strategyRepository: StrategyRepository,
    private readonly universeRepository: UniverseRepository,
  ) {}

  /**
   * Get all available strategies
   */
  async findAll(): Promise<Strategy[]> {
    return this.strategyRepository.findAll();
  }

  /**
   * Get system strategies only
   */
  async findSystemStrategies(): Promise<Strategy[]> {
    return this.strategyRepository.findSystemStrategies();
  }

  /**
   * Get a strategy by ID
   */
  async findById(id: string): Promise<Strategy | null> {
    return this.strategyRepository.findById(id);
  }

  /**
   * Get a strategy by slug
   */
  async findBySlug(slug: string): Promise<Strategy | null> {
    return this.strategyRepository.findBySlug(slug);
  }

  /**
   * Get strategy by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<Strategy> {
    return this.strategyRepository.findByIdOrThrow(id);
  }

  /**
   * Get the effective strategy for a universe
   * Returns the strategy merged with universe-level overrides
   */
  async getAppliedStrategy(universeId: string): Promise<AppliedStrategy> {
    const universe = await this.universeRepository.findByIdOrThrow(universeId);

    // If universe has a strategy, use it
    if (universe.strategy_id) {
      const strategy = await this.strategyRepository.findByIdOrThrow(
        universe.strategy_id,
      );

      // Merge strategy parameters with universe thresholds
      const effectiveParameters = this.mergeParameters(
        strategy.parameters,
        universe.thresholds || {},
      );

      return {
        strategy,
        effective_parameters: effectiveParameters,
        source: universe.thresholds ? 'universe' : 'strategy',
      };
    }

    // Use default "balanced" strategy
    const defaultStrategy =
      await this.strategyRepository.findBySlugOrThrow('balanced');
    const effectiveParameters = this.mergeParameters(
      defaultStrategy.parameters,
      universe.thresholds || {},
    );

    return {
      strategy: defaultStrategy,
      effective_parameters: effectiveParameters,
      source: universe.thresholds ? 'universe' : 'strategy',
    };
  }

  /**
   * Apply strategy parameters to a universe
   * Updates universe thresholds based on strategy
   */
  async applyStrategy(universeId: string, strategyId: string): Promise<void> {
    const strategy = await this.strategyRepository.findByIdOrThrow(strategyId);

    await this.universeRepository.update(universeId, {
      strategy_id: strategyId,
      // Optionally copy strategy parameters to universe thresholds
      // This allows the user to customize after applying
      thresholds: {
        min_predictors: strategy.parameters.min_predictors,
        min_combined_strength: strategy.parameters.min_combined_strength,
        min_direction_consensus: strategy.parameters.min_direction_consensus,
        predictor_ttl_hours: strategy.parameters.predictor_ttl_hours,
      },
    });

    this.logger.log(
      `Applied strategy ${strategy.slug} to universe ${universeId}`,
    );
  }

  /**
   * Get effective thresholds for a universe
   * Convenience method that returns just the threshold values
   */
  async getEffectiveThresholds(universeId: string): Promise<{
    min_predictors: number;
    min_combined_strength: number;
    min_direction_consensus: number;
    predictor_ttl_hours: number;
    urgent_threshold: number;
    notable_threshold: number;
  }> {
    const applied = await this.getAppliedStrategy(universeId);
    return {
      min_predictors: applied.effective_parameters.min_predictors,
      min_combined_strength: applied.effective_parameters.min_combined_strength,
      min_direction_consensus:
        applied.effective_parameters.min_direction_consensus,
      predictor_ttl_hours: applied.effective_parameters.predictor_ttl_hours,
      urgent_threshold: applied.effective_parameters.urgent_threshold,
      notable_threshold: applied.effective_parameters.notable_threshold,
    };
  }

  /**
   * Get analyst weight adjustments for a universe
   */
  async getAnalystWeights(universeId: string): Promise<Record<string, number>> {
    const applied = await this.getAppliedStrategy(universeId);
    return applied.effective_parameters.analyst_weights;
  }

  /**
   * Get LLM tier preference for a universe
   */
  async getTierPreference(
    universeId: string,
  ): Promise<'gold' | 'silver' | 'bronze' | 'ensemble'> {
    const applied = await this.getAppliedStrategy(universeId);
    return applied.effective_parameters.tier_preference;
  }

  /**
   * Compare two strategies
   * Returns differences in their parameters
   */
  compareStrategies(
    strategy1: Strategy,
    strategy2: Strategy,
  ): {
    differences: Array<{
      parameter: string;
      strategy1_value: unknown;
      strategy2_value: unknown;
    }>;
    identical: boolean;
  } {
    const differences: Array<{
      parameter: string;
      strategy1_value: unknown;
      strategy2_value: unknown;
    }> = [];

    const params1 = { ...DEFAULT_STRATEGY_PARAMETERS, ...strategy1.parameters };
    const params2 = { ...DEFAULT_STRATEGY_PARAMETERS, ...strategy2.parameters };

    const allKeys = new Set([...Object.keys(params1), ...Object.keys(params2)]);

    for (const key of allKeys) {
      const val1 = params1[key as keyof StrategyParameters];
      const val2 = params2[key as keyof StrategyParameters];

      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        differences.push({
          parameter: key,
          strategy1_value: val1,
          strategy2_value: val2,
        });
      }
    }

    return {
      differences,
      identical: differences.length === 0,
    };
  }

  /**
   * Merge strategy parameters with overrides
   * Overrides take precedence over strategy values
   */
  private mergeParameters(
    strategyParams: StrategyParameters,
    overrides: Partial<StrategyParameters>,
  ): Required<StrategyParameters> {
    return {
      ...DEFAULT_STRATEGY_PARAMETERS,
      ...strategyParams,
      ...overrides,
    };
  }

  /**
   * Get strategy recommendations based on historical performance
   * Note: This would require evaluation data to be meaningful
   */
  async recommendStrategy(universeId: string): Promise<{
    recommended: Strategy | null;
    reasoning: string;
    alternatives: Strategy[];
  }> {
    const universe = await this.universeRepository.findByIdOrThrow(universeId);
    const strategies = await this.strategyRepository.findSystemStrategies();

    // Default recommendation logic based on domain
    let recommendedSlug: string;
    let reasoning: string;

    switch (universe.domain) {
      case 'crypto':
        recommendedSlug = 'aggressive';
        reasoning =
          'Crypto markets are volatile; aggressive strategy captures more opportunities';
        break;
      case 'stocks':
        recommendedSlug = 'balanced';
        reasoning =
          'Stock markets benefit from balanced approach with moderate thresholds';
        break;
      case 'elections':
        recommendedSlug = 'conservative';
        reasoning =
          'Election predictions require higher confidence due to limited events';
        break;
      case 'polymarket':
        recommendedSlug = 'contrarian';
        reasoning =
          'Prediction markets often have inefficiencies that contrarian strategies can exploit';
        break;
      default:
        recommendedSlug = 'balanced';
        reasoning = 'Default balanced strategy for unknown domains';
    }

    const recommended =
      strategies.find((s) => s.slug === recommendedSlug) || null;
    const alternatives = strategies.filter((s) => s.slug !== recommendedSlug);

    return {
      recommended,
      reasoning,
      alternatives,
    };
  }
}
