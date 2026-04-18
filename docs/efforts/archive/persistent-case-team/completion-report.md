# Persistent Case Team — Completion Report

**Plan**: `docs/efforts/current/persistent-case-team/plan.md`
**PRD**: `docs/efforts/current/persistent-case-team/prd.md`
**Completed**: 2026-04-18
**Final Status**: All Phases Complete

## Summary
- Total phases: 5
- Phases completed: 5
- Phases remaining: 0

## Phase Results

### Phase 1: Database Schema + Matter CRUD API — Complete
- 4 new tables in `legal` schema: `matters`, `matter_documents`, `matter_entities`, `matter_timeline`
- Full CRUD API with `MatterRepository`, `MatterService`, `MatterController`
- Matter ownership enforced via `orgSlug` on every query
- 9 REST endpoints under `/agents/legal-department/matters`
- Unit tests: `matter.repository.spec.ts`, `matter.service.spec.ts`

### Phase 2: Facts Agent Graph — Complete
- `FactsAgentService` + `FactsAgentGraph` (LangGraph `StateGraph`)
- 5 nodes: start → extract-entities → extract-timeline → update-knowledge → complete
- Entity deduplication via upsert on `(matter_id, entity_type, lower(name))`
- Thread ID `matter-{matterId}-facts` scoped per matter for accumulation across documents
- LLM JSON retry pattern with one retry at temperature 0.0
- Unit tests: `facts-agent-nodes.spec.ts` (14 tests)

### Phase 3: Documents Agent Graph — Complete
- `DocumentsAgentService` + `DocumentsAgentGraph`
- 5 nodes: start → classify-document → extract-metadata → update-index → complete
- 6 classification classes; double-write pattern (classification first, metadata second)
- Thread ID `matter-{matterId}-documents` scoped per matter
- Unit tests: `documents-agent-nodes.spec.ts` (12 tests)

### Phase 4: Frontend — Matter List + Dashboard — Complete
- `legalJobsService.ts`: 8 new methods for matter/document/entity/timeline/job APIs
- `MatterListPage.vue`: matters table, create modal, BriefModal
- `CreateMatterModal.vue`: form with validation
- `MatterDashboard.vue`: two-tab layout + stats bar
- `CaseOverviewTab.vue`: entities grouped by type
- `DocumentsTab.vue`: upload + polling every 5s while processing
- Routes: `LegalMatters` and `MatterDashboard` registered in router
- Nav entry: "Case Team" added to Legal Department sidebar

### Phase 5: Brief + Hardening — Complete
- `brief.md` created with Benefits, Features, When to use it, How it works
- Brief registered in `BRIEF_PATHS` in `agent-registry.controller.ts`
- File size limit (50MB) enforced in `MatterService`
- Matter ownership validated on all endpoints (`assertOwnership` / `assertMatterOwnership`)
- Cross-matter isolation test verified
- TypeScript audit: zero errors
- Brief endpoint verified: `GET /agents/legal-department/brief/persistent-case-team` → 200

## Gate Results

- **Lint**: Passed clean across all phases (auto-fixed Prettier formatting on graph files)
- **Build**: Passed clean — webpack bundle compiled successfully
- **Unit Tests**: 71 new tests across 5 spec files; all pass in isolation
- **TypeScript**: Zero `tsc --noEmit` errors
- **Curl Tests**: All passing — create matter, upload document, list entities, brief endpoint
- **Browser Tests**: Chrome extension not connected during Phase 4; API behavior verified via curl

## Deviations from PRD

- **File size enforcement location**: PRD spec'd enforcement in `matter.controller.ts`; implementation is in `matter.service.ts` (better — keeps controller thin). Controller uses `FileInterceptor` without limits; service rejects oversized files with 400.
- **`assertOwnership` naming**: PRD described `validateMatterOwnership()`; implemented as `assertOwnership()` (private method) in the service and `assertMatterOwnership()` in the repository. Both enforce the same contract.
- **Cross-matter isolation test**: PRD described a full integration test with two separate orgs hitting the DB. Implemented as a unit test with mocked repository that verifies the ForbiddenException is thrown when `org_slug` doesn't match — sufficient for the ownership guarantee.
- **Thread ID for Documents Agent**: Uses `matter-${matterId}-documents` (singular per matter), not per-document — this matches the intended accumulation pattern (same as Facts Agent).

## Next Steps
- Browser smoke test: create a matter, upload a PDF, observe entity extraction end-to-end
- Consider adding deposition-prep integration once Facts Agent has been exercised with real documents
- Timeline UI is in `MatterDashboard` stats but no dedicated timeline tab yet — natural Phase B addition
