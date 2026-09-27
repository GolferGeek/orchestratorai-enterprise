-- What a trace review looked at, as people know it (a step slug, or the
-- agent and stage of one call), kept with the review.
ALTER TABLE workflows.trace_reviews ADD COLUMN target_label text NOT NULL CHECK (target_label <> '');
