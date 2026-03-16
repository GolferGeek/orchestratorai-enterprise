import { Injectable, Logger } from '@nestjs/common';
import { SnapshotRepository } from '../repositories/snapshot.repository';
import {
  PredictionSnapshot,
  CreateSnapshotData,
  SnapshotBuildInput,
} from '../interfaces/snapshot.interface';

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(private readonly snapshotRepository: SnapshotRepository) {}

  /**
   * Create a snapshot capturing complete prediction state
   */
  async createSnapshot(data: CreateSnapshotData): Promise<PredictionSnapshot> {
    this.logger.log(`Creating snapshot for prediction: ${data.prediction_id}`);
    return this.snapshotRepository.create(data);
  }

  /**
   * Get snapshot for a prediction
   */
  async getSnapshot(predictionId: string): Promise<PredictionSnapshot | null> {
    return this.snapshotRepository.findByPredictionId(predictionId);
  }

  /**
   * Helper to build snapshot data from various inputs
   * Collects predictor details, rejected signals, assessments, etc.
   */
  buildSnapshotData(input: SnapshotBuildInput): CreateSnapshotData {
    return {
      prediction_id: input.predictionId,
      predictors: input.predictorSnapshots,
      rejected_signals: input.rejectedSignals,
      analyst_assessments: input.analystAssessments,
      llm_ensemble: input.llmEnsemble,
      learnings_applied: input.learnings,
      threshold_evaluation: input.thresholdEval,
      timeline: input.timeline,
    };
  }
}
