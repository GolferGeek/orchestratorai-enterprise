-- A run can publish a live snapshot with its progress (e.g. the marketing
-- swarm's board of drafts and scores), shown while the run is going.
BEGIN;
ALTER TABLE workflows.runs ADD COLUMN live jsonb;
COMMIT;
