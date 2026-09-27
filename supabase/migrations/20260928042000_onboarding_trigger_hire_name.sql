-- The onboarding trigger also passes the hire's name, so the run is titled
-- "Onboarding plan for <name>" instead of by id.
BEGIN;
UPDATE ambient.triggers
SET action_config = '{"workflowSlug": "onboarding-plan", "inputFromEvent": {"hireId": "new.id", "hireName": "new.full_name"}}'::jsonb,
    response_config = '{"workflowSlug": "onboarding-plan", "inputFromEvent": {"hireId": "new.id", "hireName": "new.full_name"}}'::jsonb
WHERE org_slug = 'human-resources' AND name = 'New hire onboarding';
COMMIT;
