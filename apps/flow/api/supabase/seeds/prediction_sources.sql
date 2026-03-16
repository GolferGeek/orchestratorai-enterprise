-- =============================================================================
-- PREDICTION SOURCES SEED DATA
-- =============================================================================
-- Real URLs and sources for signal detection
-- Organized by scope level and domain
-- =============================================================================

-- =============================================================================
-- DOMAIN-LEVEL SOURCES: STOCKS
-- =============================================================================
-- These sources apply to all stock targets in the system

-- Bloomberg Markets RSS (General market news)
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'stocks',
  'Bloomberg Markets RSS',
  'Real-time market news and analysis from Bloomberg',
  'rss',
  'https://feeds.bloomberg.com/markets/news.rss',
  '{
    "frequency": 10,
    "selector": null,
    "wait_for_element": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true,
    "title_similarity_threshold": 0.85,
    "phrase_overlap_threshold": 0.70,
    "dedup_hours_back": 72
  }'::jsonb,
  true
);

-- Reuters Business News RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'stocks',
  'Reuters Business RSS',
  'Reuters business and financial news RSS feed',
  'rss',
  'https://www.reutersagency.com/feed/?best-sectors=business-finance&post_type=best',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true,
    "title_similarity_threshold": 0.85,
    "phrase_overlap_threshold": 0.70,
    "dedup_hours_back": 72
  }'::jsonb,
  true
);

-- Yahoo Finance News RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'stocks',
  'Yahoo Finance RSS',
  'Yahoo Finance news and market updates',
  'rss',
  'https://finance.yahoo.com/news/rssindex',
  '{
    "frequency": 15,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- MarketWatch Breaking News
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'stocks',
  'MarketWatch Breaking News',
  'MarketWatch breaking news and market alerts',
  'rss',
  'https://feeds.marketwatch.com/marketwatch/topstories/',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Seeking Alpha Latest Articles
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'stocks',
  'Seeking Alpha RSS',
  'Seeking Alpha stock analysis and news',
  'rss',
  'https://seekingalpha.com/market_currents.xml',
  '{
    "frequency": 15,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- CNBC Top News
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'stocks',
  'CNBC Top News',
  'CNBC top financial news and market updates',
  'rss',
  'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Benzinga Pro News
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'stocks',
  'Benzinga News RSS',
  'Benzinga stock news and analyst ratings',
  'rss',
  'https://www.benzinga.com/feed',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- =============================================================================
-- DOMAIN-LEVEL SOURCES: CRYPTO
-- =============================================================================

-- CoinDesk RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'crypto',
  'CoinDesk RSS',
  'CoinDesk cryptocurrency news and analysis',
  'rss',
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true,
    "title_similarity_threshold": 0.85,
    "phrase_overlap_threshold": 0.70,
    "dedup_hours_back": 72
  }'::jsonb,
  true
);

-- The Block RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'crypto',
  'The Block RSS',
  'The Block crypto news and research',
  'rss',
  'https://www.theblock.co/rss.xml',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Decrypt RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'crypto',
  'Decrypt RSS',
  'Decrypt cryptocurrency news',
  'rss',
  'https://decrypt.co/feed',
  '{
    "frequency": 15,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Cointelegraph RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'crypto',
  'Cointelegraph RSS',
  'Cointelegraph crypto and blockchain news',
  'rss',
  'https://cointelegraph.com/rss',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Bitcoin Magazine RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'crypto',
  'Bitcoin Magazine RSS',
  'Bitcoin Magazine news and analysis',
  'rss',
  'https://bitcoinmagazine.com/.rss/full/',
  '{
    "frequency": 30,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- DeFi Pulse Blog (DeFi-specific)
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'crypto',
  'DeFi Llama Blog',
  'DeFi protocol news and TVL updates',
  'web',
  'https://defillama.com/blog',
  '{
    "frequency": 60,
    "selector": "article",
    "wait_for_element": "article",
    "extract_rules": {
      "title": "h2",
      "description": "p",
      "link": "a[href]"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- =============================================================================
-- DOMAIN-LEVEL SOURCES: ELECTIONS
-- =============================================================================

-- FiveThirtyEight RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'elections',
  'FiveThirtyEight Politics',
  'FiveThirtyEight election polling and analysis',
  'rss',
  'https://fivethirtyeight.com/politics/feed/',
  '{
    "frequency": 30,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- RealClearPolitics RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'elections',
  'RealClearPolitics RSS',
  'RealClearPolitics polling averages and news',
  'rss',
  'https://www.realclearpolitics.com/index.xml',
  '{
    "frequency": 30,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Politico RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'elections',
  'Politico RSS',
  'Politico political news and election coverage',
  'rss',
  'https://www.politico.com/rss/politicopicks.xml',
  '{
    "frequency": 15,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- =============================================================================
-- DOMAIN-LEVEL SOURCES: POLYMARKET
-- =============================================================================

-- Polymarket Blog
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'domain', 'polymarket',
  'Polymarket Blog',
  'Polymarket official blog and market updates',
  'web',
  'https://polymarket.com/blog',
  '{
    "frequency": 60,
    "selector": "article",
    "wait_for_element": "article",
    "extract_rules": {
      "title": "h2",
      "description": "p",
      "link": "a[href]"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- =============================================================================
-- RUNNER-LEVEL SOURCES (Global, all domains)
-- =============================================================================

-- Federal Reserve Press Releases (impacts all markets)
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'runner', NULL,
  'Federal Reserve Press Releases',
  'Federal Reserve official press releases and statements',
  'rss',
  'https://www.federalreserve.gov/feeds/press_all.xml',
  '{
    "frequency": 15,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true,
    "title_similarity_threshold": 0.90,
    "phrase_overlap_threshold": 0.80
  }'::jsonb,
  true
);

-- SEC Press Releases
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'runner', NULL,
  'SEC Press Releases',
  'SEC official press releases and enforcement actions',
  'rss',
  'https://www.sec.gov/news/pressreleases.rss',
  '{
    "frequency": 15,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Wall Street Journal Markets RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'runner', NULL,
  'WSJ Markets RSS',
  'Wall Street Journal markets and finance news',
  'rss',
  'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Financial Times RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'runner', NULL,
  'Financial Times RSS',
  'Financial Times global finance news',
  'rss',
  'https://www.ft.com/?format=rss',
  '{
    "frequency": 15,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- The Economist RSS
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'runner', NULL,
  'The Economist RSS',
  'The Economist global economic and financial news',
  'rss',
  'https://www.economist.com/finance-and-economics/rss.xml',
  '{
    "frequency": 60,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- Reuters Global Markets
INSERT INTO prediction.sources (
  scope_level, domain, name, description, source_type, url,
  crawl_config, is_active
) VALUES (
  'runner', NULL,
  'Reuters World RSS',
  'Reuters world news with market impact',
  'rss',
  'https://www.reutersagency.com/feed/?best-topics=world&post_type=best',
  '{
    "frequency": 10,
    "selector": null,
    "extract_rules": {
      "title": "title",
      "description": "description",
      "link": "link",
      "pubDate": "pubDate"
    },
    "filters": {},
    "fuzzy_dedup_enabled": true,
    "cross_source_dedup": true
  }'::jsonb,
  true
);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE prediction.sources IS 'Seed data: Real URLs for signal detection across all domains';
