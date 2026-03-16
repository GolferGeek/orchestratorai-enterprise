-- Migration: Add Monte Carlo Simulations Table
-- Feature 10: Monte Carlo Simulation for probabilistic risk distribution
-- Created: 2026-01-17

-- Simulations table for storing Monte Carlo simulation runs
CREATE TABLE IF NOT EXISTS risk.simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES risk.subjects(id) ON DELETE SET NULL,

  -- Simulation parameters
  name VARCHAR(255) NOT NULL,
  description TEXT,
  iterations INTEGER NOT NULL DEFAULT 10000,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- parameters structure:
  -- {
  --   "dimensionDistributions": {
  --     "dimension_slug": {
  --       "distribution": "normal" | "uniform" | "beta" | "triangular",
  --       "mean": 0.5,
  --       "stdDev": 0.15,
  --       "min": 0,
  --       "max": 1,
  --       "alpha": 2,  -- for beta
  --       "beta": 5    -- for beta
  --     }
  --   },
  --   "confidenceLevel": 0.95,
  --   "seed": 12345  -- optional for reproducibility
  -- }

  -- Simulation results
  results JSONB,
  -- results structure:
  -- {
  --   "mean": 0.54,
  --   "median": 0.52,
  --   "stdDev": 0.12,
  --   "variance": 0.0144,
  --   "percentile5": 0.35,
  --   "percentile25": 0.45,
  --   "percentile75": 0.62,
  --   "percentile95": 0.78,
  --   "percentile99": 0.85,
  --   "var95": 0.72,  -- Value at Risk at 95%
  --   "var99": 0.82,  -- Value at Risk at 99%
  --   "cvar95": 0.76, -- Conditional VaR at 95%
  --   "cvar99": 0.84, -- Conditional VaR at 99%
  --   "skewness": 0.15,
  --   "kurtosis": 2.8,
  --   "distribution": [  -- histogram bins
  --     {"bin": 0.1, "count": 120},
  --     {"bin": 0.2, "count": 450},
  --     ...
  --   ],
  --   "executionTimeMs": 2500
  -- }

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- status: 'pending', 'running', 'completed', 'failed'
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Index for status tracking
  CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_simulations_scope_id ON risk.simulations(scope_id);
CREATE INDEX IF NOT EXISTS idx_simulations_subject_id ON risk.simulations(subject_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON risk.simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON risk.simulations(created_at DESC);

-- Enable RLS
ALTER TABLE risk.simulations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Select policy: Users can view simulations for scopes in their organization
CREATE POLICY simulations_select_policy ON risk.simulations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = risk.simulations.scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Insert policy: Users can create simulations for scopes in their organization
CREATE POLICY simulations_insert_policy ON risk.simulations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Update policy: Users can update simulations for scopes in their organization
CREATE POLICY simulations_update_policy ON risk.simulations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = risk.simulations.scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Delete policy: Users can delete simulations for scopes in their organization
CREATE POLICY simulations_delete_policy ON risk.simulations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = risk.simulations.scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Comments
COMMENT ON TABLE risk.simulations IS 'Monte Carlo simulation runs for probabilistic risk analysis';
COMMENT ON COLUMN risk.simulations.iterations IS 'Number of Monte Carlo iterations (typically 1000-100000)';
COMMENT ON COLUMN risk.simulations.parameters IS 'Simulation configuration including dimension distributions';
COMMENT ON COLUMN risk.simulations.results IS 'Computed statistics including var95 (Value at Risk at 95%), cvar95 (Conditional VaR), and distribution histogram';
