-- Per-org model profiles for workflows (Decision 1a): which provider/model
-- each role of a workflow uses in an organization. A run snapshots the
-- profile for its workflow's roles when it starts, so an admin change never
-- alters a run in flight, and a role with no profile refuses the start.
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 4.

BEGIN;

CREATE TABLE workflows.model_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug   TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  workflow_slug       TEXT NOT NULL CHECK (workflow_slug <> ''),
  role                TEXT NOT NULL CHECK (role ~ '^[a-z][a-z0-9_-]*$'),
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL,
  updated_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT model_profiles_one_per_role UNIQUE (organization_slug, workflow_slug, role),
  -- Only a model the platform knows can be chosen.
  CONSTRAINT model_profiles_known_model FOREIGN KEY (model, provider)
    REFERENCES public.llm_models(model_name, provider_name)
);

ALTER TABLE workflows.model_profiles OWNER TO postgres;
ALTER TABLE workflows.model_profiles ENABLE ROW LEVEL SECURITY;

-- The snapshot a run was started with: { "<role>": { "provider", "model" } }.
ALTER TABLE workflows.runs
  ADD COLUMN model_profile JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(model_profile) = 'object');

COMMIT;
