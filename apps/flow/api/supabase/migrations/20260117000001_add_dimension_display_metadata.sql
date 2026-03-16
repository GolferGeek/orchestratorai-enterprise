-- =============================================================================
-- ADD DIMENSION DISPLAY METADATA
-- =============================================================================
-- Feature 3: Enhanced Dimension Display Names
-- Adds display_name, icon, and color columns to dimensions table
-- =============================================================================

-- Add new columns for enhanced dimension display
ALTER TABLE risk.dimensions ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE risk.dimensions ADD COLUMN IF NOT EXISTS icon VARCHAR(50);
ALTER TABLE risk.dimensions ADD COLUMN IF NOT EXISTS color VARCHAR(7);

-- Add comments for documentation
COMMENT ON COLUMN risk.dimensions.display_name IS 'Human-friendly display name for the dimension';
COMMENT ON COLUMN risk.dimensions.icon IS 'Icon identifier (e.g., chart-line, shield, scale)';
COMMENT ON COLUMN risk.dimensions.color IS 'Hex color code for visual representation (e.g., #EF4444)';

-- Update existing dimensions with default display values based on common patterns
-- Market-related dimensions
UPDATE risk.dimensions
SET display_name = 'Market Volatility', icon = 'chart-line', color = '#EF4444'
WHERE slug = 'market-volatility' AND display_name IS NULL;

UPDATE risk.dimensions
SET display_name = 'Market Risk', icon = 'trending-up', color = '#EF4444'
WHERE slug = 'market' AND display_name IS NULL;

UPDATE risk.dimensions
SET display_name = 'Market Sentiment', icon = 'users', color = '#F97316'
WHERE slug = 'market-sentiment' AND display_name IS NULL;

-- Liquidity-related dimensions
UPDATE risk.dimensions
SET display_name = 'Liquidity Risk', icon = 'droplet', color = '#3B82F6'
WHERE slug IN ('liquidity', 'liquidity-risk') AND display_name IS NULL;

-- Credit-related dimensions
UPDATE risk.dimensions
SET display_name = 'Credit Risk', icon = 'credit-card', color = '#F59E0B'
WHERE slug IN ('credit', 'credit-risk') AND display_name IS NULL;

-- Regulatory-related dimensions
UPDATE risk.dimensions
SET display_name = 'Regulatory Risk', icon = 'scale', color = '#8B5CF6'
WHERE slug IN ('regulatory', 'regulatory-risk') AND display_name IS NULL;

-- Operational dimensions
UPDATE risk.dimensions
SET display_name = 'Operational Risk', icon = 'cog', color = '#6B7280'
WHERE slug IN ('operational', 'operational-risk') AND display_name IS NULL;

-- Technical dimensions
UPDATE risk.dimensions
SET display_name = 'Technical Analysis', icon = 'activity', color = '#06B6D4'
WHERE slug IN ('technical', 'technical-analysis') AND display_name IS NULL;

-- Fundamental dimensions
UPDATE risk.dimensions
SET display_name = 'Fundamental Analysis', icon = 'bar-chart-2', color = '#10B981'
WHERE slug IN ('fundamental', 'fundamental-analysis') AND display_name IS NULL;

-- Macro dimensions
UPDATE risk.dimensions
SET display_name = 'Macro Environment', icon = 'globe', color = '#6366F1'
WHERE slug IN ('macro', 'macro-environment', 'macroeconomic') AND display_name IS NULL;

-- Correlation dimensions
UPDATE risk.dimensions
SET display_name = 'Correlation Risk', icon = 'git-merge', color = '#EC4899'
WHERE slug IN ('correlation', 'correlation-risk') AND display_name IS NULL;

-- Volatility dimensions
UPDATE risk.dimensions
SET display_name = 'Volatility', icon = 'zap', color = '#F43F5E'
WHERE slug = 'volatility' AND display_name IS NULL;

-- Concentration dimensions
UPDATE risk.dimensions
SET display_name = 'Concentration Risk', icon = 'target', color = '#A855F7'
WHERE slug IN ('concentration', 'concentration-risk') AND display_name IS NULL;

-- Country/geo dimensions
UPDATE risk.dimensions
SET display_name = 'Country Risk', icon = 'map', color = '#14B8A6'
WHERE slug IN ('country', 'country-risk', 'geo-political') AND display_name IS NULL;

-- Interest rate dimensions
UPDATE risk.dimensions
SET display_name = 'Interest Rate Risk', icon = 'percent', color = '#84CC16'
WHERE slug IN ('interest-rate', 'rate-risk') AND display_name IS NULL;

-- Currency dimensions
UPDATE risk.dimensions
SET display_name = 'Currency Risk', icon = 'dollar-sign', color = '#22C55E'
WHERE slug IN ('currency', 'fx-risk', 'currency-risk') AND display_name IS NULL;

-- Model dimensions
UPDATE risk.dimensions
SET display_name = 'Model Risk', icon = 'cpu', color = '#0EA5E9'
WHERE slug IN ('model', 'model-risk') AND display_name IS NULL;

-- For any remaining dimensions without display_name, set it from name
UPDATE risk.dimensions
SET display_name = name
WHERE display_name IS NULL;

-- Set default icon and color for any remaining
UPDATE risk.dimensions
SET icon = 'circle'
WHERE icon IS NULL;

UPDATE risk.dimensions
SET color = '#6B7280'
WHERE color IS NULL;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  dimension_count INTEGER;
  dimensions_with_display INTEGER;
BEGIN
  SELECT COUNT(*) INTO dimension_count FROM risk.dimensions;
  SELECT COUNT(*) INTO dimensions_with_display FROM risk.dimensions WHERE display_name IS NOT NULL;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Dimension Display Metadata Migration Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total dimensions: %', dimension_count;
  RAISE NOTICE 'Dimensions with display_name: %', dimensions_with_display;
  RAISE NOTICE '================================================';
END $$;
