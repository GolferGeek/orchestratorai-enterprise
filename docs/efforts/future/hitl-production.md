# Future Effort: Production HITL for Legal Department

## Current State
The `hitl-checkpoint.node.ts` is an auto-approve pass-through. It emits progress events and immediately continues to report generation. There is no human review step.

## What's Needed
- Replace auto-approve with LangGraph `interrupt()` to pause the workflow
- The frontend needs a review/approval UI showing specialist outputs and synthesis before proceeding
- The user should be able to: approve (continue to report), reject (re-run specialists with feedback), or modify (edit specialist outputs before synthesis)
- Checkpoint persistence is already in place via PostgresCheckpointerService — resumption after interrupt should work

## Dependencies
- LangGraph `interrupt()` and `Command` for workflow resumption
- Frontend approval UI component
- SSE event for "awaiting human review" state

## Estimated Scope
Medium-large — LangGraph interrupt mechanics are straightforward, but the frontend approval flow and re-run logic add complexity.
