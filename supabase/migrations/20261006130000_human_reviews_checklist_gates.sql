-- Checklist gates: a run waits while people tick off a list of steps (a
-- packing checklist, say). The lines are the review's payload.items; each
-- tick is stored in `ticks` as { "<itemId>": { "by": <user id>, "at": <time> } }
-- and the last tick records the response and requeues the run in the same
-- transaction (HumanReviewsRepository.tick).

BEGIN;

ALTER TABLE workflows.human_reviews
  ADD COLUMN ticks JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT human_reviews_ticks_object CHECK (jsonb_typeof(ticks) = 'object');

ALTER TABLE workflows.human_reviews ADD CONSTRAINT human_reviews_ticks_only_checklists
  CHECK (kind = 'checklist' OR ticks = '{}'::jsonb);

ALTER TABLE workflows.human_reviews DROP CONSTRAINT human_reviews_kind_check;
ALTER TABLE workflows.human_reviews ADD CONSTRAINT human_reviews_kind_check
  CHECK (kind IN ('approval', 'answer', 'event', 'checklist'));

COMMIT;
