-- =============================================================================
-- CENTRAL CRAWLER SCHEMA
-- =============================================================================
-- Shared crawling infrastructure for multiple agents (prediction, risk, etc.)
-- Design: Crawl once, share content - agents pull articles via subscriptions
-- =============================================================================

-- Create the crawler schema
CREATE SCHEMA IF NOT EXISTS crawler;

-- =============================================================================
-- SOURCES TABLE
-- =============================================================================
-- Data sources for crawling (web, RSS, Twitter, APIs)
-- Shared across all agents - agents subscribe via bridge tables
-- =============================================================================

CREATE TABLE crawler.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

  -- Source metadata
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL,  -- 'web', 'rss', 'twitter_search', 'api', 'test_db'
  url TEXT NOT NULL,

  -- Crawl configuration
  crawl_config JSONB NOT NULL DEFAULT '{
    "selector": null,
    "wait_for_element": null,
    "extract_rules": {},
    "filters": {}
  }'::jsonb,

  -- Authentication configuration (for paywalled sources)
  auth_config JSONB DEFAULT NULL,  -- { "type": "bearer|api-key|basic", "config": {...} }

  -- Scheduling
  crawl_frequency_minutes INTEGER NOT NULL DEFAULT 15,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_test BOOLEAN NOT NULL DEFAULT false,
  last_crawl_at TIMESTAMPTZ,
  last_crawl_status TEXT,  -- 'success', 'error', 'timeout'
  last_error TEXT,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (source_type IN ('web', 'rss', 'twitter_search', 'api', 'test_db')),
  CHECK (crawl_frequency_minutes IN (5, 10, 15, 30, 60)),

  -- Unique URL per organization (findOrCreateSource pattern)
  UNIQUE (organization_slug, url)
);

-- =============================================================================
-- ARTICLES TABLE
-- =============================================================================
-- Shared content store - articles are stored once and referenced by agents
-- 4-layer deduplication applied globally
-- =============================================================================

CREATE TABLE crawler.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

  -- Source reference
  source_id UUID NOT NULL REFERENCES crawler.sources(id) ON DELETE CASCADE,

  -- Article content
  url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  summary TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,

  -- Deduplication fields
  content_hash TEXT NOT NULL,  -- SHA-256 hash for exact match (Layer 1 & 2)
  title_normalized TEXT,  -- Normalized title for fuzzy matching (Layer 3)
  key_phrases TEXT[],  -- Key phrases for overlap matching (Layer 4)
  fingerprint_hash TEXT,  -- Hash of key phrases

  -- Raw data
  raw_data JSONB,  -- Full Firecrawl/RSS response

  -- Test data isolation
  is_test BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Unique constraint for deduplication (per org)
  UNIQUE (organization_slug, content_hash)
);

-- =============================================================================
-- SOURCE_CRAWLS TABLE
-- =============================================================================
-- Crawl execution history with deduplication metrics
-- =============================================================================

CREATE TABLE crawler.source_crawls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  source_id UUID NOT NULL REFERENCES crawler.sources(id) ON DELETE CASCADE,

  -- Crawl timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  crawl_duration_ms INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'success', 'error', 'timeout'

  -- Results
  articles_found INTEGER DEFAULT 0,
  articles_new INTEGER DEFAULT 0,

  -- Deduplication metrics by layer
  duplicates_exact INTEGER DEFAULT 0,  -- Layer 1: Same hash, same source
  duplicates_cross_source INTEGER DEFAULT 0,  -- Layer 2: Same hash, different source
  duplicates_fuzzy_title INTEGER DEFAULT 0,  -- Layer 3: Similar title (Jaccard > 0.85)
  duplicates_phrase_overlap INTEGER DEFAULT 0,  -- Layer 4: Key phrase overlap > 70%

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CHECK (status IN ('running', 'success', 'error', 'timeout')),
  CHECK (duplicates_exact >= 0),
  CHECK (duplicates_cross_source >= 0),
  CHECK (duplicates_fuzzy_title >= 0),
  CHECK (duplicates_phrase_overlap >= 0)
);

-- =============================================================================
-- AGENT_ARTICLE_OUTPUTS TABLE (OPTIONAL)
-- =============================================================================
-- Audit trail of what each agent did with each article
-- Not required for pull model, but useful for debugging and analytics
-- =============================================================================

CREATE TABLE crawler.agent_article_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  article_id UUID NOT NULL REFERENCES crawler.articles(id) ON DELETE CASCADE,

  -- Agent info
  agent_type TEXT NOT NULL,  -- 'prediction', 'risk', 'marketing'
  output_type TEXT,  -- 'signal', 'risk_event', 'lead', etc.
  output_id UUID,  -- FK to agent-specific table (not enforced)

  -- Status
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one output per article per agent
  UNIQUE (article_id, agent_type)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Sources indexes
CREATE INDEX idx_crawler_sources_org ON crawler.sources(organization_slug);
CREATE INDEX idx_crawler_sources_type ON crawler.sources(source_type);
CREATE INDEX idx_crawler_sources_active ON crawler.sources(is_active) WHERE is_active = true;
CREATE INDEX idx_crawler_sources_frequency ON crawler.sources(crawl_frequency_minutes);
CREATE INDEX idx_crawler_sources_last_crawl ON crawler.sources(last_crawl_at DESC);
CREATE INDEX idx_crawler_sources_due_for_crawl ON crawler.sources(last_crawl_at, crawl_frequency_minutes)
  WHERE is_active = true;
