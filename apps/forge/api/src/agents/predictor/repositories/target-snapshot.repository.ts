import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  TargetSnapshot,
  CreateTargetSnapshotData,
  PriceMove,
  MoveDetectionConfig,
} from '../interfaces/target-snapshot.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

@Injectable()
export class TargetSnapshotRepository {
  private readonly logger = new Logger(TargetSnapshotRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'target_snapshots';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async findById(id: string): Promise<TargetSnapshot | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<TargetSnapshot>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch target snapshot: ${error.message}`);
      throw new Error(`Failed to fetch target snapshot: ${error.message}`);
    }

    return data;
  }

  /**
   * Find the most recent snapshot for a target
   */
  async findLatest(targetId: string): Promise<TargetSnapshot | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<TargetSnapshot>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch latest snapshot: ${error.message}`);
      throw new Error(`Failed to fetch latest snapshot: ${error.message}`);
    }

    return data;
  }

  /**
   * Find snapshot closest to a specific time
   */
  async findAtTime(
    targetId: string,
    timestamp: string,
  ): Promise<TargetSnapshot | null> {
    // Find the snapshot closest to the given time
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .lte('captured_at', timestamp)
      .order('captured_at', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<TargetSnapshot>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch snapshot at time: ${error.message}`);
      throw new Error(`Failed to fetch snapshot at time: ${error.message}`);
    }

    return data;
  }

  /**
   * Find snapshot closest to a specific Date
   */
  async findClosestToTime(
    targetId: string,
    timestamp: Date,
  ): Promise<TargetSnapshot | null> {
    return this.findAtTime(targetId, timestamp.toISOString());
  }

  /**
   * Find snapshots within a time range
   */
  async findInRange(
    targetId: string,
    startTime: string,
    endTime: string,
  ): Promise<TargetSnapshot[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .gte('captured_at', startTime)
      .lte('captured_at', endTime)
      .order('captured_at', {
        ascending: true,
      })) as SupabaseSelectListResponse<TargetSnapshot>;

    if (error) {
      this.logger.error(`Failed to fetch snapshots in range: ${error.message}`);
      throw new Error(`Failed to fetch snapshots in range: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find snapshots from the last N hours
   */
  async findRecent(targetId: string, hours: number): Promise<TargetSnapshot[]> {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    return this.findInRange(
      targetId,
      startTime.toISOString(),
      new Date().toISOString(),
    );
  }

  /**
   * Create a new snapshot
   */
  async create(
    snapshotData: CreateTargetSnapshotData,
  ): Promise<TargetSnapshot> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert({
        ...snapshotData,
        value_type: snapshotData.value_type || 'price',
        captured_at: snapshotData.captured_at || new Date().toISOString(),
      })
      .select()
      .single()) as SupabaseSelectResponse<TargetSnapshot>;

    if (error) {
      this.logger.error(`Failed to create target snapshot: ${error.message}`);
      throw new Error(`Failed to create target snapshot: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no target snapshot returned');
    }

    return data;
  }

  /**
   * Create multiple snapshots in batch
   */
  async createBatch(
    snapshots: CreateTargetSnapshotData[],
  ): Promise<TargetSnapshot[]> {
    const now = new Date().toISOString();
    const prepared = snapshots.map((s) => ({
      ...s,
      value_type: s.value_type || 'price',
      captured_at: s.captured_at || now,
    }));

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(prepared)
      .select()) as SupabaseSelectListResponse<TargetSnapshot>;

    if (error) {
      this.logger.error(`Failed to create target snapshots: ${error.message}`);
      throw new Error(`Failed to create target snapshots: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Detect significant price moves based on configuration
   */
  async detectMoves(
    targetId: string,
    config: MoveDetectionConfig,
  ): Promise<PriceMove[]> {
    const snapshots = await this.findRecent(targetId, config.lookback_hours);

    if (snapshots.length < 2) {
      return [];
    }

    const moves: PriceMove[] = [];

    // Sliding window analysis to detect significant moves
    for (let i = 0; i < snapshots.length; i++) {
      for (let j = i + 1; j < snapshots.length; j++) {
        const start = snapshots[i]!;
        const end = snapshots[j]!;

        const startTime = new Date(start.captured_at);
        const endTime = new Date(end.captured_at);
        const durationHours =
          (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

        // Skip if duration is too short
        if (durationHours < config.min_duration_hours) {
          continue;
        }

        const changePercent = ((end.value - start.value) / start.value) * 100;
        const absChangePercent = Math.abs(changePercent);

        // Check if move is significant
        if (absChangePercent >= config.min_change_percent) {
          moves.push({
            target_id: targetId,
            start_value: start.value,
            end_value: end.value,
            start_time: start.captured_at,
            end_time: end.captured_at,
            change_percent: changePercent,
            direction: changePercent > 0 ? 'up' : 'down',
            duration_hours: durationHours,
          });

          // Skip ahead to avoid overlapping moves
          i = j;
          break;
        }
      }
    }

    return moves;
  }

  /**
   * Get value at a specific time (interpolated if necessary)
   */
  async getValueAtTime(
    targetId: string,
    timestamp: string,
  ): Promise<number | null> {
    const snapshot = await this.findAtTime(targetId, timestamp);
    return snapshot?.value ?? null;
  }

  /**
   * Calculate change between two times
   */
  async calculateChange(
    targetId: string,
    startTime: string,
    endTime: string,
  ): Promise<{
    start_value: number | null;
    end_value: number | null;
    change_absolute: number | null;
    change_percent: number | null;
  }> {
    const [startSnapshot, endSnapshot] = await Promise.all([
      this.findAtTime(targetId, startTime),
      this.findAtTime(targetId, endTime),
    ]);

    if (!startSnapshot || !endSnapshot) {
      return {
        start_value: startSnapshot?.value ?? null,
        end_value: endSnapshot?.value ?? null,
        change_absolute: null,
        change_percent: null,
      };
    }

    const changeAbsolute = endSnapshot.value - startSnapshot.value;
    const changePercent = (changeAbsolute / startSnapshot.value) * 100;

    return {
      start_value: startSnapshot.value,
      end_value: endSnapshot.value,
      change_absolute: changeAbsolute,
      change_percent: changePercent,
    };
  }

  /**
   * Delete old snapshots to manage storage
   * Keeps hourly snapshots for the retention period
   */
  async cleanupOldSnapshots(
    targetId: string,
    retentionDays = 90,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('target_id', targetId)
      .lt('captured_at', cutoffDate.toISOString())
      .select('id')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to cleanup snapshots: ${error.message}`);
      throw new Error(`Failed to cleanup snapshots: ${error.message}`);
    }

    const deletedRows = (data ?? []) as Array<{ id: string }>;
    const deletedCount = deletedRows.length;
    if (deletedCount > 0) {
      this.logger.debug(
        `Cleaned up ${deletedCount} old snapshots for target ${targetId}`,
      );
    }

    return deletedCount;
  }
}
