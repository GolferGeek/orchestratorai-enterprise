import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { SignalRepository } from '../repositories/signal.repository';
import { PredictorRepository } from '../repositories/predictor.repository';
import { LearningQueueService } from './learning-queue.service';
import {
  CreateReviewQueueItemDto,
  ReviewResponseDto,
} from '../dto/review-queue.dto';
import {
  PredictorDirection,
  CreatePredictorData,
  Predictor,
} from '../interfaces/predictor.interface';
import { Signal } from '../interfaces/signal.interface';
import { LearningQueue } from '../interfaces/learning.interface';

/**
 * Result of handling a review response
 */
export interface ReviewResponseResult {
  predictor?: Predictor;
  learning?: LearningQueue;
}

/**
 * Review Queue Item interface
 * Represents items in the prediction.review_queue table
 */
export interface ReviewQueueItem {
  id: string;
  signal_id: string;
  target_id: string;
  confidence: number;
  recommended_action: 'approve' | 'reject' | 'modify';
  assessment_summary: string;
  analyst_reasoning: string | null;
  status: 'pending' | 'resolved';
  decision: 'approve' | 'reject' | 'modify' | null;
  decided_by: string | null;
  decided_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * Review Queue Service
 * Manages Human-in-the-Loop (HITL) review for signals with uncertain confidence (0.4-0.7)
 * These signals need human judgment before becoming predictors
 */
@Injectable()
export class ReviewQueueService {
  private readonly logger = new Logger(ReviewQueueService.name);
  private readonly schema = 'prediction';
  private readonly table = 'review_queue';

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly signalRepository: SignalRepository,
    private readonly predictorRepository: PredictorRepository,
    private readonly learningQueueService: LearningQueueService,
  ) {}

  /**
   * Determine if a signal confidence level requires human review
   * Returns true for confidence between 0.4 and 0.7 (inclusive)
   * These thresholds indicate uncertainty requiring human judgment
   */
  shouldQueueForReview(confidence: number): boolean {
    return confidence >= 0.4 && confidence <= 0.7;
  }

  /**
   * Queue a signal for human review
   * Creates a review queue item and updates signal disposition
   */
  async queueForReview(
    data: CreateReviewQueueItemDto,
  ): Promise<ReviewQueueItem> {
    this.logger.log(
      `Queueing signal ${data.signal_id} for review (confidence: ${data.confidence})`,
    );

    // Create review queue item
    const { data: queueItem, error: queueError } = (await this.db
      .from(this.schema, this.table)
      .insert({
        signal_id: data.signal_id,
        target_id: data.target_id,
        confidence: data.confidence,
        recommended_action: data.recommended_action,
        assessment_summary: data.assessment_summary,
        analyst_reasoning: data.analyst_reasoning ?? null,
        status: 'pending',
      })
      .select()
      .single()) as SupabaseSelectResponse<ReviewQueueItem>;

    if (queueError) {
      this.logger.error(
        `Failed to create review queue item: ${queueError.message}`,
      );
      throw new Error(
        `Failed to create review queue item: ${queueError.message}`,
      );
    }

    if (!queueItem) {
      throw new Error('Create succeeded but no review queue item returned');
    }

    // Update signal disposition to review_pending
    await this.signalRepository.update(data.signal_id, {
      disposition: 'review_pending',
      review_queue_id: queueItem.id,
    });

    this.logger.log(
      `Successfully queued signal ${data.signal_id} for review with ID ${queueItem.id}`,
    );

    return queueItem;
  }

