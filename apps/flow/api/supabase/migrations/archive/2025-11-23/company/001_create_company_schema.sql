-- =============================================================================
-- COMPANY DATA SCHEMA
-- =============================================================================
-- Company-specific structured data for agents to query
-- Created: Phase 1 - Multi-Database Setup
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS company;
COMMENT ON SCHEMA company IS 'Company-specific structured data including organizations, departments, and KPI metrics';

-- =============================================================================
-- COMPANIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS company.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  size TEXT CHECK (size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
  founded_date DATE,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_name ON company.companies(name);
CREATE INDEX idx_companies_industry ON company.companies(industry);

COMMENT ON TABLE company.companies IS 'Company master data';

-- =============================================================================
-- DEPARTMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS company.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES company.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  head_name TEXT,
  head_email TEXT,
  budget DECIMAL(15,2),
  employee_count INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_departments_company ON company.departments(company_id);
CREATE INDEX idx_departments_name ON company.departments(name);

COMMENT ON TABLE company.departments IS 'Company departments and organizational units';

-- =============================================================================
-- KPI METRICS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS company.kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  unit TEXT, -- 'dollars', 'percentage', 'count', etc.
  category TEXT, -- 'financial', 'operational', 'customer', 'employee'
  calculation_method TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kpi_metrics_category ON company.kpi_metrics(category);

COMMENT ON TABLE company.kpi_metrics IS 'KPI metric definitions';

-- =============================================================================
-- KPI DATA TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS company.kpi_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID REFERENCES company.kpi_metrics(id) ON DELETE CASCADE,
  company_id UUID REFERENCES company.companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES company.departments(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value DECIMAL(15,4) NOT NULL,
  target DECIMAL(15,4),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kpi_data_metric ON company.kpi_data(metric_id);
CREATE INDEX idx_kpi_data_company ON company.kpi_data(company_id);
CREATE INDEX idx_kpi_data_department ON company.kpi_data(department_id);
CREATE INDEX idx_kpi_data_period ON company.kpi_data(period_start, period_end);

COMMENT ON TABLE company.kpi_data IS 'Historical KPI data points';

-- =============================================================================
-- KPI GOALS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS company.kpi_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID REFERENCES company.kpi_metrics(id) ON DELETE CASCADE,
  company_id UUID REFERENCES company.companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES company.departments(id) ON DELETE SET NULL,
  goal_type TEXT CHECK (goal_type IN ('annual', 'quarterly', 'monthly', 'custom')),
  target_value DECIMAL(15,4) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT CHECK (status IN ('active', 'achieved', 'missed', 'cancelled')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kpi_goals_metric ON company.kpi_goals(metric_id);
CREATE INDEX idx_kpi_goals_company ON company.kpi_goals(company_id);
CREATE INDEX idx_kpi_goals_status ON company.kpi_goals(status);

COMMENT ON TABLE company.kpi_goals IS 'KPI goals and targets';

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION company.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON company.companies
  FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();

CREATE TRIGGER set_departments_updated_at BEFORE UPDATE ON company.departments
  FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();

CREATE TRIGGER set_kpi_metrics_updated_at BEFORE UPDATE ON company.kpi_metrics
  FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();

CREATE TRIGGER set_kpi_data_updated_at BEFORE UPDATE ON company.kpi_data
  FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();

CREATE TRIGGER set_kpi_goals_updated_at BEFORE UPDATE ON company.kpi_goals
  FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();
