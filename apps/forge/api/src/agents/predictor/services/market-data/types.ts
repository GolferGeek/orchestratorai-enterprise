import type { SnapshotSource } from '../../interfaces/target-snapshot.interface';

export type MarketDomain = 'stocks' | 'crypto' | 'polymarket' | 'elections';

export interface MarketSnapshotValue {
  value: number;
  source: SnapshotSource;
  metadata: Record<string, unknown>;
}
