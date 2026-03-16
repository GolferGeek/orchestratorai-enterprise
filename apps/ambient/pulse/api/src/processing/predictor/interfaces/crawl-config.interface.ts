/**
 * Firecrawl integration interfaces
 * Defines types for Firecrawl API requests and responses
 */

/**
 * Firecrawl scrape options
 */
export interface FirecrawlScrapeOptions {
  /** Formats to return: 'markdown', 'html', 'text', 'screenshot', 'links' */
  formats?: ('markdown' | 'html' | 'rawHtml' | 'screenshot' | 'links')[];
  /** Only extract content from these CSS selectors */
  includeTags?: string[];
  /** Exclude content from these CSS selectors */
  excludeTags?: string[];
  /** Custom headers */
  headers?: Record<string, string>;
  /** Wait for milliseconds before extracting */
  waitFor?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Extract only main content (removes headers, footers, etc.) */
  onlyMainContent?: boolean;
  /** Remove base64 images from output */
  removeBase64Images?: boolean;
  /** Mobile viewport */
  mobile?: boolean;
  /** Skip TLS certificate verification */
  skipTlsVerification?: boolean;
}

/**
 * Firecrawl scrape request
 * Note: Firecrawl v1 API expects options at top level, not nested
 */
export interface FirecrawlScrapeRequest extends FirecrawlScrapeOptions {
  url: string;
}

/**
 * Firecrawl scrape response
 */
export interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    screenshot?: string;
    links?: string[];
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      statusCode?: number;
    };
  };
  error?: string;
}

/**
 * Firecrawl crawl options (for multi-page crawls)
 */
export interface FirecrawlCrawlOptions extends FirecrawlScrapeOptions {
  /** Maximum number of pages to crawl */
  maxDepth?: number;
  /** Maximum pages to crawl */
  limit?: number;
  /** URL patterns to include */
  includePaths?: string[];
  /** URL patterns to exclude */
  excludePaths?: string[];
  /** Allow backward links */
  allowBackwardLinks?: boolean;
  /** Allow external links */
  allowExternalLinks?: boolean;
  /** Ignore sitemap */
  ignoreSitemap?: boolean;
}

/**
 * Firecrawl crawl request
 */
export interface FirecrawlCrawlRequest {
  url: string;
  options?: FirecrawlCrawlOptions;
}

/**
 * Firecrawl crawl status
 */
export type FirecrawlCrawlStatus =
  | 'scraping'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Firecrawl crawl response
 */
export interface FirecrawlCrawlResponse {
  success: boolean;
  id?: string;
  status?: FirecrawlCrawlStatus;
  total?: number;
  completed?: number;
  creditsUsed?: number;
  expiresAt?: string;
  data?: Array<{
    markdown?: string;
    html?: string;
    rawHtml?: string;
    screenshot?: string;
    links?: string[];
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      statusCode?: number;
    };
  }>;
  error?: string;
}

/**
 * Crawled item - normalized output from any source type
 */
export interface CrawledItem {
  /** Content (markdown preferred) */
  content: string;
  /** Original title if available */
  title: string | null;
  /** Source URL */
  url: string;
  /** Publication/detection time */
  published_at: string | null;
  /** Raw metadata from source */
  metadata: Record<string, unknown>;
}

/**
 * Crawl result - output from source crawler
 */
export interface CrawlResult {
  success: boolean;
  source_id: string;
  crawl_id?: string;
  items: CrawledItem[];
  error?: string;
  duration_ms: number;
  credits_used?: number;
}

/**
 * RSS feed item
 */
export interface RssFeedItem {
  title?: string;
  description?: string;
  content?: string;
  link?: string;
  pubDate?: string;
  author?: string;
  categories?: string[];
  guid?: string;
}

/**
 * Twitter/X search result item
 */
export interface TwitterSearchItem {
  id: string;
  text: string;
  author_id: string;
  author_username?: string;
  created_at: string;
  metrics?: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
  };
  url: string;
}

/**
 * API source response item (generic)
 */
export interface ApiSourceItem {
  content: string;
  url?: string;
  published_at?: string;
  metadata?: Record<string, unknown>;
}
