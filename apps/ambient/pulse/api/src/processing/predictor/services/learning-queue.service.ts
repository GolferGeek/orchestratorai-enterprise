import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { LearningQueueRepository } from '../repositories/learning-queue.repository';
import { LearningService } from './learning.service';
import {
  LearningQueue,
  LearningQueueStatus,
} from '../interfaces/learning.interface';
import {
  CreateLearningQueueDto,
  ReviewLearningQueueDto,
} from '../dto/learning.dto';

@Injectable()
export class LearningQueueService {
  private readonly logger = new Logger(LearningQueueService.name);

  constructor(
    private readonly learningQueueRepository: LearningQueueRepository,
    private readonly learningService: LearningService,
  ) {}

  /**
   * Get pending items awaiting review
   */
  async getPendingItems(limit?: number): Promise<LearningQueue[]> {
    return this.learningQueueRepository.findPending(limit);
  }

  /**
   * Get all items by status
   */
  async getItemsByStatus(
    status: LearningQueueStatus,
  ): Promise<LearningQueue[]> {
    return this.learningQueueRepository.findByStatus(status);
  }

  async findById(id: string): Promise<LearningQueue | null> {
    return this.learningQueueRepository.findById(id);
  }

  async findByIdOrThrow(id: string): Promise<LearningQueue> {
    return this.learningQueueRepository.findByIdOrThrow(id);
  }

  /**
   * Create a new AI-suggested learning for review
   */
  async createSuggestion(dto: CreateLearningQueueDto): Promise<LearningQueue> {
    this.logger.log(
      `Creating learning suggestion: ${dto.suggested_title} at scope ${dto.suggested_scope_level}`,
    );
    return this.learningQueueRepository.create({
      ...dto,
      status: 'pending',
    });
  }

  /**
   * Review and respond to a learning queue item
   */
  async respond(
    id: string,
    dto: ReviewLearningQueueDto,
    userId: string,
  ): Promise<LearningQueue> {
    const item = await this.findByIdOrThrow(id);

    if (item.status !== 'pending') {
      throw new BadRequestException(
        `Cannot review item that is not pending: ${item.status}`,
      );
    }

    const updateData: Partial<LearningQueue> = {
      status: dto.status,
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: userId,
      reviewer_notes: dto.reviewer_notes,
    };

    if (dto.status === 'approved' || dto.status === 'modified') {
      const finalScopeLevel =
        dto.final_scope_level || item.suggested_scope_level;
      const finalDomain =
        dto.final_domain !== undefined
          ? dto.final_domain
          : item.suggested_domain;
      const finalUniverseId =
        dto.final_universe_id !== undefined
          ? dto.final_universe_id
          : item.suggested_universe_id;
      const finalTargetId =
        dto.final_target_id !== undefined
          ? dto.final_target_id
          : item.suggested_target_id;
      const finalAnalystId =
        dto.final_analyst_id !== undefined
          ? dto.final_analyst_id
          : item.suggested_analyst_id;
      const finalTitle = dto.final_title || item.suggested_title;
      const finalDescription =
        dto.final_description || item.suggested_description;
      const finalConfig = dto.final_config || item.suggested_config;
      const finalLearningType =
        dto.final_learning_type || item.suggested_learning_type;

      updateData.final_scope_level = finalScopeLevel;
      updateData.final_domain = finalDomain;
      updateData.final_universe_id = finalUniverseId;
      updateData.final_target_id = finalTargetId;
      updateData.final_analyst_id = finalAnalystId;

      const learning = await this.learningService.create({
        scope_level: finalScopeLevel,
        domain: finalDomain ?? undefined,
        universe_id: finalUniverseId ?? undefined,
        target_id: finalTargetId ?? undefined,
        analyst_id: finalAnalystId ?? undefined,
        learning_type: finalLearningType,
        title: finalTitle,
        description: finalDescription,
        config: finalConfig,
        source_type: 'ai_approved',
        source_evaluation_id: item.source_evaluation_id ?? undefined,
        source_missed_opportunity_id:
          item.source_missed_opportunity_id ?? undefined,
      });

      updateData.learning_id = learning.id;
      this.logger.log(`Created learning ${learning.id} from queue item ${id}`);
    }

    return this.learningQueueRepository.update(id, updateData);
  }

  async findBySourceEvaluation(evaluationId: string): Promise<LearningQueue[]> {
    return this.learningQueueRepository.findBySourceEvaluation(evaluationId);
  }

  async findBySourceMissedOpportunity(
    missedOpportunityId: string,
  ): Promise<LearningQueue[]> {
    return this.learningQueueRepository.findBySourceMissedOpportunity(
      missedOpportunityId,
    );
  }
}
