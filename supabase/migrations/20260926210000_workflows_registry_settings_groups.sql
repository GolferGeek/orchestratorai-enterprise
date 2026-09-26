-- The workflow catalog per org: a mirror of the code registry (so per-org
-- rows have something to reference), each org's settings for a workflow,
-- and the org's nav groups.
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 5.

BEGIN;

-- Written at API boot from the code registry. A workflow no longer in code
-- keeps its row (history, settings) with active = false.
CREATE TABLE workflows.registry (
  slug                  TEXT PRIMARY KEY CHECK (slug <> ''),
  name                  TEXT NOT NULL CHECK (name <> ''),
  description           TEXT,
  icon                  TEXT NOT NULL CHECK (icon <> ''),
  default_group         TEXT NOT NULL CHECK (default_group <> ''),
  default_lifecycle     TEXT NOT NULL CHECK (default_lifecycle IN ('newly_created', 'dev', 'test', 'prod')),
  hitl                  BOOLEAN NOT NULL,
  data_classification   TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  entry_kind            TEXT NOT NULL CHECK (entry_kind IN ('runtime', 'custom', 'rest')),
  organization_slugs    TEXT[] NOT NULL,
  active                BOOLEAN NOT NULL DEFAULT true,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- An org's settings for a workflow. No row: enabled, with the default lifecycle.
CREATE TABLE workflows.org_settings (
  organization_slug   TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  workflow_slug       TEXT NOT NULL REFERENCES workflows.registry(slug) ON DELETE CASCADE,
  enabled             BOOLEAN NOT NULL,
  lifecycle           TEXT NOT NULL CHECK (lifecycle IN ('newly_created', 'dev', 'test', 'prod')),
  note                TEXT CHECK (note IS NULL OR note <> ''),
  updated_by          UUID REFERENCES auth.users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_slug, workflow_slug)
);

CREATE TABLE workflows.groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug   TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  name                TEXT NOT NULL CHECK (name <> ''),
  position            INTEGER NOT NULL CHECK (position >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT groups_name_per_org UNIQUE (organization_slug, name),
  CONSTRAINT groups_id_org UNIQUE (id, organization_slug)
);

-- A workflow sits in at most one group per org, and only in a group of that org.
CREATE TABLE workflows.group_items (
  group_id            UUID NOT NULL,
  organization_slug   TEXT NOT NULL,
  workflow_slug       TEXT NOT NULL REFERENCES workflows.registry(slug) ON DELETE CASCADE,
  position            INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (group_id, workflow_slug),
  CONSTRAINT group_items_group_in_org FOREIGN KEY (group_id, organization_slug)
    REFERENCES workflows.groups(id, organization_slug) ON DELETE CASCADE,
  CONSTRAINT group_items_one_group_per_org UNIQUE (organization_slug, workflow_slug)
);

ALTER TABLE workflows.registry OWNER TO postgres;
ALTER TABLE workflows.org_settings OWNER TO postgres;
ALTER TABLE workflows.groups OWNER TO postgres;
ALTER TABLE workflows.group_items OWNER TO postgres;
ALTER TABLE workflows.registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.group_items ENABLE ROW LEVEL SECURITY;

COMMIT;
