-- Add is_duplicate column to crawler.articles table
-- This column is used for deduplication tracking and is referenced by risk views

ALTER TABLE crawler.articles
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT false;

-- Add index for filtering non-duplicates
CREATE INDEX IF NOT EXISTS idx_crawler_articles_is_duplicate
ON crawler.articles(is_duplicate)
WHERE is_duplicate = false;

COMMENT ON COLUMN crawler.articles.is_duplicate IS 'True if this article was detected as a duplicate during crawl processing';
