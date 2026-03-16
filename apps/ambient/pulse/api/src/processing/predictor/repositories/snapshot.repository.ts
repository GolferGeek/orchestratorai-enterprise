import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  PredictionSnapshot,
  CreateSnapshotData,
} from '../interfaces/snapshot.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

@Injectable()
export class SnapshotRepository {
  private readonly logger = new Logger(SnapshotRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'snapshots';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async create(snapshotData: CreateSnapshotData): Promise<PredictionSnapshot> {
    const insertData = {
      prediction_id: snapshotData.prediction_id,
      predictors: snapshotData.predictors,
      rejected_signals: snapshotData.rejected_signals,
      // Database column is 'analyst_predictions', interface uses 'analyst_assessments'
      analyst_predictions: snapshotData.analyst_assessments,
      llm_ensemble: snapshotData.llm_ensemble,
      learnings_applied: snapshotData.learnings_applied,
      threshold_evaluation: snapshotData.threshold_evaluation,
      timeline: snapshotData.timeline,
    };

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(insertData)
      .select()
      .single()) as SupabaseSelectResponse<PredictionSnapshot>;

    if (error) {
      this.logger.error(`Failed to create snapshot: ${error.message}`);
      throw new Error(`Failed to create snapshot: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no snapshot returned');
    }

    return data;
  }

  async findByPredictionId(
    predictionId: string,
  ): Promise<PredictionSnapshot | null> {
    // Database uses snake_case column names, interface uses different names
    // analyst_predictions (db) -> analyst_assessments (interface)
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('prediction_id', predictionId)
      .single()) as SupabaseSelectResponse<
      Omit<PredictionSnapshot, 'analyst_assessments'> & {
        analyst_predictions: PredictionSnapshot['analyst_assessments'];
      }
    >;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch snapshot: ${error.message}`);
      throw new Error(`Failed to fetch snapshot: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Map database column names to interface field names
    return {
      ...data,
      analyst_assessments: data.analyst_predictions,
    } as unknown as PredictionSnapshot;
  }
}
