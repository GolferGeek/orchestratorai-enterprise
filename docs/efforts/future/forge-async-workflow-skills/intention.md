# Future Effort: Forge Async Workflow Skills

**Status**: Parked — do not start until Phase 5 (Legal Department Hardening & Verification) is complete.

## Why this is a future effort, not a current one

Phases 1–3 of the legal-department upgrades landed a working async job queue with HITL, multi-document support, input size limits, and chunked specialists. Phase 4 adds reasoning capture. Phase 4.5 extends reasoning capture across all LLM providers. Phase 5 hardens the whole thing into something production-ready. Only **after Phase 5** — once legal-department is stable, tested, and genuinely canonical — does it make sense to distill the pattern into reusable skills.

Doing skill extraction earlier would bake in a pattern we'd end up revising. Doing it after Phase 5 gives us a stable reference implementation to point at and lets the skills describe a pattern that actually works end-to-end.

## The architectural philosophy this effort embodies

We are deliberately **not extracting a shared framework** for async job pipelines. Past experience with framework-first approaches (SAP, Salesforce, etc.) shows that a one-size-fits-all orchestration layer becomes a straitjacket the moment a new department's real requirements diverge from the shape the framework assumed. Instead:

- **Shared primitives** (the planes layer, LLM plane methods, observability events, database/storage/auth/config services) stay shared and cross-cutting.
- **Workflow orchestration** (tables, repositories, controllers, workers, HITL payload shapes, queue views, review modals) stays per-department. Legal keeps its own copy. Marketing will get its own. Finance, manufacturing, whatever else comes next — each gets its own copy, independently evolvable.
- **Shared skills** bridge the gap: instead of sharing code that forces coupling, we share *knowledge* that describes the pattern without enforcing it. An agent building a new workflow reads the skill, understands the pattern, and writes idiomatic code for the new department — which may look like legal's, or may diverge freely where needed.

This is **platform, not framework**. The planes are the platform. Each workflow is an independent application. Skills capture the know-how for building applications on the platform.

## Skills to write

### `forge-async-workflow-skill`
The canonical pattern for building an async LangGraph workflow with HITL in Forge. Covers:
- Table shape (`<schema>.agent_jobs`) and columns
- Migration pattern for adding status tracking, HITL review, original file path, document paths, etc.
- Repository methods: `insertQueued`, `claimNextQueued` (atomic `FOR UPDATE SKIP LOCKED`), `markAwaitingReview`, `recordReviewAndRequeue`, `markCompleted`, `markFailed`, `updateProgress`, `findByIdForOrg`, `listForOrg`, `listEventsForConversation`
- Controller endpoints: `POST /jobs`, `POST /jobs/upload`, `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/events`, `GET /jobs/:id/file`, `POST /jobs/:id/review`
- Worker service structure: polling loop, atomic claim, provider concurrency gating, HITL interrupt detection and state transition, error handling with real error propagation
- ExecutionContext passthrough — no destructuring, capsule flows whole through every layer
- LangGraph `interrupt()` and `Command({resume})` mechanics for HITL
- How to emit observability events at node boundaries
- Checkpoint persistence via `PostgresCheckpointerService`

Points at `apps/forge/api/src/agents/legal-department/` as the canonical implementation.

### `forge-document-onboarding-workflow-skill`
A more specific variant focused on the file-upload workflow:
- Multipart `FilesInterceptor('files', MAX_FILES)` pattern
- `DocumentExtractionRouter` for text/pdf/docx/image/etc.
- Per-file persistence via `MEDIA_STORAGE_PROVIDER` with index-prefixed filenames
- `document_paths TEXT[]` column pattern
- Parallel metadata extraction via `Promise.all`
- Multi-document fan-out inside specialist helpers
- Cross-document synthesis and reporting
- `document_count` column for observability

Points at legal-department's Phase 3 implementation as canonical.

### `forge-workflow-frontend-skill`
The frontend counterpart:
- Queue view component (Document Onboarding pattern)
- Multi-file upload modal with preview list
- Stage ladder composable with node/step progress tracking
- SSE subscription to `/observability/stream` filtered by `conversationId`
- HITL review modal structure with per-document tabs, per-specialist sections, approve/reject/modify controls
- Invoke client for capability calls (`invoke-client.ts` pattern)
- `useOutputRenderer` composable integration for async job status updates
- Reasoning accordion (from Phase 4) in the review modal

Points at `apps/forge/web/src/views/agents/legal-department/` as the canonical implementation.

### `forge-reasoning-capture-skill`
Small, targeted skill for wiring reasoning capture into a new workflow (or an existing one):
- Using `callLLMMaybeWithReasoning` helper in specialists/synthesis/report nodes
- Stage ladder rendering of `reasoning` and `writing` states
- Review modal "Reasoning" accordion component
- Read endpoint pattern for fetching reasoning from `llm_usage` on demand

Points at the Phase 4 legal-department implementation as canonical.

### `legal-domain-skill` (long-term, not part of this effort)
Legal-specific domain knowledge — contract taxonomy, specialist routing rules, risk flag conventions, HITL reviewer feedback patterns. Not about workflows; about legal as a domain. Each department eventually gets its own domain skill. Not part of Phase 6; captured separately if/when legal itself stabilizes enough to have "canonical legal knowledge" worth writing down.

## Done when

- Each skill in the list above exists under `.claude/skills/` following the existing skill convention (see `skill-builder-skill` for the structural rules)
- Each skill references the legal-department canonical files by path and line number where useful
- Each skill has been tested by using it to build at least one new (throwaway or real) workflow and confirming the workflow falls out naturally — if the skill is too vague or too prescriptive, it gets revised based on that experience
- The roadmap for the next non-legal Forge workflow references the skills rather than copy-pasting legal code blindly

## Success criterion (the real test)

**A new async workflow with HITL can be scaffolded in one working session by an agent reading the skills** — tables, migrations, repository, controller, worker, frontend queue view, upload modal, and review modal all laid down and building cleanly, ready for domain-specific customization on top. If that test passes, the skills are good enough. If it takes multiple sessions or a lot of manual correction, the skills need another revision pass.

## Notes

- This effort intentionally has no code deliverables in `apps/forge/api/` or `apps/forge/web/`. It's pure knowledge capture.
- Legal-department's code does not change as part of this effort. Skills describe; they don't refactor.
- If, during skills writing, we notice something in legal-department that should change before being codified, we fix it in legal-department first (as a small separate PR) and then write the skill against the fixed version. The skill should always describe how things *are*, not how they *should be*.
- The skill builder agent (`agent-builder-skill` / `skill-builder-skill`) is the tool for this work.
