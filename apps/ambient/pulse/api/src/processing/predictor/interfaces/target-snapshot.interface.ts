/**
 * Target Snapshot entity interface - represents price/value history for targets
 * Based on prediction.target_snapshots table
 * Used for missed opportunity detection and outcome tracking
 */

/**
 * Snapshot source - where the value came from
 */
export type SnapshotSource =
  | 'polygon'
  | 'coingecko'
  | 'coinmarketcap'
  | 'polymarket'
  | 'manual'
  | 'other';

/**
 * Target snapshot entity
 */
export interface TargetSnapshot {
  id: string;
  target_id: string;
  value: number;
  value_type: 'price' | 'probability' | 'index' | 'other';
  captured_at: string;
  source: SnapshotSource;
  metadata: TargetSnapshotMetadata;
  created_at: string;
}

/**
 * Target snapshot metadata - additional context about the value
 */
export interface TargetSnapshotMetadata {
  /** High value (for stocks/crypto) */
  high?: number;
  /** Low value (for stocks/crypto) */
  low?: number;
  /** Open value (for stocks/crypto) */
  open?: number;
  /** Close value (for stocks/crypto) */
  close?: number;
  /** Volume */
  volume?: number;
  /** Market cap */
  market_cap?: number;
  /** 24h change percentage */
  change_24h?: number;
  /** Raw API response */
  raw_response?: Record<string, unknown>;
}

/**
 * Create target snapshot data
 */
export interface CreateTargetSnapshotData {
  target_id: string;
  value: number;
  value_type?: 'price' | 'probability' | 'index' | 'other';
  captured_at?: string;
  source: SnapshotSource;
  metadata?: TargetSnapshotMetadata;
}

/**
 * Price move - represents a significant price movement
 */
export interface PriceMove {
  target_id: string;
  start_value: number;
  end_value: number;
  start_time: string;
  end_time: string;
  change_percent: number;
  direction: 'up' | 'down';
  duration_hours: number;
}

/**
 * Move detection config - thresholds for detecting significant moves
 */
export interface MoveDetectionConfig {
  /** Minimum percentage change to consider significant */
  min_change_percent: number;
  /** Maximum lookback period in hours */
  lookback_hours: number;
  /** Minimum duration for move (prevents noise) */
  min_duration_hours: number;
}

/**
 * Default move detection config by domain
 */
export const DEFAULT_MOVE_DETECTION_CONFIG: Record<
  string,
  MoveDetectionConfig
> = {
  stocks: {
    min_change_percent: 5,
    lookback_hours: 48,
    min_duration_hours: 4,
  },
  crypto: {
    min_change_percent: 10,
    lookback_hours: 48,
    min_duration_hours: 2,
  },
  elections: {
    min_change_percent: 5,
    lookback_hours: 168, // 1 week
    min_duration_hours: 24,
  },
  polymarket: {
    min_change_percent: 10,
    lookback_hours: 24,
    min_duration_hours: 1,
  },
};
