/**
 * Crawler Source Interfaces
 * Central source definitions for the shared crawler infrastructure
 */

export type SourceType = 'web' | 'rss' | 'twitter_search' | 'api' | 'test_db';
export type CrawlFrequency = 5 | 10 | 15 | 30 | 60;
export type CrawlStatus = 'success' | 'error' | 'timeout' | 'running';

export interface CrawlConfig {
  selector?: string | null;
  wait_for_element?: string | null;
  extract_rules?: Record<string, unknown>;
  filters?: Record<string, unknown>;
}

export interface AuthConfig {
  type: 'bearer' | 'api-key' | 'basic';
  config: Record<string, string>;
}

export interface Source {
  id: string;
  organization_slug: string;
  name: string;
  description?: string | null;
  source_type: SourceType;
  url: string;
  crawl_config: CrawlConfig;
  auth_config?: AuthConfig | null;
  crawl_frequency_minutes: CrawlFrequency;
  is_active: boolean;
  is_test: boolean;
  last_crawl_at?: string | null;
  last_crawl_status?: CrawlStatus | null;
  last_error?: string | null;
  consecutive_errors: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSourceData {
  organization_slug: string;
  name: string;
  description?: string | null;
  source_type: SourceType;
  url: string;
  crawl_config?: CrawlConfig;
  auth_config?: AuthConfig | null;
  crawl_frequency_minutes?: CrawlFrequency;
  is_active?: boolean;
  is_test?: boolean;
}

export interface UpdateSourceData {
  name?: string;
  description?: string | null;
  source_type?: SourceType;
  url?: string;
  crawl_config?: CrawlConfig;
  auth_config?: AuthConfig | null;
  crawl_frequency_minutes?: CrawlFrequency;
  is_active?: boolean;
  is_test?: boolean;
  last_crawl_at?: string | null;
  last_crawl_status?: CrawlStatus | null;
  last_error?: string | null;
  consecutive_errors?: number;
}

export interface SourceDueForCrawl {
  source_id: string;
  organization_slug: string;
  name: string;
  source_type: SourceType;
  url: string;
  crawl_config: CrawlConfig;
  auth_config?: AuthConfig | null;
  crawl_frequency_minutes: CrawlFrequency;
  last_crawl_at?: string | null;
}
