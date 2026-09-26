-- Documents a run was started with: WorkflowDocumentRef[] (ref, filename,
-- mimeType), each ref an object in the workflow-documents bucket under
-- <org>/<run id>/. The invoke controller verifies every ref is in that folder
-- and exists before the run is queued.
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 2 (uploads).

BEGIN;

ALTER TABLE workflows.runs
  ADD COLUMN documents JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(documents) = 'array');

COMMIT;
