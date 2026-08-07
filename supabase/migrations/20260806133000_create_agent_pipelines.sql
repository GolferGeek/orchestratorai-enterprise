CREATE TABLE IF NOT EXISTS public.agent_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug TEXT NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  runners JSONB NOT NULL CHECK (
    jsonb_typeof(runners) = 'array' AND
    jsonb_array_length(runners) BETWEEN 1 AND 5
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_pipelines_owner
  ON public.agent_pipelines (organization_slug, user_id, created_at DESC);

ALTER TABLE public.agent_pipelines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_pipelines FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_pipelines
  TO postgres, service_role;

COMMENT ON TABLE public.agent_pipelines IS
  'User-owned saved compositions of the five Agents family runners.';
