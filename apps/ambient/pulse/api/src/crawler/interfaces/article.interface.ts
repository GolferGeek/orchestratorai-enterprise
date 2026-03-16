/**
 * Crawler Article Interfaces
 * Shared article content store definitions
 */

export interface Article {
  id: string;
  organization_slug: string;
  source_id: string;
  url: string;
  title?: string | null;
  content?: string | null;
  summary?: string | null;
  author?: string | null;
  published_at?: string | null;
  content_hash: string;
  title_normalized?: string | null;
  key_phrases?: string[] | null;
  fingerprint_hash?: string | null;
  raw_data?: Record<string, unknown> | null;
  is_test: boolean;
  first_seen_at: string;
  metadata: Record<string, unknown>;
}

export interface CreateArticleData {
  organization_slug: string;
  source_id: string;
  url: string;
  title?: string | null;
  content?: string | null;
  summary?: string | null;
  author?: string | null;
  published_at?: string | null;
  content_hash: string;
  title_normalized?: string | null;
  key_phrases?: string[] | null;
  fingerprint_hash?: string | null;
  raw_data?: Record<string, unknown> | null;
  is_test?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ArticleFingerprint {
  article_id: string;
  source_id: string;
  title_normalized: string;
  key_phrases: string[];
  fingerprint_hash: string;
  first_seen_at: string;
}

export interface ArticleWithPhraseOverlap {
  article_id: string;
  source_id: string;
  title_normalized: string;
  key_phrases: string[];
  overlap_count: number;
  first_seen_at: string;
}

export interface SourceCrawl {
  id: string;
  source_id: string;
  started_at: string;
  completed_at?: string | null;
  crawl_duration_ms?: number | null;
  status: 'running' | 'success' | 'error' | 'timeout';
  articles_found: number;
  articles_new: number;
  duplicates_exact: number;
  duplicates_cross_source: number;
  duplicates_fuzzy_title: number;
  duplicates_phrase_overlap: number;
  error_message?: string | null;
  retry_count: number;
  metadata: Record<string, unknown>;
}

export interface CreateSourceCrawlData {
  source_id: string;
  status?: 'running' | 'success' | 'error' | 'timeout';
}

export interface UpdateSourceCrawlData {
  completed_at?: string;
  crawl_duration_ms?: number;
  status?: 'running' | 'success' | 'error' | 'timeout';
  articles_found?: number;
  articles_new?: number;
  duplicates_exact?: number;
  duplicates_cross_source?: number;
  duplicates_fuzzy_title?: number;
  duplicates_phrase_overlap?: number;
  error_message?: string | null;
  retry_count?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentArticleOutput {
  id: string;
  article_id: string;
  agent_type: string;
  output_type?: string | null;
  output_id?: string | null;
  processed_at: string;
}

export interface CreateAgentArticleOutputData {
  article_id: string;
  agent_type: string;
  output_type?: string | null;
  output_id?: string | null;
}

export interface DeduplicationResult {
  is_duplicate: boolean;
  duplicate_type?: 'exact' | 'cross_source' | 'fuzzy_title' | 'phrase_overlap';
  existing_article_id?: string;
  similarity_score?: number;
}

export interface CrawlResult {
  source_id: string;
  articles_found: number;
  articles_new: number;
  duplicates: {
    exact: number;
    cross_source: number;
    fuzzy_title: number;
    phrase_overlap: number;
  };
  new_articles: Article[];
  errors: string[];
}