  /**
   * Get all pending review items
   * Optionally filter by target
   */
  async getPendingReviews(targetId?: string): Promise<ReviewQueueItem[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (targetId) {
      query = query.eq('target_id', targetId);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<ReviewQueueItem>;

    if (error) {
      this.logger.error(
        `Failed to fetch pending review items: ${error.message}`,
      );
      throw new Error(`Failed to fetch pending review items: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get a single review item by ID
   */
  async getReviewItem(reviewId: string): Promise<ReviewQueueItem | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', reviewId)
      .single()) as SupabaseSelectResponse<ReviewQueueItem>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch review item: ${error.message}`);
      throw new Error(`Failed to fetch review item: ${error.message}`);
    }

    return data;
  }

  /**
   * Handle human review response
   * Processes the decision and creates/rejects predictor accordingly
   */
  async handleReviewResponse(
    response: ReviewResponseDto,
  ): Promise<ReviewResponseResult> {
    this.logger.log(
      `Processing review response for ${response.review_id}: ${response.decision}`,
    );

    // Get review item
    const reviewItem = await this.getReviewItem(response.review_id);
    if (!reviewItem) {
      throw new NotFoundException(
        `Review item ${response.review_id} not found`,
      );
    }

    if (reviewItem.status !== 'pending') {
      throw new BadRequestException(
        `Review item ${response.review_id} is not pending (status: ${reviewItem.status})`,
      );
    }

    // Get the associated signal
    const signal = await this.signalRepository.findById(reviewItem.signal_id);
    if (!signal) {
      throw new NotFoundException(
        `Signal ${reviewItem.signal_id} not found for review item`,
      );
    }

    const result: ReviewResponseResult = {};

    // Handle based on decision
    if (response.decision === 'approve') {
      result.predictor = await this.createPredictorFromSignal(
        signal,
        reviewItem,
      );
      await this.signalRepository.update(signal.id, {
        disposition: 'predictor_created',
      });
      this.logger.log(
        `Approved review: created predictor ${result.predictor.id}`,
      );
    } else if (response.decision === 'modify') {
      result.predictor = await this.createPredictorFromSignal(
        signal,
        reviewItem,
        response.strength_override,
      );
      await this.signalRepository.update(signal.id, {
        disposition: 'predictor_created',
      });
      this.logger.log(
        `Modified review: created predictor ${result.predictor.id} with strength override`,
      );
    } else if (response.decision === 'reject') {
      await this.signalRepository.update(signal.id, {
        disposition: 'rejected',
      });
      this.logger.log(
        `Rejected review: signal ${signal.id} disposition set to rejected`,
      );
    }

    // Handle learning note if provided
    if (response.learning_note) {
      result.learning = await this.learningQueueService.createSuggestion({
        suggested_scope_level: 'target',
        suggested_target_id: reviewItem.target_id,
        suggested_learning_type: 'pattern',
        suggested_title: `Review learning from signal ${signal.id}`,
        suggested_description: response.learning_note,
        ai_reasoning: `Human review feedback: ${response.learning_note}`,
        ai_confidence: 0.9, // High confidence since it's from human review
      });
      this.logger.log(
        `Queued learning suggestion from review: ${result.learning.id}`,
      );
    }

    // Mark review item as resolved
    const { error: updateError } = (await this.db
      .from(this.schema, this.table)
      .update({
        status: 'resolved',
        decision: response.decision,
        decided_at: new Date().toISOString(),
        notes: response.notes ?? null,
      })
      .eq('id', response.review_id)
      .select()
      .single()) as SupabaseSelectResponse<ReviewQueueItem>;

    if (updateError) {
      this.logger.error(
        `Failed to mark review as resolved: ${updateError.message}`,
      );
      throw new Error(
        `Failed to mark review as resolved: ${updateError.message}`,
      );
    }

    this.logger.log(
      `Review ${response.review_id} marked as resolved with decision: ${response.decision}`,
    );

    return result;
  }

  /**
   * Create a predictor from a signal after human review approval
   * Uses the signal's evaluation result and applies optional strength override
   */
  private async createPredictorFromSignal(
    signal: Signal,
    reviewItem: ReviewQueueItem,
    strengthOverride?: number,
  ): Promise<Predictor> {
    if (!signal.evaluation_result) {
      throw new BadRequestException(
        `Signal ${signal.id} has no evaluation result`,
      );
    }

    const { confidence, analyst_slug, reasoning } = signal.evaluation_result;

    // Calculate strength from confidence (1-10 scale)
    // Default formula: confidence * 10, then override if provided
    const calculatedStrength = Math.round(confidence * 10);
    const finalStrength = strengthOverride ?? calculatedStrength;

    // Ensure strength is in valid range
    const clampedStrength = Math.max(1, Math.min(10, finalStrength));

    // Calculate expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const predictorData: CreatePredictorData = {
      // Legacy signal flow - no article_id available
      target_id: signal.target_id,
      direction: signal.direction as PredictorDirection,
      strength: clampedStrength,
      confidence,
      reasoning,
      analyst_slug,
      analyst_assessment: {
        direction: signal.direction as PredictorDirection,
        confidence,
        reasoning,
        key_factors: [reviewItem.assessment_summary],
        risks: [],
      },
      expires_at: expiresAt.toISOString(),
      status: 'active',
    };

    const predictor = await this.predictorRepository.create(predictorData);

    this.logger.log(
      `Created predictor ${predictor.id} from signal ${signal.id} with strength ${clampedStrength}`,
    );

    return predictor;
  }
}
