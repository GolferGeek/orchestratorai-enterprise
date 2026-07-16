/**
 * Sentinel Ingest Workflow — Domain Types.
 *
 * Interfaces for raw items fetched from sources, classified signals,
 * and workflow status.
 */
import type { SentinelSource, SignalType } from '../../sentinel/sentinel.types';

// ── Source Config ────────────────────────────────────────────────────

export type SourceConfig = SentinelSource;

// ── Raw Item (fetched from source before classification) ────────────

export interface RawItem {
  title: string;
  summary: string;
  fullText: string;
  url: string;
  publishedAt: string | null;
  contentHash: string;
}

// ── Classified Signal (after LLM classification) ────────────────────

export interface ClassifiedSignal extends RawItem {
  signalType: SignalType;
  jurisdictions: string[];
  practiceAreas: string[];
}

// ── Workflow Status ─────────────────────────────────────────────────

export type SentinelIngestStatus =
  | 'fetching'
  | 'deduplicating'
  | 'classifying'
  | 'storing'
  | 'updating_source'
  | 'completed'
  | 'failed';
