-- The issue ledger's order was not total: a stage raises its issues in one
-- transaction, so they share created_at (now() is the transaction's start),
-- and the view came back in whatever order Postgres chose. seq records the
-- order a stage raised them; reads order by (created_at, seq).
ALTER TABLE workflows.issue_ledger ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
