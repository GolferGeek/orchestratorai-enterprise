-- =============================================================================
-- ADD EXECUTIVE SUMMARIES TABLE
-- =============================================================================
-- Feature 5: Executive Summary (AI-Generated)
-- Stores auto-generated natural language summaries for executive reporting
-- =============================================================================

-- Create executive_summaries table for AI-generated summaries
CREATE TABLE IF NOT EXISTS risk.executive_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  summary_type VARCHAR(50) NOT NULL DEFAULT 'ad-hoc', -- 'daily', 'weekly', 'ad-hoc'
  content JSONB NOT NULL DEFAULT '{}'::jsonb, -- {headline, keyFindings[], recommendations[], status}
  risk_snapshot JSONB DEFAULT '{}'::jsonb, -- Captured risk data at generation time
  generated_by VARCHAR(100), -- Model/agent that generated the summary
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Optional expiry for cached summaries
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_risk_executive_summaries_scope ON risk.executive_summaries(scope_id);
CREATE INDEX IF NOT EXISTS idx_risk_executive_summaries_type ON risk.executive_summaries(summary_type);
CREATE INDEX IF NOT EXISTS idx_risk_executive_summaries_generated ON risk.executive_summaries(generated_at DESC);

-- Add comments
COMMENT ON TABLE risk.executive_summaries IS 'AI-generated executive summaries for portfolio risk reporting';
COMMENT ON COLUMN risk.executive_summaries.summary_type IS 'Type of summary: daily, weekly, or ad-hoc';
COMMENT ON COLUMN risk.executive_summaries.content IS 'Structured summary content: {headline, keyFindings[], recommendations[], status}';
COMMENT ON COLUMN risk.executive_summaries.risk_snapshot IS 'Captured risk metrics at time of generation for context';
COMMENT ON COLUMN risk.executive_summaries.generated_by IS 'Model or agent that generated this summary';
COMMENT ON COLUMN risk.executive_summaries.expires_at IS 'When this summary should be considered stale';

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION risk.update_executive_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_executive_summaries_updated_at
  BEFORE UPDATE ON risk.executive_summaries
  FOR EACH ROW
  EXECUTE FUNCTION risk.update_executive_summaries_updated_at();

-- Grant permissions
GRANT ALL ON risk.executive_summaries TO service_role;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Executive Summaries Table Migration Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created: risk.executive_summaries table';
  RAISE NOTICE '================================================';
END $$;