CREATE INDEX idx_crawler_sources_url ON crawler.sources(url);
CREATE INDEX idx_crawler_sources_crawl_config ON crawler.sources USING GIN(crawl_config);

-- Articles indexes
CREATE INDEX idx_crawler_articles_org ON crawler.articles(organization_slug);
CREATE INDEX idx_crawler_articles_source ON crawler.articles(source_id);
CREATE INDEX idx_crawler_articles_content_hash ON crawler.articles(content_hash);
CREATE INDEX idx_crawler_articles_first_seen ON crawler.articles(first_seen_at DESC);
CREATE INDEX idx_crawler_articles_title_normalized ON crawler.articles(title_normalized)
  WHERE title_normalized IS NOT NULL;
CREATE INDEX idx_crawler_articles_fingerprint ON crawler.articles(fingerprint_hash)
  WHERE fingerprint_hash IS NOT NULL;
CREATE INDEX idx_crawler_articles_key_phrases ON crawler.articles USING GIN(key_phrases)
  WHERE key_phrases IS NOT NULL;
CREATE INDEX idx_crawler_articles_url ON crawler.articles(url);
CREATE INDEX idx_crawler_articles_published ON crawler.articles(published_at DESC)
  WHERE published_at IS NOT NULL;

-- Source crawls indexes
CREATE INDEX idx_crawler_source_crawls_source ON crawler.source_crawls(source_id);
CREATE INDEX idx_crawler_source_crawls_started ON crawler.source_crawls(started_at DESC);
CREATE INDEX idx_crawler_source_crawls_status ON crawler.source_crawls(status);

-- Agent article outputs indexes
CREATE INDEX idx_crawler_agent_outputs_article ON crawler.agent_article_outputs(article_id);
CREATE INDEX idx_crawler_agent_outputs_type ON crawler.agent_article_outputs(agent_type);
CREATE INDEX idx_crawler_agent_outputs_processed ON crawler.agent_article_outputs(processed_at DESC);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION crawler.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to sources
CREATE TRIGGER set_crawler_sources_updated_at
  BEFORE UPDATE ON crawler.sources
  FOR EACH ROW
  EXECUTE FUNCTION crawler.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA crawler IS 'Central crawler infrastructure shared by all agents';

COMMENT ON TABLE crawler.sources IS 'Data sources for crawling - shared across agents via subscriptions';
COMMENT ON COLUMN crawler.sources.organization_slug IS 'Organization this source belongs to';
COMMENT ON COLUMN crawler.sources.source_type IS 'Source type: web, rss, twitter_search, api, test_db';
COMMENT ON COLUMN crawler.sources.crawl_config IS 'Firecrawl configuration (selector, rules, filters)';
COMMENT ON COLUMN crawler.sources.auth_config IS 'Authentication for paywalled sources';
COMMENT ON COLUMN crawler.sources.crawl_frequency_minutes IS 'How often to crawl (5, 10, 15, 30, 60)';

COMMENT ON TABLE crawler.articles IS 'Shared article content store - deduplicated globally';
COMMENT ON COLUMN crawler.articles.content_hash IS 'SHA-256 hash for exact deduplication (Layer 1 & 2)';
COMMENT ON COLUMN crawler.articles.title_normalized IS 'Normalized title for fuzzy matching (Layer 3)';
COMMENT ON COLUMN crawler.articles.key_phrases IS 'Key phrases for overlap matching (Layer 4)';
COMMENT ON COLUMN crawler.articles.fingerprint_hash IS 'Hash of key phrases for quick lookup';
COMMENT ON COLUMN crawler.articles.raw_data IS 'Full response from Firecrawl/RSS parser';

COMMENT ON TABLE crawler.source_crawls IS 'Crawl execution history with dedup metrics';
COMMENT ON COLUMN crawler.source_crawls.duplicates_exact IS 'Layer 1: Exact hash match (same source)';
COMMENT ON COLUMN crawler.source_crawls.duplicates_cross_source IS 'Layer 2: Same hash from different source';
COMMENT ON COLUMN crawler.source_crawls.duplicates_fuzzy_title IS 'Layer 3: Similar title (Jaccard > 0.85)';
COMMENT ON COLUMN crawler.source_crawls.duplicates_phrase_overlap IS 'Layer 4: Key phrase overlap > 70%';

COMMENT ON TABLE crawler.agent_article_outputs IS 'Audit trail: what each agent did with each article';

-- =============================================================================
-- PERMISSIONS
-- =============================================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA crawler TO postgres, anon, authenticated, service_role;

-- Grant table permissions
GRANT ALL ON ALL TABLES IN SCHEMA crawler TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA crawler TO anon, authenticated;

-- Grant function permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA crawler TO postgres, anon, authenticated, service_role;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crawler TO postgres, service_role;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA crawler
  GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA crawler
  GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA crawler
  GRANT EXECUTE ON FUNCTIONS TO postgres, anon, authenticated, service_role;
