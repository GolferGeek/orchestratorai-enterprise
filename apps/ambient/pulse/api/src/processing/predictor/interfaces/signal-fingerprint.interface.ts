/**
 * Signal Fingerprint interfaces for fuzzy deduplication
 *
 * Fingerprints enable Layer 3 (fuzzy title matching) and Layer 4 (key phrase overlap)
 * deduplication strategies as specified in the Financial Asset Predictor PRD.
 *
 * Deduplication Layers:
 * - Layer 1: Exact hash match (handled by source_seen_items)
 * - Layer 2: Cross-source hash check (handled by check_content_hash_for_target RPC)
 * - Layer 3: Fuzzy title matching (uses Jaccard similarity > 0.85)
 * - Layer 4: Key phrase overlap (> 70% overlap threshold)
 */

/**
 * Signal fingerprint entity - stored in prediction.signal_fingerprints table
 */
export interface SignalFingerprint {
  id: string;
  signal_id: string;
  target_id: string;
  title_normalized: string;
  key_phrases: string[];
  fingerprint_hash: string;
  created_at: string;
}

/**
 * Data for creating a new signal fingerprint
 */
export interface CreateSignalFingerprintData {
  signal_id: string;
  target_id: string;
  title_normalized: string;
  key_phrases: string[];
  fingerprint_hash: string;
}

/**
 * Fingerprint candidate with overlap information for Layer 4 matching
 */
export interface SignalFingerprintCandidate {
  signal_id: string;
  title_normalized: string;
  key_phrases: string[];
  overlap_count: number;
  created_at: string;
}

/**
 * Result from deduplication check
 */
export interface DeduplicationResult {
  isDuplicate: boolean;
  reason?: DeduplicationReason;
  similarSignalId?: string;
  similarity?: number;
}

/**
 * Reason for deduplication rejection
 */
export type DeduplicationReason =
  | 'exact_hash_match' // Layer 1: Exact content hash in same source
  | 'cross_source_duplicate' // Layer 2: Same hash found in different source for same target
  | 'fuzzy_title_match' // Layer 3: Title Jaccard similarity > threshold
  | 'phrase_overlap'; // Layer 4: Key phrase overlap > threshold

/**
 * Deduplication configuration for crawl sources
 * Stored in sources.crawl_config JSONB
 */
export interface DeduplicationConfig {
  /** Enable fuzzy deduplication (Layers 3 & 4) */
  fuzzy_dedup_enabled?: boolean;

  /** Enable cross-source deduplication (Layer 2) */
  cross_source_dedup?: boolean;

  /** Jaccard similarity threshold for title matching (0.0-1.0, default: 0.85) */
  title_similarity_threshold?: number;

  /** Key phrase overlap threshold (0.0-1.0, default: 0.70) */
  phrase_overlap_threshold?: number;

  /** How far back to look for duplicates in hours (default: 72) */
  dedup_hours_back?: number;
}

/**
 * Deduplication metrics tracked per crawl
 */
export interface DeduplicationMetrics {
  duplicates_exact: number;
  duplicates_cross_source: number;
  duplicates_fuzzy_title: number;
  duplicates_phrase_overlap: number;
}

/**
 * Combined process result for an item
 */
export interface ProcessItemResult {
  isNew: boolean;
  signalId?: string;
  reason?: DeduplicationReason;
  similarSignalId?: string;
}
