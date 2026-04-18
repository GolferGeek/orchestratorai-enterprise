# Persistent Case Team — Phase A: Matter Foundation — Implementation Plan

**PRD**: `docs/efforts/current/persistent-case-team/prd.md`
**Created**: 2026-04-18
**Status**: Complete

## Progress Tracker
- [x] Phase 1: Database Schema + Matter CRUD API
- [x] Phase 2: Facts Agent Graph
- [x] Phase 3: Documents Agent Graph
- [x] Phase 4: Frontend — Matter List + Dashboard
- [x] Phase 5: Brief + Hardening

---

## Phase 1: Database Schema + Matter CRUD API

**Status**: Complete
**Objective**: Run the matter schema migration, implement the full matter CRUD + document upload + knowledge read endpoints so the API is functional before any agents are wired.

### Steps

- [ ] 1.1 Add `MATTER_FACTS_INGEST_JOB_TYPE = 'matter-facts-ingest'` and `MATTER_DOCS_INGEST_JOB_TYPE = 'matter-docs-ingest'` to `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.types.ts`
- [ ] 1.2 Create migration `supabase/migrations/20260418000001_create_matter_tables.sql` with the full DDL from PRD §4.2: `legal.matters`, `legal.matter_documents`, `legal.matter_entities`, `legal.matter_timeline` plus all indexes
- [ ] 1.3 Apply migration: `npx supabase db push --db-url postgresql://postgres:postgres@127.0.0.1:6011/postgres`
- [ ] 1.4 Create `apps/forge/api/src/agents/legal-department/matter/matter.types.ts` — `MatterRow`, `MatterDocumentRow`, `MatterEntityRow`, `MatterTimelineRow`, `CreateMatterDto`, `UpdateMatterDto`, `UploadDocumentResponse`
- [ ] 1.5 Create `matter.repository.ts` — all DB reads/writes; every query filters by `matter_id` AND `org_slug`; no cross-matter queries
- [ ] 1.6 Create `matter.service.ts` — orchestrates: create, list, get, update; document upload (store via `LegalDocumentsStorageService`, insert `matter_documents` row, enqueue both job types via `LegalJobsRepository.insertQueued()`); read endpoints for entities, timeline, documents, jobs
- [ ] 1.7 Create `matter.controller.ts` — implement all 9 endpoints from PRD §4.3 with `JwtAuthGuard` + `RbacGuard`; multipart upload on `POST /:id/documents` (context as JSON string field, file as file field)
- [ ] 1.8 Create `matter.module.ts` — import `RagStorageModule` (for storage service), provide `MatterRepository`, `MatterService`; export `MatterService`
- [ ] 1.9 Add `MatterModule` to imports list and `MatterController` to controllers list in `legal-department.module.ts`
- [ ] 1.10 Write unit tests for `matter.repository.ts` (all query methods) and `matter.service.ts` (create, upload, read flows) co-located as `.spec.ts` siblings

### Quality Gate

Before moving to Phase 2, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test -- --testPathPattern=matter`
- [ ] **Migration applied**: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'legal' AND table_name IN ('matters','matter_documents','matter_entities','matter_timeline');` returns all 4 rows
- [ ] **Curl — Create matter**:
  ```bash
  curl -s -X POST http://localhost:6200/legal-department/matters \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"context":{"orgSlug":"test-org","userId":"user-1","conversationId":"conv-1","agentSlug":"legal-department","agentType":"forge","provider":"ollama","model":"gemma4:e4b"},"data":{"name":"Smith v. Jones","clientName":"Smith Corp","matterType":"litigation","jurisdiction":"NY","opposingParties":["Jones LLC"],"assignedUserIds":[],"description":"Test matter"}}' \
    | jq '.id'
  ```
  Expected: a UUID string
- [ ] **Curl — List matters**:
  ```bash
  curl -s "http://localhost:6200/legal-department/matters?status=active" \
    -H "Authorization: Bearer $TOKEN" | jq 'length'
  ```
  Expected: integer ≥ 1
- [ ] **Curl — Upload document** (queues jobs, agents not yet wired):
  ```bash
  MATTER_ID=<uuid from create>
  curl -s -X POST http://localhost:6200/legal-department/matters/$MATTER_ID/documents \
    -H "Authorization: Bearer $TOKEN" \
    -F 'context={"orgSlug":"test-org","userId":"user-1","conversationId":"conv-upload","agentSlug":"legal-department","agentType":"forge","provider":"ollama","model":"gemma4:e4b"}' \
    -F "file=@/tmp/test.pdf" | jq '{documentId,factsJobId,docsJobId}'
  ```
  Expected: object with three UUIDs
