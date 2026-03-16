/**
 * Risk Learning Service
 *
 * Manages learnings for the risk analysis system - patterns, rules, and adjustments
 * that improve risk assessment accuracy over time.
 *
 * Key responsibilities:
 * 1. CRUD operations for learnings
 * 2. Apply learnings to risk analysis prompts
 * 3. Track learning effectiveness
 * 4. Handle HITL queue responses (approve/reject/modify)
 * 5. Learning promotion workflow (test -> production)
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  LearningRepository,
  LearningFilter,
} from '../repositories/learning.repository';
import {
  RiskLearning,
  RiskLearningQueueItem,
  CreateRiskLearningData,
  UpdateRiskLearningData,
  UpdateLearningQueueItemData,
  PendingLearningView,
  LearningConfig,
} from '../interfaces/learning.interface';

export interface LearningQueueResponse {
  decision: 'approved' | 'rejected' | 'modified';
  reviewerNotes?: string;
  modifiedTitle?: string;
  modifiedDescription?: string;
  modifiedConfig?: LearningConfig;
}

export interface AppliedLearnings {
  appliedIds: string[];
  rules: string[];
  patterns: string[];
  avoids: string[];
  weightAdjustments: Record<string, number>;
  thresholdAdjustments: Record<string, number>;
}

export interface PromotionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  learning?: RiskLearning;
}

@Injectable()
export class RiskLearningService {
  private readonly logger = new Logger(RiskLearningService.name);

  constructor(private readonly learningRepo: LearningRepository) {}

  // ─── LEARNINGS CRUD ────────────────────────────────────────────────────────

  async createLearning(data: CreateRiskLearningData): Promise<RiskLearning> {
    this.logger.log(
      `Creating learning: ${data.title} (${data.learning_type}) at ${data.scope_level}`,
    );
    return this.learningRepo.createLearning(data);
  }

  async updateLearning(
    id: string,
    data: UpdateRiskLearningData,
  ): Promise<RiskLearning> {
    this.logger.log(`Updating learning: ${id}`);
    return this.learningRepo.updateLearning(id, data);
  }

  async getLearningById(id: string): Promise<RiskLearning | null> {
    return this.learningRepo.findLearningById(id);
  }

  async getLearningByIdOrThrow(id: string): Promise<RiskLearning> {
    return this.learningRepo.findLearningByIdOrThrow(id);
  }

  async getLearningsByScope(
    scopeId: string,
    filter?: LearningFilter,
  ): Promise<RiskLearning[]> {
    return this.learningRepo.findLearningsByScope(scopeId, filter);
  }

  async getAllLearnings(filter?: LearningFilter): Promise<RiskLearning[]> {
    return this.learningRepo.findAllLearnings(filter);
  }

  async getProductionLearnings(
    scopeLevel?: string,
    domain?: string,
    filter?: LearningFilter,
  ): Promise<RiskLearning[]> {
    return this.learningRepo.findProductionLearnings(
      scopeLevel,
      domain,
      filter,
    );
  }

  async deleteLearning(id: string): Promise<void> {
    await this.learningRepo.deleteLearning(id);
    this.logger.log(`Deleted learning: ${id}`);
  }

  // ─── LEARNING QUEUE (HITL) ────────────────────────────────────────────────

  async getPendingQueue(
    filter?: LearningFilter,
  ): Promise<PendingLearningView[]> {
    return this.learningRepo.findPendingQueue(filter);
  }

  async getQueueByScope(
    scopeId: string,
    filter?: LearningFilter,
  ): Promise<RiskLearningQueueItem[]> {
    return this.learningRepo.findQueueByScope(scopeId, filter);
  }

  async getQueueItemById(id: string): Promise<RiskLearningQueueItem | null> {
    return this.learningRepo.findQueueItemById(id);
  }

  async countPendingQueue(filter?: LearningFilter): Promise<number> {
    return this.learningRepo.countPending(filter);
  }

  /**
   * Respond to a learning queue item (HITL review)
   */
  async respondToQueueItem(
    queueItemId: string,
    userId: string,
    response: LearningQueueResponse,
  ): Promise<RiskLearning | null> {
    const queueItem =
      await this.learningRepo.findQueueItemByIdOrThrow(queueItemId);

    if (queueItem.status !== 'pending') {
      throw new ConflictException(
        `Queue item already processed (status: ${queueItem.status})`,
      );
    }

    const updateData: UpdateLearningQueueItemData = {
      status: response.decision,
      reviewed_by_user_id: userId,
      reviewer_notes: response.reviewerNotes,
      reviewed_at: new Date().toISOString(),
    };

    // If approved or modified, create the learning
    if (response.decision === 'approved' || response.decision === 'modified') {
      const learningData: CreateRiskLearningData = {
        scope_level:
          (queueItem.suggested_scope_level as CreateRiskLearningData['scope_level']) ||
          'scope',
        scope_id: queueItem.scope_id ?? undefined,
        subject_id: queueItem.subject_id ?? undefined,
        learning_type:
          (queueItem.suggested_learning_type as CreateRiskLearningData['learning_type']) ||
          'pattern',
        title:
          response.decision === 'modified' && response.modifiedTitle
            ? response.modifiedTitle
            : queueItem.suggested_title,
        description:
          response.decision === 'modified' && response.modifiedDescription
            ? response.modifiedDescription
            : (queueItem.suggested_description ?? undefined),
        config:
          response.decision === 'modified' && response.modifiedConfig
            ? response.modifiedConfig
            : queueItem.suggested_config,
        status: 'testing', // Start in testing status
        is_test: true, // Created as test learning
        source_type: 'ai_approved',
      };

      const learning = await this.learningRepo.createLearning(learningData);
      updateData.learning_id = learning.id;

      await this.learningRepo.updateQueueItem(queueItemId, updateData);

      this.logger.log(
        `Queue item ${queueItemId} ${response.decision} - created learning ${learning.id}`,
      );

      return learning;
    }

    // Rejected - just update the queue item
    await this.learningRepo.updateQueueItem(queueItemId, updateData);

    this.logger.log(`Queue item ${queueItemId} rejected`);

    return null;
  }

  // ─── APPLY LEARNINGS ────────────────────────────────────────────────────────

  /**
   * Get applicable learnings for a risk analysis context
   */
  async getApplicableLearnings(
    domain: string,
    scopeId?: string,
    subjectId?: string,
    dimensionId?: string,
    filter?: LearningFilter,
  ): Promise<RiskLearning[]> {
    const learnings: RiskLearning[] = [];

    // Get runner-level learnings
    const runnerLearnings = await this.learningRepo.findProductionLearnings(
      'runner',
      undefined,
      filter,
    );
    learnings.push(...runnerLearnings);

    // Get domain-level learnings
    const domainLearnings = await this.learningRepo.findProductionLearnings(
      'domain',
      domain,
      filter,
    );
    learnings.push(...domainLearnings);

    // Get scope-level learnings if scope provided
    if (scopeId) {
      const scopeLearnings = await this.learningRepo.findLearningsByScope(
        scopeId,
        filter,
      );
      const productionScopeLearnings = scopeLearnings.filter(
        (l) => l.is_production && l.status === 'active',
      );
      learnings.push(...productionScopeLearnings);
    }

    // Note: subject and dimension level learnings would be added here
    // when those features are implemented

    return learnings;
  }

  /**
   * Apply learnings to a prompt context
   * Returns structured data to inject into risk analysis prompts
   */
  applyLearningsToPrompt(learnings: RiskLearning[]): AppliedLearnings {
    const applied: AppliedLearnings = {
      appliedIds: [],
      rules: [],
      patterns: [],
      avoids: [],
      weightAdjustments: {},
      thresholdAdjustments: {},
    };

    for (const learning of learnings) {
      applied.appliedIds.push(learning.id);

      switch (learning.learning_type) {
        case 'rule':
          applied.rules.push(
            `${learning.title}: ${learning.description || ''}`,
          );
          break;

        case 'pattern':
          applied.patterns.push(
            `${learning.title}: ${learning.description || ''}`,
          );
          break;

        case 'avoid':
          applied.avoids.push(
            `${learning.title}: ${learning.description || ''}`,
          );
          break;

        case 'weight_adjustment':
          if (
            learning.config.dimension_slug &&
            learning.config.weight_modifier
          ) {
            applied.weightAdjustments[learning.config.dimension_slug] =
              learning.config.weight_modifier;
          }
          break;

        case 'threshold':
          if (
            learning.config.threshold_name &&
            learning.config.threshold_value
          ) {
            applied.thresholdAdjustments[learning.config.threshold_name] =
              learning.config.threshold_value;
          }
          break;
      }
    }

    return applied;
  }

  /**
   * Format learnings for injection into a system prompt
   */
  formatLearningsForPrompt(applied: AppliedLearnings): string {
    const sections: string[] = [];

    if (applied.rules.length > 0) {
      sections.push(
        `## Required Rules\n${applied.rules.map((r) => `- ${r}`).join('\n')}`,
      );
    }

    if (applied.patterns.length > 0) {
      sections.push(
        `## Recognized Patterns\n${applied.patterns.map((p) => `- ${p}`).join('\n')}`,
      );
    }

    if (applied.avoids.length > 0) {
      sections.push(
        `## Anti-Patterns to Avoid\n${applied.avoids.map((a) => `- ${a}`).join('\n')}`,
      );
    }

    return sections.join('\n\n');
  }

  // ─── LEARNING EFFECTIVENESS ────────────────────────────────────────────────

  /**
   * Record that a learning was applied during analysis
   */
  async recordApplication(learningId: string): Promise<void> {
    await this.learningRepo.incrementApplied(learningId);
    this.logger.debug(`Recorded application for learning ${learningId}`);
  }

  /**
   * Record that a learning was helpful (improved accuracy)
   */
  async recordHelpful(learningId: string): Promise<void> {
    await this.learningRepo.incrementHelpful(learningId);
    this.logger.debug(`Recorded helpful for learning ${learningId}`);
  }

  /**
   * Update learning effectiveness score
   */
  async updateEffectivenessScore(learningId: string): Promise<RiskLearning> {
    const learning = await this.getLearningByIdOrThrow(learningId);

    if (learning.times_applied === 0) {
      return learning; // No applications yet
    }

    const effectivenessScore = learning.times_helpful / learning.times_applied;

    return this.updateLearning(learningId, {
      effectiveness_score: effectivenessScore,
    });
  }

  // ─── LEARNING PROMOTION ────────────────────────────────────────────────────

  /**
   * Validate if a learning can be promoted to production
   */
  async validateForPromotion(
    learningId: string,
  ): Promise<PromotionValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const learning = await this.getLearningById(learningId);
    if (!learning) {
      errors.push(`Learning not found: ${learningId}`);
      return { valid: false, errors, warnings };
    }

    // Must be a test learning
    if (!learning.is_test) {
      errors.push('Learning must be a test learning (is_test=true) to promote');
    }

    // Must not already be production
    if (learning.is_production) {
      errors.push('Learning is already in production');
    }

    // Must be in testing status
    if (learning.status !== 'testing' && learning.status !== 'active') {
      errors.push(
        `Learning must be in testing or active status (current: ${learning.status})`,
      );
    }

    // Should have been applied at least once
    if (learning.times_applied === 0) {
      warnings.push(
        'Learning has never been applied. Consider running historical replay first.',
      );
    }

    // Check effectiveness if applied
    if (learning.times_applied > 0) {
      const effectivenessScore =
        learning.times_helpful / learning.times_applied;
      if (effectivenessScore < 0.5) {
        warnings.push(
          `Learning has low effectiveness: ${(effectivenessScore * 100).toFixed(0)}%`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      learning,
    };
  }

  /**
   * Promote a test learning to production
   */
  async promoteLearning(
    learningId: string,
    userId: string,
    _notes?: string,
  ): Promise<RiskLearning> {
    const validation = await this.validateForPromotion(learningId);
    if (!validation.valid) {
      throw new BadRequestException(
        `Cannot promote learning: ${validation.errors.join(', ')}`,
      );
    }

    const learning = validation.learning!;

    // Create production copy
    const productionLearning = await this.createLearning({
      scope_level: learning.scope_level,
      domain: learning.domain ?? undefined,
      scope_id: learning.scope_id ?? undefined,
      subject_id: learning.subject_id ?? undefined,
      dimension_id: learning.dimension_id ?? undefined,
      learning_type: learning.learning_type,
      title: learning.title,
      description: learning.description ?? undefined,
      config: learning.config,
      status: 'active',
      is_test: false, // Not a test
      is_production: true, // Is production
      source_type: 'ai_approved',
      parent_learning_id: learningId, // Track lineage
    });

    // Update original to mark as superseded
    await this.updateLearning(learningId, {
      status: 'superseded',
    });

    this.logger.log(
      `Promoted learning ${learningId} -> ${productionLearning.id} (by user ${userId})`,
    );

    return productionLearning;
  }

  /**
   * Retire a learning from production
   */
  async retireLearning(
    learningId: string,
    userId: string,
    reason?: string,
  ): Promise<RiskLearning> {
    const learning = await this.getLearningByIdOrThrow(learningId);

    if (learning.status === 'retired') {
      throw new ConflictException('Learning is already retired');
    }

    const updated = await this.updateLearning(learningId, {
      status: 'retired',
    });

    this.logger.log(
      `Retired learning ${learningId} (by user ${userId}): ${reason || 'No reason provided'}`,
    );

    return updated;
  }

  // ─── STATISTICS ────────────────────────────────────────────────────────────

  /**
   * Get learning statistics
   */
  async getLearningStats(
    scopeId?: string,
    filter?: LearningFilter,
  ): Promise<{
    totalLearnings: number;
    testLearnings: number;
    productionLearnings: number;
    pendingQueue: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    avgEffectiveness: number;
  }> {
    let learnings: RiskLearning[];

    if (scopeId) {
      learnings = await this.getLearningsByScope(scopeId, filter);
    } else {
      learnings = await this.getAllLearnings(filter);
    }

    const pendingCount = await this.countPendingQueue(filter);

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalEffectiveness = 0;
    let effectivenessCount = 0;

    for (const learning of learnings) {
      byType[learning.learning_type] =
        (byType[learning.learning_type] || 0) + 1;
      byStatus[learning.status] = (byStatus[learning.status] || 0) + 1;

      if (learning.effectiveness_score !== null) {
        totalEffectiveness += learning.effectiveness_score;
        effectivenessCount++;
      }
    }

    return {
      totalLearnings: learnings.length,
      testLearnings: learnings.filter((l) => l.is_test).length,
      productionLearnings: learnings.filter((l) => l.is_production).length,
      pendingQueue: pendingCount,
      byType,
      byStatus,
      avgEffectiveness:
        effectivenessCount > 0 ? totalEffectiveness / effectivenessCount : 0,
    };
  }
}
