-- =============================================================================
-- ADD REPORTS TABLE
-- =============================================================================
-- Feature 8: PDF Report Export
-- Stores report metadata and generation history
-- =============================================================================

-- Create reports table for PDF report tracking
CREATE TABLE IF NOT EXISTS risk.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  report_type VARCHAR(50) DEFAULT 'comprehensive', -- 'comprehensive', 'executive', 'detailed'
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Report configuration options
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'generating', 'completed', 'failed'
  file_path VARCHAR(500), -- Storage path for the PDF
  file_size INTEGER, -- Size in bytes
  download_url VARCHAR(1000), -- Presigned download URL
  download_expires_at TIMESTAMPTZ, -- URL expiry
  error_message TEXT, -- If generation failed
  generated_at TIMESTAMPTZ,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_risk_reports_scope ON risk.reports(scope_id);
CREATE INDEX IF NOT EXISTS idx_risk_reports_status ON risk.reports(status);
CREATE INDEX IF NOT EXISTS idx_risk_reports_created ON risk.reports(created_at DESC);

-- Add comments
COMMENT ON TABLE risk.reports IS 'PDF report generation history and metadata';
COMMENT ON COLUMN risk.reports.config IS 'Report options: {includeExecutiveSummary, includeHeatmap, includeSubjectDetails, includeCorrelations, includeTrends}';
COMMENT ON COLUMN risk.reports.status IS 'Generation status: pending, generating, completed, failed';
COMMENT ON COLUMN risk.reports.file_path IS 'Storage location of the generated PDF';
COMMENT ON COLUMN risk.reports.download_url IS 'Presigned URL for downloading the PDF';

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION risk.update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reports_updated_at
  BEFORE UPDATE ON risk.reports
  FOR EACH ROW
  EXECUTE FUNCTION risk.update_reports_updated_at();

-- Grant permissions
GRANT ALL ON risk.reports TO service_role;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Reports Table Migration Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created: risk.reports table';
  RAISE NOTICE '================================================';
END $$;
