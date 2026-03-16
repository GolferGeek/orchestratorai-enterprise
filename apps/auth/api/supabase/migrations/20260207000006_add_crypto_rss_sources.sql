-- =====================================================================================
-- ADD CRYPTO RSS SOURCES
-- =====================================================================================
-- Description: Adds reliable RSS-based crypto news sources for BTC, ETH, SOL, AVAX
--              coverage. Disables the fragile CoinDesk web scraper.
-- =====================================================================================

-- Disable the CoinDesk web scraper (fragile, only pulled 1 article)
UPDATE crawler.sources SET is_active = false WHERE name = 'CoinDesk News Scraper';

-- CoinTelegraph (10min - high volume, market-moving)
INSERT INTO crawler.sources (organization_slug, name, source_type, url, crawl_frequency_minutes, description)
VALUES ('finance', 'CoinTelegraph', 'rss', 'https://cointelegraph.com/rss', 10,
        'Major crypto news - BTC, ETH, SOL, altcoins, market analysis')
ON CONFLICT (organization_slug, url) DO UPDATE
SET is_active = true, name = EXCLUDED.name, crawl_frequency_minutes = EXCLUDED.crawl_frequency_minutes;

-- CoinDesk RSS (10min - replacing the web scraper)
INSERT INTO crawler.sources (organization_slug, name, source_type, url, crawl_frequency_minutes, description)
VALUES ('finance', 'CoinDesk RSS', 'rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 10,
        'CoinDesk crypto news via RSS - BTC, ETH, market data')
ON CONFLICT (organization_slug, url) DO UPDATE
SET is_active = true, name = EXCLUDED.name, crawl_frequency_minutes = EXCLUDED.crawl_frequency_minutes;

-- Crypto.news (30min - broad altcoin coverage)
INSERT INTO crawler.sources (organization_slug, name, source_type, url, crawl_frequency_minutes, description)
VALUES ('finance', 'Crypto.news', 'rss', 'https://crypto.news/feed', 30,
        'Broad cryptocurrency coverage including altcoins')
ON CONFLICT (organization_slug, url) DO UPDATE
SET is_active = true, name = EXCLUDED.name, crawl_frequency_minutes = EXCLUDED.crawl_frequency_minutes;

-- Bitcoinist (30min - Bitcoin-heavy with altcoin coverage)
INSERT INTO crawler.sources (organization_slug, name, source_type, url, crawl_frequency_minutes, description)
VALUES ('finance', 'Bitcoinist', 'rss', 'https://bitcoinist.com/feed', 30,
        'Bitcoin-focused with major altcoin coverage')
ON CONFLICT (organization_slug, url) DO UPDATE
SET is_active = true, name = EXCLUDED.name, crawl_frequency_minutes = EXCLUDED.crawl_frequency_minutes;

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

DO $$
DECLARE
  v_active_crypto INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_active_crypto
  FROM crawler.sources
  WHERE is_active = true
    AND name IN ('CoinTelegraph', 'CoinDesk RSS', 'Crypto.news', 'Bitcoinist');

  RAISE NOTICE '=== CRYPTO RSS SOURCES ADDED ===';
  RAISE NOTICE 'Active crypto RSS sources: % (should be 4)', v_active_crypto;
  RAISE NOTICE '================================';
END $$;
