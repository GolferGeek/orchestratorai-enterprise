import { Injectable, Logger } from '@nestjs/common';
import { LearningRepository } from '../repositories/learning.repository';
import {
  Learning,
  ActiveLearning,
  LearningStatus,
} from '../interfaces/learning.interface';
import { CreateLearningDto, UpdateLearningDto } from '../dto/learning.dto';

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(private readonly learningRepository: LearningRepository) {}

  /**
   * Get active learnings for a target (uses database function)
   */
  async getActiveLearnings(
    targetId: string,
    tier?: string,
    analystId?: string,
  ): Promise<ActiveLearning[]> {
    return this.learningRepository.getActiveLearnings(
      targetId,
      tier,
      analystId,
    );
  }

  async findById(id: string): Promise<Learning | null> {
    return this.learningRepository.findById(id);
  }

  async findByIdOrThrow(id: string): Promise<Learning> {
    return this.learningRepository.findByIdOrThrow(id);
  }

  async create(dto: CreateLearningDto): Promise<Learning> {
    this.logger.log(
      `Creating learning: ${dto.title} at scope ${dto.scope_level}`,
    );
    return this.learningRepository.create(dto);
  }

  async update(id: string, dto: UpdateLearningDto): Promise<Learning> {
    this.logger.log(`Updating learning: ${id}`);
    return this.learningRepository.update(id, dto);
  }

  /**
   * Record that a learning was applied (for tracking effectiveness)
   */
  async recordApplication(id: string, wasHelpful?: boolean): Promise<void> {
    await this.learningRepository.incrementApplication(id, wasHelpful);
  }

  /**
   * Supersede a learning with a new version
   */
  async supersede(
    oldId: string,
    newLearning: CreateLearningDto,
  ): Promise<Learning> {
    const old = await this.findByIdOrThrow(oldId);

    const created = await this.create({
      ...newLearning,
      version: old.version + 1,
    });

    await this.learningRepository.supersede(oldId, created.id);
    this.logger.log(`Superseded learning ${oldId} with ${created.id}`);

    return created;
  }

  async findByScope(
    scopeLevel: string,
    domain?: string,
    universeId?: string,
    targetId?: string,
    status?: LearningStatus,
  ): Promise<Learning[]> {
    return this.learningRepository.findByScope(
      scopeLevel,
      domain,
      universeId,
      targetId,
      status,
    );
  }

  /**
   * Apply learnings to a prompt context
   * Returns which learnings were applied and their effect
   */
  applyLearningsToPrompt(
    learnings: ActiveLearning[],
    promptContext: { rules: string[]; patterns: string[]; avoids: string[] },
  ): {
    appliedIds: string[];
    effect: { rules: string[]; patterns: string[]; avoids: string[] };
  } {
    const appliedIds: string[] = [];
    const effect = {
      rules: [...promptContext.rules],
      patterns: [...promptContext.patterns],
      avoids: [...promptContext.avoids],
    };

    for (const learning of learnings) {
      appliedIds.push(learning.learning_id);

      switch (learning.learning_type) {
        case 'rule':
          effect.rules.push(`${learning.title}: ${learning.description}`);
          break;
        case 'pattern':
          effect.patterns.push(`${learning.title}: ${learning.description}`);
          break;
        case 'avoid':
          effect.avoids.push(`${learning.title}: ${learning.description}`);
          break;
        case 'weight_adjustment':
        case 'threshold':
          break;
      }
    }

    return { appliedIds, effect };
  }
}
