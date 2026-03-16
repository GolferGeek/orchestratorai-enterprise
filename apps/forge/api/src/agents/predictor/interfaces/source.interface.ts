/**
 * Source entity interface - represents a data source for signals
 * Based on prediction.sources table
 */

/**
 * Source type - the type of data source
 * - web: Regular web page (scraped with Firecrawl)
 * - rss: RSS feed
 * - twitter_search: Twitter/X search query
 * - api: External API endpoint
 * - test_db: DB-backed synthetic content (Phase 2 Test Input Infrastructure)
 *   Reads from prediction.test_articles table. Used exclusively for test scenarios.
 *   All content from test_db sources inherits is_test=true flag.
 */
export type SourceType = 'web' | 'rss' | 'twitter_search' | 'api' | 'test_db';

/**
 * Source scope level - determines visibility and applicability
 * - runner: Global source (available to all)
 * - domain: Domain-specific (stocks, crypto, etc.)
 * - universe: Universe-specific
 * - target: Target-specific
 */
export type SourceScopeLevel = 'runner' | 'domain' | 'universe' | 'target';

/**
 * Crawl frequency in minutes
 */
export type CrawlFrequency = 5 | 10 | 15 | 30 | 60;

/**
 * Source status
 */
export type SourceStatus = 'active' | 'paused' | 'error' | 'archived';

/**
 * Crawl configuration for a source
 */
export interface CrawlConfig {
  /** CSS selector to extract content */
  selector?: string;
  /** Wait for this selector before extracting (for JS-heavy pages) */
  wait_for_selector?: string;
  /** Timeout in milliseconds */
  timeout_ms?: number;
  /** Headers to send with request */
  headers?: Record<string, string>;
  /** Include screenshots in crawl */
  include_screenshot?: boolean;
  /** Extract links from page */
  extract_links?: boolean;
  /** Custom user agent */
  user_agent?: string;
  /** Proxy configuration */
  proxy?: string;

  // ═══════════════════════════════════════════════════════════════════
  // DEDUPLICATION CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════

  /** Enable fuzzy deduplication (Layers 3 & 4) - default: true */
  fuzzy_dedup_enabled?: boolean;
  /** Enable cross-source deduplication (Layer 2) - default: true */
  cross_source_dedup?: boolean;
  /** Jaccard similarity threshold for title matching (0.0-1.0, default: 0.85) */
  title_similarity_threshold?: number;
  /** Key phrase overlap threshold (0.0-1.0, default: 0.70) */
  phrase_overlap_threshold?: number;
  /** How far back to look for duplicates in hours (default: 72) */
  dedup_hours_back?: number;

  // ═══════════════════════════════════════════════════════════════════
  // TEST_DB SOURCE CONFIGURATION (Phase 2 Test Input Infrastructure)
  // ═══════════════════════════════════════════════════════════════════

  /** Organization slug for test_db sources (required for test_db) */
  organization_slug?: string;
  /** Filter test articles by scenario ID (optional for test_db) */
  scenario_id?: string;
  /** Filter by specific target symbols (optional for test_db) */
  target_symbols?: string[];
  /** Only fetch unprocessed articles (default: true for test_db) */
  unprocessed_only?: boolean;
  /** Maximum articles to fetch per crawl (default: 100 for test_db) */
  max_articles?: number;
}

/**
 * Authentication configuration for paywalled sources
 */
export interface AuthConfig {
  /** Auth type */
  type: 'none' | 'basic' | 'bearer' | 'cookie' | 'api_key';
  /** Secret reference (never store actual credentials) */
  secret_ref?: string;
  /** Header name for API key auth */
  header_name?: string;
  /** Cookie name for cookie auth */
  cookie_name?: string;
}

/**
 * Source entity
 */
export interface Source {
  id: string;
  name: string;
  description: string | null;
  source_type: SourceType;
  url: string;
  scope_level: SourceScopeLevel;
  domain: 'stocks' | 'crypto' | 'elections' | 'polymarket' | null;
  universe_id: string | null;
  target_id: string | null;
  crawl_config: CrawlConfig;
  auth_config: AuthConfig;
  crawl_frequency_minutes: CrawlFrequency;
  is_active: boolean;
  /** Test source flag - if true, all signals from this source are is_test=true (INV-02) */
  is_test: boolean;
  last_crawl_at: string | null;
  last_crawl_status: 'success' | 'error' | null;
  last_error: string | null;
  consecutive_errors: number;
  created_at: string;
  updated_at: string;
}

/**
 * Create source data
 */
export interface CreateSourceData {
  name: string;
  description?: string;
  source_type: SourceType;
  url: string;
  scope_level: SourceScopeLevel;
  domain?: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  universe_id?: string;
  target_id?: string;
  crawl_config?: CrawlConfig;
  auth_config?: AuthConfig;
  crawl_frequency_minutes?: CrawlFrequency;
  is_active?: boolean;
  /** Test source flag - defaults to false. Set to true for test_db sources. */
  is_test?: boolean;
}

/**
 * Update source data
 */
export interface UpdateSourceData {
  name?: string;
  description?: string;
  url?: string;
  crawl_config?: CrawlConfig;
  auth_config?: AuthConfig;
  crawl_frequency_minutes?: CrawlFrequency;
  is_active?: boolean;
  last_crawl_at?: string;
  last_crawl_status?: 'success' | 'error';
  last_error?: string | null;
  consecutive_errors?: number;
}

/**
 * Source crawl record - history of crawls
 */
export interface SourceCrawl {
  id: string;
  source_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'pending' | 'running' | 'success' | 'error';
  items_found: number;
  items_new: number;
  signals_created: number;
  duplicates_skipped: number;
  error_message: string | null;
  crawl_duration_ms: number | null;
  metadata: Record<string, unknown>;

  // Deduplication metrics by layer
  duplicates_exact: number; // Layer 1: Same source exact hash
  duplicates_cross_source: number; // Layer 2: Different source same hash
  duplicates_fuzzy_title: number; // Layer 3: Title similarity > threshold
  duplicates_phrase_overlap: number; // Layer 4: Key phrase overlap > threshold
}

/**
 * Create source crawl data
 */
export interface CreateSourceCrawlData {
  source_id: string;
  started_at?: string;
  status?: 'pending' | 'running';
}

/**
 * Update source crawl data
 */
export interface UpdateSourceCrawlData {
  completed_at?: string;
  status?: 'success' | 'error';
  items_found?: number;
  items_new?: number;
  signals_created?: number;
  duplicates_skipped?: number;
  error_message?: string;
  crawl_duration_ms?: number;
  metadata?: Record<string, unknown>;

  // Deduplication metrics by layer
  duplicates_exact?: number;
  duplicates_cross_source?: number;
  duplicates_fuzzy_title?: number;
  duplicates_phrase_overlap?: number;
}

/**
 * Source seen item - tracks processed content for deduplication
 */
export interface SourceSeenItem {
  id: string;
  source_id: string;
  content_hash: string;
  original_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  signal_id: string | null;
  metadata: Record<string, unknown>;

  // Fuzzy matching fields (Layer 3 & 4)
  title_normalized: string | null;
  key_phrases: string[] | null;
  fingerprint_hash: string | null;
}

/**
 * Create source seen item data
 */
export interface CreateSourceSeenItemData {
  source_id: string;
  content_hash: string;
  original_url?: string;
  signal_id?: string;
  metadata?: Record<string, unknown>;

  // Fuzzy matching fields (Layer 3 & 4)
  title_normalized?: string;
  key_phrases?: string[];
  fingerprint_hash?: string;
}
