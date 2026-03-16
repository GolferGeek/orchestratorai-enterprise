-- =====================================================================================
-- ADD TECH STOCKS DATA SOURCES
-- =====================================================================================
-- Description: Adds quality RSS and web sources for tech stock signal detection
-- Scoped to: US Tech Stocks 2025 universe (finance org)
-- =====================================================================================

DO $$
DECLARE
  v_universe_id UUID;
BEGIN
  -- Get the US Tech Stocks 2025 universe ID
  SELECT id INTO v_universe_id
  FROM prediction.universes
  WHERE organization_slug = 'finance'
    AND name = 'US Tech Stocks 2025';

  IF v_universe_id IS NULL THEN
    RAISE NOTICE 'Universe "US Tech Stocks 2025" not found, skipping source creation';
    RETURN;
  END IF;

  RAISE NOTICE 'Adding sources to universe: %', v_universe_id;

  -- =========================================================================
  -- RSS FEEDS - Reliable tech news sources
  -- =========================================================================

  -- Yahoo Finance Tech RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Yahoo Finance Tech News',
    'Yahoo Finance technology sector RSS feed - general tech news and market updates',
    'rss',
    'https://finance.yahoo.com/news/rssindex',
    '{"frequency": "15min", "max_items": 20, "include_content": true}'::jsonb,
    15, true
  ) ON CONFLICT DO NOTHING;

  -- CNBC Tech RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'CNBC Technology',
    'CNBC technology news RSS feed - breaking tech news and analysis',
    'rss',
    'https://www.cnbc.com/id/19854910/device/rss/rss.html',
    '{"frequency": "15min", "max_items": 15, "include_content": true}'::jsonb,
    15, true
  ) ON CONFLICT DO NOTHING;

  -- Reuters Technology RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Reuters Technology',
    'Reuters technology sector news - global tech coverage',
    'rss',
    'https://www.reutersagency.com/feed/?best-topics=tech&post_type=best',
    '{"frequency": "15min", "max_items": 15, "include_content": true}'::jsonb,
    15, true
  ) ON CONFLICT DO NOTHING;

  -- TechCrunch RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'TechCrunch',
    'TechCrunch startup and tech news - early signals on industry trends',
    'rss',
    'https://techcrunch.com/feed/',
    '{"frequency": "30min", "max_items": 20, "include_content": true}'::jsonb,
    30, true
  ) ON CONFLICT DO NOTHING;

  -- The Verge Tech RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'The Verge Tech',
    'The Verge technology news - product launches and industry updates',
    'rss',
    'https://www.theverge.com/rss/index.xml',
    '{"frequency": "30min", "max_items": 15, "include_content": true}'::jsonb,
    30, true
  ) ON CONFLICT DO NOTHING;

  -- Ars Technica RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Ars Technica',
    'Ars Technica deep tech coverage - detailed analysis and reviews',
    'rss',
    'https://feeds.arstechnica.com/arstechnica/technology-lab',
    '{"frequency": "60min", "max_items": 10, "include_content": true}'::jsonb,
    60, true
  ) ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- WEB SOURCES - Company-specific investor pages (crawled less frequently)
  -- =========================================================================

  -- Apple Newsroom
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Apple Newsroom',
    'Official Apple press releases and announcements',
    'web',
    'https://www.apple.com/newsroom/',
    '{"frequency": "60min", "selector": "article", "extract_headlines": true}'::jsonb,
    60, true
  ) ON CONFLICT DO NOTHING;

  -- Microsoft News Center
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Microsoft News Center',
    'Official Microsoft news and announcements',
    'web',
    'https://news.microsoft.com/',
    '{"frequency": "60min", "selector": "article", "extract_headlines": true}'::jsonb,
    60, true
  ) ON CONFLICT DO NOTHING;

  -- NVIDIA Newsroom
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'NVIDIA Newsroom',
    'Official NVIDIA press releases and AI announcements',
    'web',
    'https://nvidianews.nvidia.com/',
    '{"frequency": "60min", "selector": "article", "extract_headlines": true}'::jsonb,
    60, true
  ) ON CONFLICT DO NOTHING;

  -- Google Blog
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Google Blog',
    'Official Google product announcements and updates',
    'web',
    'https://blog.google/',
    '{"frequency": "60min", "selector": "article", "extract_headlines": true}'::jsonb,
    60, true
  ) ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- MARKET DATA SOURCES - Financial analysis
  -- =========================================================================

  -- Seeking Alpha Tech RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Seeking Alpha Technology',
    'Seeking Alpha tech sector analysis and opinions',
    'rss',
    'https://seekingalpha.com/sector/technology.xml',
    '{"frequency": "30min", "max_items": 15, "include_content": true}'::jsonb,
    30, true
  ) ON CONFLICT DO NOTHING;

  -- MarketWatch Tech RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'MarketWatch Technology',
    'MarketWatch tech sector news and market analysis',
    'rss',
    'https://feeds.marketwatch.com/marketwatch/software/',
    '{"frequency": "15min", "max_items": 15, "include_content": true}'::jsonb,
    15, true
  ) ON CONFLICT DO NOTHING;

  -- Benzinga Tech RSS
  INSERT INTO prediction.sources (
    universe_id, scope_level, name, description, source_type, url,
    crawl_config, crawl_frequency_minutes, is_active
  ) VALUES (
    v_universe_id, 'universe',
    'Benzinga Tech',
    'Benzinga technology sector news - fast market-moving news',
    'rss',
    'https://www.benzinga.com/tech/feed',
    '{"frequency": "10min", "max_items": 20, "include_content": true}'::jsonb,
    10, true
  ) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Successfully added tech stock sources to universe';

END $$;

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM prediction.sources s
  JOIN prediction.universes u ON s.universe_id = u.id
  WHERE u.name = 'US Tech Stocks 2025';

  RAISE NOTICE 'Total sources for US Tech Stocks 2025: %', v_count;
END $$;