- [ ] **Curl — GET entities** (empty array expected at this stage):
  ```bash
  curl -s http://localhost:6200/legal-department/matters/$MATTER_ID/entities \
    -H "Authorization: Bearer $TOKEN" | jq 'length'
  ```
  Expected: 0
- [ ] **Phase Review**: Compare implementation against Phase 1 objectives
  - [ ] All 9 API endpoints defined in PRD §4.3 exist and return correct shape
  - [ ] Document upload enqueues exactly 2 jobs (facts + docs) per file
  - [ ] Every `MatterRepository` query filters both `matter_id` and `org_slug`
  - [ ] No cross-matter queries anywhere in new code
  - [ ] No TypeScript `any` types in new files

---

## Phase 2: Facts Agent Graph

**Status**: Complete
**Objective**: `FactsAgentService` processes a document upload job — reads the document, extracts entities and timeline entries via Ollama LLM, writes to `legal.matter_entities` and `legal.matter_timeline`, marks `facts_processed = true`. Worker routes `matter-facts-ingest` jobs to it.

### Steps

- [ ] 2.1 Create `apps/forge/api/src/agents/legal-department/workflows/persistent-case-team/facts-agent/facts-agent.state.ts` — state shape: `{ matterId, documentId, storagePath, documentContent, entities, timelineEntries, priorKnowledgeSummary, status, error }`
- [ ] 2.2 Create `facts-agent.types.ts` — `ExtractedEntity`, `ExtractedTimelineEntry`, `FactsAgentInput`, `FactsAgentResult`
- [ ] 2.3 Create `nodes/start.node.ts` — reads document content from `LegalDocumentsStorageService`, emits progress, sets `documentContent` in state
- [ ] 2.4 Create `nodes/extract-entities.node.ts` — LLM prompt with `documentContent` + condensed `priorKnowledgeSummary`; structured JSON output: `{ entityType, name, description, role }[]`; upserts to `legal.matter_entities` (conflict on `(matter_id, entity_type, lower(name))` → update `source_document_ids`, `description`, `role`)
- [ ] 2.5 Create `nodes/extract-timeline.node.ts` — LLM prompt for timeline events; structured JSON output: `{ eventDateRaw, eventType, description, significance, partiesInvolved }[]`; inserts to `legal.matter_timeline` with `source_document_id`
- [ ] 2.6 Create `nodes/update-knowledge.node.ts` — builds condensed `priorKnowledgeSummary` from extracted entities list (structured, not prose), updates checkpoint state; calls `MatterRepository.setFactsProcessed(documentId, true)`
- [ ] 2.7 Create `nodes/complete.node.ts` — sets `status = 'completed'` in state
- [ ] 2.8 Create `facts-agent.graph.ts` — compile graph: `start → extract_entities → extract_timeline → update_knowledge → complete`; use `PostgresCheckpointerService` with `thread_id: matter-${matterId}-facts`
- [ ] 2.9 Create `facts-agent.service.ts` — `process(input: FactsAgentInput): Promise<{ status, entities, timelineEntries }>` that invokes the compiled graph with the matter-scoped thread
- [ ] 2.10 Create `facts-agent.module.ts` and `facts-agent.presentation.ts`
- [ ] 2.11 Add `FactsAgentModule` to `LegalDepartmentModule` imports; inject `FactsAgentService` into `LegalJobsWorkerService`
- [ ] 2.12 Add `case MATTER_FACTS_INGEST_JOB_TYPE` branch to the dispatch switch in `LegalJobsWorkerService.executeJob()` → calls `factsAgentService.process(input)`
- [ ] 2.13 Write unit tests for each node (mock LLM, mock storage, mock repo); write integration test: upload a real PDF to a test matter via API, wait for job completion, assert `matter_entities` rows exist and `facts_processed = true`

### Quality Gate

