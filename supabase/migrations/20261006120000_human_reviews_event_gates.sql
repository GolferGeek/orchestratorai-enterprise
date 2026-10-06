-- Event gates: a run can wait for something outside (a carrier pickup, a
-- delivery) the same way it waits for a person. The gate is a human_reviews
-- row of kind 'event'; no work task is opened, nobody can answer it, and the
-- workflow's keyed-run delivery resolves it as the system user when the event
-- arrives (HumanReviewService.deliverEvent). Its payload names the event:
-- { event, waitingFor, detail }.

BEGIN;

ALTER TABLE workflows.human_reviews DROP CONSTRAINT human_reviews_kind_check;
ALTER TABLE workflows.human_reviews ADD CONSTRAINT human_reviews_kind_check
  CHECK (kind IN ('approval', 'answer', 'event'));

COMMIT;
