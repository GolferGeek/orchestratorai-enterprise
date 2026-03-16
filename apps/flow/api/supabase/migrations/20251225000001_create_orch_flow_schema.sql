-- =============================================================================
-- Orch-Flow Schema - Client Onboarding Journey
-- =============================================================================

-- Create schema
CREATE SCHEMA IF NOT EXISTS orch_flow;

-- Grant permissions (same pattern as marketing)
GRANT USAGE ON SCHEMA orch_flow TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA orch_flow TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA orch_flow TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA orch_flow GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA orch_flow GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- =============================================================================
-- Core Tables
-- =============================================================================

-- Efforts (major phases like "Pilot Setup", "Production Readiness")
CREATE TABLE orch_flow.efforts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  order_index INTEGER NOT NULL DEFAULT 0,
  icon TEXT, -- ionicon name
  color TEXT, -- hex color for UI
  estimated_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects (goals within efforts)
CREATE TABLE orch_flow.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effort_id UUID NOT NULL REFERENCES orch_flow.efforts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks (actionable items within projects)
CREATE TABLE orch_flow.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES orch_flow.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'skipped')),
  assignee_id UUID REFERENCES auth.users(id),
  due_date DATE,
  order_index INTEGER NOT NULL DEFAULT 0,
  documentation_url TEXT, -- Link to docs/video
  is_milestone BOOLEAN DEFAULT false, -- Key milestone task
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning milestones (track key achievements)
CREATE TABLE orch_flow.learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL, -- e.g., 'hardware_setup', 'first_agent', 'production_deploy'
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_slug, milestone_key)
);

-- Vertical templates (pre-defined journey templates)
CREATE TABLE orch_flow.journey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- 'law-firm', 'finance', 'manufacturing', 'marketing'
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  template_data JSONB NOT NULL, -- Full effort/project/task structure
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE orch_flow.efforts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.journey_templates ENABLE ROW LEVEL SECURITY;

-- Efforts: Users can CRUD in their org
CREATE POLICY "Users can view efforts in their org"
  ON orch_flow.efforts FOR SELECT
  USING (organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create efforts in their org"
  ON orch_flow.efforts FOR INSERT
  WITH CHECK (organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update efforts in their org"
  ON orch_flow.efforts FOR UPDATE
  USING (organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can delete efforts in their org"
  ON orch_flow.efforts FOR DELETE
  USING (organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid()));

-- Projects: Access through effort's org
CREATE POLICY "Users can view projects in their org"
  ON orch_flow.projects FOR SELECT
  USING (
    effort_id IN (
      SELECT id FROM orch_flow.efforts
      WHERE organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can manage projects in their org"
  ON orch_flow.projects FOR ALL
  USING (
    effort_id IN (
      SELECT id FROM orch_flow.efforts
      WHERE organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

-- Tasks: Access through project's effort's org
CREATE POLICY "Users can view tasks in their org"
  ON orch_flow.tasks FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM orch_flow.projects p
      JOIN orch_flow.efforts e ON p.effort_id = e.id
      WHERE e.organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can manage tasks in their org"
  ON orch_flow.tasks FOR ALL
  USING (
    project_id IN (
      SELECT p.id FROM orch_flow.projects p
      JOIN orch_flow.efforts e ON p.effort_id = e.id
      WHERE e.organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

-- Learning progress: User can only see/manage their own
CREATE POLICY "Users can view own learning progress"
  ON orch_flow.learning_progress FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own learning progress"
  ON orch_flow.learning_progress FOR ALL
  USING (user_id = auth.uid());

-- Journey templates: Everyone can view
CREATE POLICY "Anyone can view journey templates"
  ON orch_flow.journey_templates FOR SELECT
  USING (is_active = true);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_efforts_org ON orch_flow.efforts(organization_slug);
CREATE INDEX idx_projects_effort ON orch_flow.projects(effort_id);
CREATE INDEX idx_tasks_project ON orch_flow.tasks(project_id);
CREATE INDEX idx_learning_progress_user_org ON orch_flow.learning_progress(user_id, organization_slug);