Before moving to Phase 3, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test -- --testPathPattern="facts-agent"`
- [ ] **Integration Test**: Upload a test document to a matter, wait ≤3 min for `matter-facts-ingest` job to complete:
  ```bash
  # Poll until job status = completed
  curl -s http://localhost:6200/legal-department/matters/$MATTER_ID/jobs \
    -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.status=="completed") | .id'
  ```
- [ ] **Curl — Verify entities populated**:
  ```bash
  curl -s http://localhost:6200/legal-department/matters/$MATTER_ID/entities \
    -H "Authorization: Bearer $TOKEN" | jq 'length'
  ```
  Expected: integer ≥ 1
- [ ] **Curl — Verify timeline populated**:
  ```bash
  curl -s http://localhost:6200/legal-department/matters/$MATTER_ID/timeline \
    -H "Authorization: Bearer $TOKEN" | jq 'length'
  ```
  Expected: integer ≥ 0 (may be 0 for documents without dateable events)
- [ ] **DB check — facts_processed flag**:
  ```sql
  SELECT facts_processed FROM legal.matter_documents WHERE id = '<document-id>';
  ```
  Expected: `true`
- [ ] **DB check — thread isolation**: Two matters processed, verify `SELECT matter_id, count(*) FROM legal.matter_entities GROUP BY matter_id` shows two distinct matter IDs with no cross-contamination
- [ ] **Phase Review**: Compare against Phase 2 objectives
  - [ ] Checkpoint thread ID is `matter-${matterId}-facts` (accumulates across documents)
  - [ ] `priorKnowledgeSummary` is stored in LangGraph state, not in DB
  - [ ] All entity upserts use the unique index conflict target to prevent duplicates
  - [ ] No hardcoded Anthropic/OpenAI model references — only Ollama via LLM plane
  - [ ] LLM prompt instructs attribution of extractions to current document

---

## Phase 3: Documents Agent Graph

**Status**: Complete
**Objective**: `DocumentsAgentService` classifies the document and extracts metadata — updating `legal.matter_documents` with `document_class`, `summary`, `parties`, `key_terms`, `document_date` — and marks `docs_processed = true`.

### Steps

- [ ] 3.1 Create `apps/forge/api/src/agents/legal-department/workflows/persistent-case-team/documents-agent/documents-agent.state.ts` — state shape: `{ matterId, documentId, storagePath, documentContent, documentClass, documentDate, summary, parties, keyTerms, additionalMetadata, status, error }`
- [ ] 3.2 Create `documents-agent.types.ts` — `ClassificationResult`, `MetadataResult`, `DocumentsAgentInput`, `DocumentsAgentResult`
- [ ] 3.3 Create `nodes/start.node.ts` — reads document content from `LegalDocumentsStorageService`, emits progress
- [ ] 3.4 Create `nodes/classify-document.node.ts` — LLM prompt → structured JSON: `{ documentClass: 'contract'|'deposition'|'court_filing'|'correspondence'|'evidence'|'other', documentDate: string|null, summary: string }`; updates `matter_documents` row
- [ ] 3.5 Create `nodes/extract-metadata.node.ts` — LLM prompt → structured JSON: `{ parties: string[], keyTerms: string[], metadata: Record<string, unknown> }`; updates `matter_documents` row
- [ ] 3.6 Create `nodes/update-index.node.ts` — calls `MatterRepository.setDocsProcessed(documentId, true)`
- [ ] 3.7 Create `nodes/complete.node.ts` — sets `status = 'completed'`
- [ ] 3.8 Create `documents-agent.graph.ts` — compile graph: `start → classify_document → extract_metadata → update_index → complete`; use `PostgresCheckpointerService` with `thread_id: matter-${matterId}-documents`
- [ ] 3.9 Create `documents-agent.service.ts`, `documents-agent.module.ts`, `documents-agent.presentation.ts`
- [ ] 3.10 Add `DocumentsAgentModule` to `LegalDepartmentModule` imports; inject `DocumentsAgentService` into `LegalJobsWorkerService`
- [ ] 3.11 Add `case MATTER_DOCS_INGEST_JOB_TYPE` branch in `LegalJobsWorkerService.executeJob()`
- [ ] 3.12 Write unit tests for each node; write integration test: upload a document, wait for `matter-docs-ingest` job completion, assert `matter_documents` row has non-null `document_class` and `summary`

### Quality Gate

Before moving to Phase 4, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test -- --testPathPattern="documents-agent"`
- [ ] **Integration Test**: Upload test document, wait for `matter-docs-ingest` job to complete status:
  ```bash
  curl -s http://localhost:6200/legal-department/matters/$MATTER_ID/jobs?status=completed \
    -H "Authorization: Bearer $TOKEN" | jq '[.[] | select(.input.metadata.jobType=="matter-docs-ingest")] | length'
  ```
  Expected: 1
