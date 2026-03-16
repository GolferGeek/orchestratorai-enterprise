import { Injectable, Logger } from '@nestjs/common';
import { TargetSnapshotRepository } from '../repositories/target-snapshot.repository';
import { TargetRepository } from '../repositories/target.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import {
  TargetSnapshot,
  CreateTargetSnapshotData,
  PriceMove,
  MoveDetectionConfig,
  DEFAULT_MOVE_DETECTION_CONFIG,
  SnapshotSource,
} from '../interfaces/target-snapshot.interface';
import { MarketDataRouterService } from './market-data/market-data-router.service';
import type { MarketDomain } from './market-data/types';

/**
 * TargetSnapshotService - Captures and manages target price/value history
 *
 * Used for:
 * - Outcome tracking (comparing predictions against actual values)
 * - Missed opportunity detection (finding significant moves without predictions)
 * - Historical analysis
 */
@Injectable()
export class TargetSnapshotService {
  private readonly logger = new Logger(TargetSnapshotService.name);

  constructor(
    private readonly snapshotRepository: TargetSnapshotRepository,
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
    private readonly marketDataRouter: MarketDataRouterService,
  ) {}

  /**
   * Capture current value for a target
   * Also updates target.current_price for quick access
   */
  async captureSnapshot(
    targetId: string,
    value: number,
    source: SnapshotSource,
    metadata?: Record<string, unknown>,
  ): Promise<TargetSnapshot> {
    const target = await this.targetRepository.findByIdOrThrow(targetId);

    const snapshotData: CreateTargetSnapshotData = {
      target_id: targetId,
      value,
      value_type: this.getValueType(target.target_type),
      source,
      metadata,
    };

    // Create the snapshot in history table
    const snapshot = await this.snapshotRepository.create(snapshotData);

    // Also update the target's current_price for quick access
    await this.targetRepository.updateCurrentPrice(targetId, value);

    return snapshot;
  }

  /**
   * Capture snapshots for multiple targets in batch
   */
  async captureSnapshots(
    snapshots: Array<{
      targetId: string;
      value: number;
      source: SnapshotSource;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<TargetSnapshot[]> {
    const snapshotData: CreateTargetSnapshotData[] = [];

    for (const s of snapshots) {
      const target = await this.targetRepository.findById(s.targetId);
      if (target) {
        snapshotData.push({
          target_id: s.targetId,
          value: s.value,
          value_type: this.getValueType(target.target_type),
          source: s.source,
          metadata: s.metadata,
        });
      }
    }

    return this.snapshotRepository.createBatch(snapshotData);
  }

  /**
   * Get the latest value for a target
   * First checks target.current_price (cached), falls back to snapshot query
   */
  async getLatestValue(targetId: string): Promise<number | null> {
    // Try cached current_price first
    const target = await this.targetRepository.findById(targetId);
    if (target?.current_price !== null && target?.current_price !== undefined) {
      return target.current_price;
    }

    // Fall back to snapshot query
    const snapshot = await this.snapshotRepository.findLatest(targetId);
    return snapshot?.value ?? null;
  }

  /**
   * Get value at a specific time
   */
  async getValueAtTime(
    targetId: string,
    timestamp: string,
  ): Promise<number | null> {
    return this.snapshotRepository.getValueAtTime(targetId, timestamp);
  }

  /**
   * Calculate price change between two times
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
    return this.snapshotRepository.calculateChange(
      targetId,
      startTime,
      endTime,
    );
  }

  /**
   * Detect significant price moves for a target
   */
  async detectMoves(
    targetId: string,
    config?: Partial<MoveDetectionConfig>,
  ): Promise<PriceMove[]> {
    const target = await this.targetRepository.findByIdOrThrow(targetId);
    const universe = await this.universeRepository.findByIdOrThrow(
      target.universe_id,
    );

    // Get domain-specific config with fallback defaults
    const defaultConfig: MoveDetectionConfig = {
      min_change_percent: 5,
      lookback_hours: 48,
      min_duration_hours: 4,
    };
    const domainConfig =
      DEFAULT_MOVE_DETECTION_CONFIG[universe.domain] ?? defaultConfig;

    const fullConfig: MoveDetectionConfig = {
      min_change_percent:
        config?.min_change_percent ?? domainConfig.min_change_percent,
      lookback_hours: config?.lookback_hours ?? domainConfig.lookback_hours,
      min_duration_hours:
        config?.min_duration_hours ?? domainConfig.min_duration_hours,
    };

    return this.snapshotRepository.detectMoves(targetId, fullConfig);
  }

  /**
   * Detect moves across all targets in a universe
   */
  async detectMovesInUniverse(
    universeId: string,
    config?: Partial<MoveDetectionConfig>,
  ): Promise<Map<string, PriceMove[]>> {
    const targets = await this.targetRepository.findAll(universeId);
    const moves = new Map<string, PriceMove[]>();

    for (const target of targets) {
      const targetMoves = await this.detectMoves(target.id, config);
      if (targetMoves.length > 0) {
        moves.set(target.id, targetMoves);
      }
    }

    return moves;
  }

  /**
   * Get historical snapshots for a target
   */
  async getHistory(targetId: string, hours: number): Promise<TargetSnapshot[]> {
    return this.snapshotRepository.findRecent(targetId, hours);
  }

  /**
   * Get snapshots in a time range
   */
  async getHistoryInRange(
    targetId: string,
    startTime: string,
    endTime: string,
  ): Promise<TargetSnapshot[]> {
    return this.snapshotRepository.findInRange(targetId, startTime, endTime);
  }

  /**
   * Fetch and capture value from external API based on target type
   * This is a dispatcher that calls domain-specific fetchers
   */
  async fetchAndCaptureValue(targetId: string): Promise<TargetSnapshot | null> {
    const target = await this.targetRepository.findByIdOrThrow(targetId);
    const universe = await this.universeRepository.findByIdOrThrow(
      target.universe_id,
    );
    const snapshot = await this.marketDataRouter.fetchTargetValue(
      target,
      universe.domain as MarketDomain,
    );
    if (!snapshot) {
      this.logger.warn(
        `Failed to fetch value for target ${targetId} (${target.symbol})`,
      );
      return null;
    }

    return this.captureSnapshot(
      targetId,
      snapshot.value,
      snapshot.source,
      snapshot.metadata,
    );
  }

  /**
   * Determine value type based on target type
   */
  private getValueType(
    targetType: string,
  ): 'price' | 'probability' | 'index' | 'other' {
    switch (targetType) {
      case 'stock':
      case 'crypto':
      case 'commodity':
      case 'forex':
        return 'price';
      case 'election':
      case 'polymarket':
        return 'probability';
      case 'index':
        return 'index';
      default:
        return 'other';
    }
  }

  /**
   * Cleanup old snapshots to manage storage
   */
  async cleanupOldSnapshots(
    targetId: string,
    retentionDays = 90,
  ): Promise<number> {
    return this.snapshotRepository.cleanupOldSnapshots(targetId, retentionDays);
  }
}
