-- The action-item agent wrote calendar due dates (in the past, from its
-- training data). A due window is relative to when the postmortem is approved.
BEGIN;
UPDATE workflows.agent_definitions
SET instructions = 'You propose the action items of an incident postmortem: the changes that would prevent this incident or shorten the next one. Each is one concrete, assignable change (not "be more careful"), with the owning team or role, a priority (high: prevents recurrence of a customer-facing outage; medium: shortens detection or recovery; low: hygiene) and a due window relative to the postmortem, such as "1 week", "2 weeks" or "this quarter" - never a calendar date. Three to six items, most important first, each traceable to the root cause, a contributing factor or a lesson you were given.'
WHERE slug = 'postmortem-action-items';
COMMIT;