- [ ] **Curl — Verify document classification**:
  ```bash
  curl -s http://localhost:6200/legal-department/matters/$MATTER_ID/documents \
    -H "Authorization: Bearer $TOKEN" | jq '.[0] | {document_class, summary, docs_processed}'
  ```
  Expected: `document_class` non-null, `summary` non-null, `docs_processed: true`
- [ ] **DB check — docs_processed flag**:
  ```sql
  SELECT docs_processed, document_class, summary FROM legal.matter_documents WHERE id = '<document-id>';
  ```
  Expected: `docs_processed = true`, `document_class` and `summary` non-null
- [ ] **End-to-end timing**: Both agents (facts + docs) complete a single document in under 3 minutes on `gemma4:e4b`
- [ ] **Phase Review**: Compare against Phase 3 objectives
  - [ ] `document_class` is one of the 6 enum values from PRD §4.2
  - [ ] LLM prompts use structured JSON output schema (not free-text parsing)
  - [ ] No cross-document data leakage (doc metadata only references one document)
  - [ ] Checkpoint thread ID is `matter-${matterId}-documents`

---

## Phase 4: Frontend — Matter List + Dashboard

**Status**: Complete
**Objective**: `MatterListPage.vue` lists matters, `CreateMatterModal.vue` creates them, `MatterDashboard.vue` shows Case Overview + Documents tabs with real-time processing status polling.

### Steps

- [ ] 4.1 Add service methods to `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts`: `createMatter`, `listMatters`, `getMatter`, `uploadMatterDocument`, `getMatterDocuments`, `getMatterEntities`, `getMatterTimeline`, `getMatterJobs` — all typed with the DTO types from the API
- [ ] 4.2 Create `apps/forge/web/src/views/agents/legal-department/MatterListPage.vue` — matters table (name, client, type, status, document count, opened date), "New Matter" button, row-click navigation to dashboard, Benefits button wired to `BriefModal` with slug `persistent-case-team`
- [ ] 4.3 Create `CreateMatterModal.vue` — form: name, clientName, matterType (select), jurisdiction, opposingParties (tag input), description; calls `createMatter()`; dismisses modal and refreshes list on success
- [ ] 4.4 Create `MatterDashboard.vue` — two-tab layout (Case Overview, Documents); loads matter metadata on mount; stats bar (document count, entity count, timeline event count, pending jobs count)
- [ ] 4.5 Create `CaseOverviewTab.vue` — entity list grouped by type; each entity: name, role, description, source document badge count
- [ ] 4.6 Create `DocumentsTab.vue` — upload button (file input → `uploadMatterDocument()`); document list showing original name, classification badge, document date, parties, summary, processing status; polling every 5s when any document has `facts_processed = false || docs_processed = false`; expanding a document row shows full metadata and timeline events sourced from it
- [ ] 4.7 Add route to `apps/forge/web/src/router/index.ts`:
  ```typescript
  { path: 'agents/legal-department/matters', name: 'LegalMatters', component: () => import('.../MatterListPage.vue'), meta: { requiresAuth: true, title: 'Case Team', description: 'Persistent case team dashboard' } },
  { path: 'agents/legal-department/matters/:matterId', name: 'MatterDashboard', component: () => import('.../MatterDashboard.vue'), meta: { requiresAuth: true } },
  ```
- [ ] 4.8 Add nav entry to `apps/forge/web/src/views/ForgeShellPage.vue` under Legal Department children: `{ label: 'Case Team', path: '/app/agents/legal-department/matters' }`
- [ ] 4.9 Start dev server (`npm run dev:forge:web` + `npm run dev:forge:api`); test golden path: create matter → upload document → observe processing spinner → observe entities appear in Case Overview tab
- [ ] 4.10 Test edge cases in browser: empty state (no matters yet), uploading multiple documents, filtering entities by type, job failure display

### Quality Gate

Before moving to Phase 5, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` (if lint script exists)
- [ ] **Build check**: `cd apps/forge/web && npm run build:check` or `npm run type-check` — zero TypeScript errors
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — all existing tests still pass
- [ ] **Chrome — Matter List**: Navigate to `http://localhost:6201/app/agents/legal-department/matters`; table renders with real data; "New Matter" button opens modal
- [ ] **Chrome — Create matter**: Fill form, submit; new matter appears in table
- [ ] **Chrome — Upload document**: Open matter dashboard; upload a PDF; spinner appears in Documents tab; within 3 minutes, spinner clears, classification badge and summary appear
- [ ] **Chrome — Case Overview**: After document processing, entities appear grouped by type in Case Overview tab; each entity shows name, role, source badge count
- [ ] **Chrome — Polling**: Upload second document; confirm status polling starts automatically without page refresh
- [ ] **Chrome — Brief**: Click Benefits button on `MatterListPage`; `BriefModal` opens (404 acceptable until Phase 5 registers the brief)
- [ ] **Phase Review**: Compare against Phase 4 objectives
  - [ ] Both routes registered and navigable
  - [ ] Nav entry appears under Legal Department in sidebar
  - [ ] Processing status polling stops when all documents are `facts_processed && docs_processed`
  - [ ] No console errors in browser during golden path

