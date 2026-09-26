-- Agent definitions for workflow steps: instructions, a model role, and
-- strict input/output JSON Schemas. Workflows seed their own agents; org
-- admins can override instructions or disable an agent for their org.
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 4. Ported from
-- orchestratorai-local's agents.agent_catalog, with its defects fixed:
-- versions are written by a trigger (local never wrote them); schemas are
-- required (local went permissive on a missing or broken schema); `enabled`
-- is enforced by the runtime; the model is a role resolved through the run's
-- model profile, not an env default.

BEGIN;

CREATE TABLE workflows.agent_definitions (
  slug            TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
  name            TEXT NOT NULL CHECK (name <> ''),
  description     TEXT NOT NULL CHECK (description <> ''),
  instructions    TEXT NOT NULL CHECK (instructions <> ''),
  model_role      TEXT NOT NULL CHECK (model_role ~ '^[a-z][a-z0-9_-]*$'),
  output_format   TEXT NOT NULL CHECK (output_format IN ('json', 'text')),
  input_schema    JSONB NOT NULL CHECK (jsonb_typeof(input_schema) = 'object'),
  output_schema   JSONB CHECK (output_schema IS NULL OR jsonb_typeof(output_schema) = 'object'),
  max_tokens      INTEGER NOT NULL CHECK (max_tokens > 0),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agent_definitions_json_has_schema CHECK (
    (output_format = 'json') = (output_schema IS NOT NULL)
  )
);

CREATE TABLE workflows.agent_definition_versions (
  agent_slug      TEXT NOT NULL REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  instructions    TEXT NOT NULL,
  model_role      TEXT NOT NULL,
  output_format   TEXT NOT NULL,
  input_schema    JSONB NOT NULL,
  output_schema   JSONB,
  max_tokens      INTEGER NOT NULL,
  enabled         BOOLEAN NOT NULL,
  updated_by      UUID,
  superseded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_slug, version)
);

-- Every change to what an agent does archives the previous version and bumps
-- the number; the runtime records the version each participant ran.
CREATE FUNCTION workflows.archive_agent_definition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.name, OLD.description, OLD.instructions, OLD.model_role, OLD.output_format,
      OLD.input_schema, OLD.output_schema, OLD.max_tokens, OLD.enabled)
     IS DISTINCT FROM
     (NEW.name, NEW.description, NEW.instructions, NEW.model_role, NEW.output_format,
      NEW.input_schema, NEW.output_schema, NEW.max_tokens, NEW.enabled) THEN
    INSERT INTO workflows.agent_definition_versions
      (agent_slug, version, name, description, instructions, model_role, output_format,
       input_schema, output_schema, max_tokens, enabled, updated_by)
    VALUES
      (OLD.slug, OLD.version, OLD.name, OLD.description, OLD.instructions, OLD.model_role,
       OLD.output_format, OLD.input_schema, OLD.output_schema, OLD.max_tokens, OLD.enabled,
       OLD.updated_by);
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_definitions_archive
  BEFORE UPDATE ON workflows.agent_definitions
  FOR EACH ROW EXECUTE FUNCTION workflows.archive_agent_definition();

CREATE TABLE workflows.agent_definition_org_overrides (
  agent_slug            TEXT NOT NULL REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE,
  organization_slug     TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  instructions_override TEXT CHECK (instructions_override IS NULL OR instructions_override <> ''),
  enabled               BOOLEAN NOT NULL DEFAULT true,
  updated_by            UUID REFERENCES auth.users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_slug, organization_slug)
);

-- Which workflows use an agent (catalog and admin views).
CREATE TABLE workflows.agent_definition_links (
  agent_slug      TEXT NOT NULL REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE,
  workflow_slug   TEXT NOT NULL CHECK (workflow_slug <> ''),
  PRIMARY KEY (agent_slug, workflow_slug)
);
CREATE INDEX agent_definition_links_workflow ON workflows.agent_definition_links (workflow_slug);

ALTER TABLE workflows.agent_definitions OWNER TO postgres;
ALTER TABLE workflows.agent_definition_versions OWNER TO postgres;
ALTER TABLE workflows.agent_definition_org_overrides OWNER TO postgres;
ALTER TABLE workflows.agent_definition_links OWNER TO postgres;
ALTER FUNCTION workflows.archive_agent_definition() OWNER TO postgres;
ALTER TABLE workflows.agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.agent_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.agent_definition_org_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.agent_definition_links ENABLE ROW LEVEL SECURITY;

COMMIT;
