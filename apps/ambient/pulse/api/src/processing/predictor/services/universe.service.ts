import { Injectable, Logger } from '@nestjs/common';
import { UniverseRepository } from '../repositories/universe.repository';
import { Universe, ThresholdConfig } from '../interfaces/universe.interface';
import { CreateUniverseDto, UpdateUniverseDto } from '../dto/universe.dto';

@Injectable()
export class UniverseService {
  private readonly logger = new Logger(UniverseService.name);

  constructor(private readonly universeRepository: UniverseRepository) {}

  async findAll(organizationSlug: string): Promise<Universe[]> {
    return this.universeRepository.findAll(organizationSlug);
  }

  async findById(id: string): Promise<Universe | null> {
    return this.universeRepository.findById(id);
  }

  async findByIdOrThrow(id: string): Promise<Universe> {
    return this.universeRepository.findByIdOrThrow(id);
  }

  async create(dto: CreateUniverseDto): Promise<Universe> {
    this.logger.log(
      `Creating universe: ${dto.name} in org ${dto.organization_slug}`,
    );
    return this.universeRepository.create(dto);
  }

  async update(id: string, dto: UpdateUniverseDto): Promise<Universe> {
    this.logger.log(`Updating universe: ${id}`);
    return this.universeRepository.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Deleting universe: ${id}`);
    return this.universeRepository.delete(id);
  }

  async findByAgentSlug(
    agentSlug: string,
    organizationSlug: string,
  ): Promise<Universe[]> {
    return this.universeRepository.findByAgentSlug(agentSlug, organizationSlug);
  }

  /**
   * Find universes for a specific agent (alias for findByAgentSlug)
   */
  async findByAgent(
    agentSlug: string,
    organizationSlug: string,
  ): Promise<Universe[]> {
    return this.findByAgentSlug(agentSlug, organizationSlug);
  }

  /**
   * Get effective thresholds for a universe
   * Merges default thresholds with strategy defaults (if applicable) and universe-specific overrides
   *
   * @param universe - The universe to get thresholds for
   * @returns Effective threshold configuration
   */
  getEffectiveThresholds(universe: Universe): ThresholdConfig & {
    min_predictors: number;
    min_combined_strength: number;
    min_direction_consensus: number;
    predictor_ttl_hours: number;
  } {
    // Default thresholds (can be overridden by strategy or universe config)
    const defaults = {
      min_predictors: 3,
      min_combined_strength: 15,
      min_direction_consensus: 0.6,
      predictor_ttl_hours: 24,
    };

    // TODO: Load strategy defaults if strategy_id is set
    // For now, just merge universe thresholds with defaults
    return {
      ...defaults,
      ...(universe.thresholds || {}),
    };
  }
}
