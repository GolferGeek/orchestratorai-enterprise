import { Injectable, Logger } from '@nestjs/common';
import { TargetRepository } from '../repositories/target.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import { Target } from '../interfaces/target.interface';
import { LlmConfig } from '../interfaces/universe.interface';
import { CreateTargetDto, UpdateTargetDto } from '../dto/target.dto';

@Injectable()
export class TargetService {
  private readonly logger = new Logger(TargetService.name);

  constructor(
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
  ) {}

  async findById(id: string): Promise<Target | null> {
    return this.targetRepository.findById(id);
  }

  async findByIdOrThrow(id: string): Promise<Target> {
    return this.targetRepository.findByIdOrThrow(id);
  }

  async findByUniverse(universeId: string): Promise<Target[]> {
    return this.targetRepository.findAll(universeId);
  }

  async findActiveByUniverse(universeId: string): Promise<Target[]> {
    return this.targetRepository.findActiveByUniverse(universeId);
  }

  async findBySymbol(
    universeId: string,
    symbol: string,
  ): Promise<Target | null> {
    return this.targetRepository.findBySymbol(universeId, symbol);
  }

  async create(dto: CreateTargetDto): Promise<Target> {
    this.logger.log(
      `Creating target: ${dto.symbol} (${dto.name}) in universe ${dto.universe_id}`,
    );
    return this.targetRepository.create(dto);
  }

  async update(id: string, dto: UpdateTargetDto): Promise<Target> {
    this.logger.log(`Updating target: ${id}`);
    return this.targetRepository.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Deleting target: ${id}`);
    return this.targetRepository.delete(id);
  }

  /**
   * Get effective LLM configuration for a target
   * Resolves LLM config from target -> universe -> agent hierarchy
   *
   * Priority order:
   * 1. Target-specific override (llm_config_override)
   * 2. Universe-level config (llm_config)
   * 3. Agent-level config (TODO: implement agent config lookup)
   * 4. System defaults
   *
   * @param target - The target to get LLM config for
   * @returns Effective LLM configuration
   */
  async getEffectiveLlmConfig(target: Target): Promise<LlmConfig> {
    // If target has override, use it
    if (target.llm_config_override) {
      this.logger.debug(
        `Using target-specific LLM config for ${target.symbol}`,
      );
      return target.llm_config_override;
    }

    // Otherwise, get universe config
    const universe = await this.universeRepository.findByIdOrThrow(
      target.universe_id,
    );

    if (universe.llm_config) {
      this.logger.debug(
        `Using universe LLM config for target ${target.symbol}`,
      );
      return universe.llm_config;
    }

    // TODO: Load agent-level config if needed
    // For now, return system defaults
    this.logger.debug(
      `Using system default LLM config for target ${target.symbol}`,
    );
    return {
      gold: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      silver: { provider: 'anthropic', model: 'claude-haiku-4-20250514' },
      bronze: { provider: 'anthropic', model: 'claude-haiku-4-20250514' },
    };
  }
}
