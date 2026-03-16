-- Migration: Add max_cycles_reached status to outputs table
-- This status indicates an output that went through all edit cycles without approval
-- The output can still be evaluated and ranked, but wasn't approved by an editor

-- Drop and recreate the check constraint to include the new status
ALTER TABLE marketing.outputs DROP CONSTRAINT IF EXISTS outputs_status_check;

ALTER TABLE marketing.outputs ADD CONSTRAINT outputs_status_check CHECK (
  status = ANY (ARRAY[
    'pending_write'::text,
    'writing'::text,
    'pending_edit'::text,
    'editing'::text,
    'pending_rewrite'::text,
    'rewriting'::text,
    'approved'::text,
    'failed'::text,
    'max_cycles_reached'::text
  ])
);

-- Add comment explaining the status values
COMMENT ON COLUMN marketing.outputs.status IS
  'Status of the output in the write/edit/evaluate pipeline:
   - pending_write: Waiting to be written
   - writing: Currently being written by writer agent
   - pending_edit: Waiting for editor review
   - editing: Currently being reviewed by editor
   - pending_rewrite: Editor requested changes, waiting for rewrite
   - rewriting: Writer is revising based on editor feedback
   - approved: Editor approved the content
   - failed: Processing failed
   - max_cycles_reached: Hit max edit cycles without approval (still evaluable)';