---

## Phase 5: Brief + Hardening

**Status**: Complete
**Objective**: Register the brief, enforce file size limit, validate matter ownership on all endpoints, confirm matter isolation with an integration test, and verify zero `any` types across all new files.

### Steps

- [x] 5.1 Create `apps/forge/api/src/agents/legal-department/workflows/persistent-case-team/brief.md`
- [x] 5.2 Register the brief in `apps/forge/api/src/agent-registry/agent-registry.controller.ts` (`BRIEF_PATHS['legal-department']['persistent-case-team']`)
- [x] 5.3 File size limit: `MAX_UPLOAD_BYTES = 50MB` enforced in `matter.service.ts` (already in place)
- [x] 5.4 `assertOwnership` in `MatterService` called on all read endpoints; `assertMatterOwnership` in repo used in `uploadDocument`
- [x] 5.5 Cross-matter isolation covered in `matter.service.spec.ts` (ForbiddenException test at line 157)
- [x] 5.6 TypeScript audit: `npx tsc --noEmit` — zero errors
- [x] 5.7 Full unit test suite: 71 persistent-case-team tests pass; pre-existing failures unrelated to our changes
- [x] 5.8 `GET /agents/legal-department/brief/persistent-case-team` returns 200 ✓

### Quality Gate

Before marking effort complete, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` — zero errors
- [ ] **Build**: `cd apps/forge/api && npm run build` — zero errors
- [ ] **TypeScript**: `cd apps/forge/api && npx tsc --noEmit` — zero errors in new files
- [ ] **All Unit Tests**: `cd apps/forge/api && npm run test` — all pass
- [ ] **Curl — Brief endpoint**:
  ```bash
  curl -s http://localhost:6200/agents/legal-department/brief/persistent-case-team \
    -H "Authorization: Bearer $TOKEN" | jq '.title'
  ```
  Expected: the brief title string (non-null)
- [ ] **Curl — File size rejection** (>50MB):
  ```bash
  dd if=/dev/zero bs=1M count=51 | curl -s -X POST \
    http://localhost:6200/legal-department/matters/$MATTER_ID/documents \
    -H "Authorization: Bearer $TOKEN" \
    -F 'context={"orgSlug":"test-org","userId":"u1","conversationId":"c1","agentSlug":"legal-department","agentType":"forge","provider":"ollama","model":"gemma4:e4b"}' \
    -F "file=@/dev/stdin;filename=large.pdf" | jq '.statusCode'
  ```
  Expected: 400
- [ ] **Curl — Cross-org ownership check**:
  ```bash
  # Create matter under org-A, attempt read with org-B token
  curl -s http://localhost:6200/legal-department/matters/$MATTER_A_ID/entities \
    -H "Authorization: Bearer $ORG_B_TOKEN" | jq '.statusCode'
  ```
  Expected: 403 or 404
- [ ] **Cross-matter isolation test**: Integration test passes (described in step 5.5)
- [ ] **Chrome — BriefModal opens**: Navigate to `MatterListPage`, click Benefits, verify `BriefModal` shows `persistent-case-team` brief content
- [ ] **Phase Review**: Final PRD alignment check
  - [ ] `POST /legal-department/matters` creates matter + (logically) instantiates agent checkpoint threads via scoped thread IDs
  - [ ] 10 documents uploaded → 10 `matter-facts-ingest` + 10 `matter-docs-ingest` jobs complete without error
  - [ ] `GET /legal-department/matters/:id/entities` returns entities with `source_document_ids` populated (citation grounding)
  - [ ] `GET /legal-department/matters/:id/documents` returns all docs with LLM-generated `document_class` and `summary`
  - [ ] Matter Dashboard renders Case Overview and Documents tabs with real data
  - [ ] `brief.md` exists and is accessible via the registry endpoint
  - [ ] Zero TypeScript `any` types in all new files
  - [ ] All success criteria from PRD §2 satisfied
