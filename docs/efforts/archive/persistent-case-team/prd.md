# Persistent Case Team — Phase A: Matter Foundation
## Product Requirements Document

**Effort folder**: `docs/efforts/current/persistent-case-team/`
**Created**: 2026-04-18
**Scope note**: The full Persistent Case Team is a 6-phase, 4-8 month program (Phases A-F per the intention). This PRD covers **Phase A only**: matter creation, team instantiation, and the first two persistent agents (Facts + Documents). Phases B-F are future efforts.

---

## 1. Overview

When a partner opens a new matter, a persistent **Facts Agent** and **Documents Agent** are instantiated and bound to that matter for its lifetime. Every document uploaded to the matter is automatically processed: the Documents Agent classifies and indexes it; the Facts Agent extracts entities, events, and a timeline from it and accumulates them into a growing matter knowledge base. At the end of Phase A, a partner can open a matter, upload documents, and immediately query a structured, growing knowledge base of everything the team has ever seen — without manually reading the file.

This is the foundation every subsequent phase builds on. Phase B adds event-driven wake-ups (Pulse watchers, docket polling). Phase C adds query mode (Lead Counsel routing). Phase D adds synthesis cycles and autonomous escalation. Phase A proves the persistent state architecture and matter isolation model that all later agents depend on.

---

## 2. Goals & Success Criteria

### Goals
1. A partner can create a matter with case metadata (client, type, jurisdiction, parties, team config).
2. Every document uploaded to a matter is processed by both agents automatically, without manual trigger.
3. The Facts Agent accumulates a growing knowledge base of entities, events, and timeline entries across all documents — persistent across sessions.
4. The Documents Agent maintains a classified, metadata-rich document index for the matter.
5. Matter isolation is absolute: no data from Matter A can appear in Matter B at any layer.

### Success Criteria
- `POST /legal-department/matters` creates a matter and instantiates agent checkpoint threads.
- Uploading 10 documents to a matter results in 10 entity-extraction + 10 document-classification jobs completing without error.
- `GET /legal-department/matters/:id/knowledge` returns entities, events, and timeline entries extracted from all uploaded documents, correctly attributed to source documents.
- `GET /legal-department/matters/:id/documents` returns all uploaded documents with LLM-generated classification and metadata.
- Running `SELECT * FROM legal.matter_entities WHERE matter_id = '<matter-B-id>'` returns zero rows when only Matter A has been populated.
- The Matter Dashboard renders Case Overview and Documents tabs with real data.
- A `brief.md` exists for the workflow, registered in `agent-registry.controller.ts`, accessible from the Matter Dashboard page via BriefModal.

---

## 3. User Stories

**Partner — opens a matter:**
> As a litigation partner, I can create a matter with client name, case type, jurisdiction, opposing parties, and assigned team members so that all subsequent work is organized and isolated under one persistent record.

**Partner — uploads documents:**
> As a partner, when I upload a contract, deposition transcript, or court filing to a matter, the system automatically processes it without me having to trigger anything — both classifying it and extracting the key facts from it — so my case knowledge base grows continuously.

**Partner — reads the knowledge base:**
> As a partner, I can open a matter's dashboard and immediately see every named entity, key event, and timeline entry that the team has extracted from documents, with citations back to the source documents, so I can get up to speed without re-reading the file.

**Partner — browses the document index:**
> As a partner, I can see all documents in a matter, their LLM-generated classifications (contract, deposition, court order, etc.), and extracted metadata (parties, dates, amounts, key terms) so I can find a document without full-text search.

---

## 4. Technical Requirements

### 4.1 Architecture

Two new LangGraph workflows live at:
```
apps/forge/api/src/agents/legal-department/workflows/persistent-case-team/
  facts-agent/
    facts-agent.graph.ts
    facts-agent.state.ts
    facts-agent.service.ts
    facts-agent.module.ts
    facts-agent.types.ts
    facts-agent.presentation.ts
    nodes/
      start.node.ts
      extract-entities.node.ts
      extract-timeline.node.ts
      update-knowledge.node.ts
      complete.node.ts
  documents-agent/
    documents-agent.graph.ts
    documents-agent.state.ts
    documents-agent.service.ts
    documents-agent.module.ts
    documents-agent.types.ts
    documents-agent.presentation.ts
    nodes/
      start.node.ts
      classify-document.node.ts
      extract-metadata.node.ts
      update-index.node.ts
      complete.node.ts
  brief.md
```

New matter infrastructure lives at:
```
apps/forge/api/src/agents/legal-department/matter/
  matter.controller.ts     (HTTP endpoints: CRUD + document upload + knowledge + jobs)
  matter.repository.ts     (DB access: legal.matters, legal.matter_entities, etc.)
  matter.service.ts        (Orchestrates uploads, job enqueue, read queries)
  matter.module.ts
  matter.types.ts
```

**Data flow for document upload:**
```
[User uploads document]
→ POST /legal-department/matters/:id/documents
→ MatterService stores file via LegalDocumentsStorageService
→ Inserts document row in legal.matter_documents
→ Enqueues job: { job_type: MATTER_FACTS_INGEST_JOB_TYPE, matter_id, document_id }
→ Enqueues job: { job_type: MATTER_DOCS_INGEST_JOB_TYPE, matter_id, document_id }
→ LegalJobsWorkerService claims each job, routes to FactsAgentService or DocumentsAgentService
→ Each agent graph runs against its matter-scoped checkpoint thread
→ Agent writes extracted data to legal.matter_entities / legal.matter_documents
```

**Agent thread ID convention:**
Every LangGraph graph invocation for an agent uses:
```
thread_id: `matter-${matterId}-facts`     (Facts Agent)
thread_id: `matter-${matterId}-documents` (Documents Agent)
```
This ensures each agent's checkpoint accumulates across every document processed for the matter.

**Critical: agent state accumulates.** The Facts Agent is not invoked fresh per document — it resumes its checkpointed thread each time, so extracted entities and timeline entries from Document 1 are still in context when Document 10 is processed. The `matter_entities` and `matter_timeline` tables are the durable read-side; the LangGraph checkpoint is the agent's reasoning state.

### 4.2 Data Model Changes

**New migration**: `supabase/migrations/20260418000001_create_matter_tables.sql`

```sql
-- ── Matters ──────────────────────────────────────────────────────────────────
CREATE TABLE legal.matters (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug          TEXT    NOT NULL,
  created_by        TEXT    NOT NULL,        -- userId
  name              TEXT    NOT NULL,
  client_name       TEXT    NOT NULL,
  matter_type       TEXT    NOT NULL,        -- 'litigation' | 'transactional' | 'advisory' | 'regulatory'
  jurisdiction      TEXT    NOT NULL,
  opposing_parties  TEXT[]  NOT NULL DEFAULT '{}',
  assigned_user_ids TEXT[]  NOT NULL DEFAULT '{}',
  status            TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'closed', 'archived')),
  description       TEXT,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matters_org ON legal.matters (org_slug);
CREATE INDEX idx_matters_org_status ON legal.matters (org_slug, status);
CREATE INDEX idx_matters_user ON legal.matters (org_slug, created_by);

-- ── Matter Documents ──────────────────────────────────────────────────────────
-- Document index. The storage path is in legal.agent_jobs.document_paths;
-- this table holds the metadata layer produced by DocumentsAgent.
CREATE TABLE legal.matter_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id        UUID NOT NULL REFERENCES legal.matters(id) ON DELETE CASCADE,
  org_slug         TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  original_name    TEXT NOT NULL,
  document_class   TEXT,      -- LLM-assigned: 'contract' | 'deposition' | 'court_filing' | 'correspondence' | 'evidence' | 'other'
  document_date    DATE,      -- Extracted date from document
  parties          TEXT[] NOT NULL DEFAULT '{}',
  key_terms        TEXT[] NOT NULL DEFAULT '{}',
  summary          TEXT,      -- 1-3 sentence LLM summary
  metadata         JSONB NOT NULL DEFAULT '{}',
  facts_processed  BOOLEAN NOT NULL DEFAULT false,
  docs_processed   BOOLEAN NOT NULL DEFAULT false,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by      TEXT NOT NULL
);

CREATE INDEX idx_matter_docs_matter ON legal.matter_documents (matter_id);
CREATE INDEX idx_matter_docs_unprocessed_facts ON legal.matter_documents (matter_id, facts_processed) WHERE NOT facts_processed;
CREATE INDEX idx_matter_docs_unprocessed_docs ON legal.matter_documents (matter_id, docs_processed) WHERE NOT docs_processed;

-- ── Matter Entities ───────────────────────────────────────────────────────────
-- Named entities extracted by the Facts Agent, keyed by matter.
-- One row per unique entity per matter. Multiple source docs via source_document_ids.
CREATE TABLE legal.matter_entities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id           UUID NOT NULL REFERENCES legal.matters(id) ON DELETE CASCADE,
  org_slug            TEXT NOT NULL,
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('person', 'organization', 'location', 'date', 'amount', 'contract', 'claim', 'exhibit', 'other')),
  name                TEXT NOT NULL,
  description         TEXT,
  role                TEXT,     -- e.g. 'plaintiff', 'expert witness', 'counterparty'
  source_document_ids UUID[] NOT NULL DEFAULT '{}',
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matter_entities_matter ON legal.matter_entities (matter_id);
CREATE INDEX idx_matter_entities_type ON legal.matter_entities (matter_id, entity_type);
-- Enforce entity name uniqueness per matter (prevents duplicate rows on re-processing)
CREATE UNIQUE INDEX idx_matter_entities_name ON legal.matter_entities (matter_id, entity_type, lower(name));

-- ── Matter Timeline ───────────────────────────────────────────────────────────
-- Chronological events extracted by the Facts Agent.
CREATE TABLE legal.matter_timeline (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id           UUID NOT NULL REFERENCES legal.matters(id) ON DELETE CASCADE,
  org_slug            TEXT NOT NULL,
  event_date          DATE,
  event_date_raw      TEXT NOT NULL,  -- Original text (e.g. "approximately Q2 2024")
  event_type          TEXT NOT NULL CHECK (event_type IN ('filing', 'deposition', 'hearing', 'communication', 'transaction', 'discovery', 'other')),
  description         TEXT NOT NULL,
  significance        TEXT CHECK (significance IN ('critical', 'high', 'medium', 'low')),
  parties_involved    TEXT[] NOT NULL DEFAULT '{}',
  source_document_id  UUID NOT NULL REFERENCES legal.matter_documents(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matter_timeline_matter ON legal.matter_timeline (matter_id);
CREATE INDEX idx_matter_timeline_date ON legal.matter_timeline (matter_id, event_date);
CREATE INDEX idx_matter_timeline_source ON legal.matter_timeline (source_document_id);
```

**New job type constants** added to `legal-jobs.types.ts`:
```typescript
export const MATTER_FACTS_INGEST_JOB_TYPE = 'matter-facts-ingest';
export const MATTER_DOCS_INGEST_JOB_TYPE  = 'matter-docs-ingest';
```

Both job types use the existing `legal.agent_jobs` table. The `input` JSONB includes:
```json
{
  "context": { "...ExecutionContext fields..." },
  "data": { "matterId": "<uuid>", "documentId": "<uuid>", "storagePath": "..." },
  "metadata": { "jobType": "matter-facts-ingest" }
}
```

**No new Postgres schema per matter.** Matter isolation is enforced by:
1. `matter_id` FK on all matter tables (entities, timeline, documents)
2. All repository queries filter by `matter_id` AND `org_slug`
3. The `MatterRepository` never issues cross-matter queries
4. LangGraph thread IDs are scoped: `matter-${matterId}-{agent}`

Per-matter Postgres schemas (as described in the intention) are deferred to a future hardening phase if RLS proves insufficient. The `matter_id` + `org_slug` two-key pattern provides the same isolation guarantee for Phase A.

### 4.3 API Changes

All endpoints require `JwtAuthGuard` + `RbacGuard` (existing patterns). The caller passes `ExecutionContext` in the request body (consistent with all other legal-department endpoints).

#### Matter CRUD

```
POST   /legal-department/matters
       Body: { context, data: { name, clientName, matterType, jurisdiction, opposingParties, assignedUserIds, description } }
       Response: MatterRow

GET    /legal-department/matters
       Query: ?status=active|closed|archived
       Headers: x-org-slug, x-user-id (extracted from JWT)
       Response: MatterRow[]

GET    /legal-department/matters/:id
       Response: MatterRow

PATCH  /legal-department/matters/:id
       Body: { context, data: { name?, clientName?, status?, assignedUserIds?, description? } }
       Response: MatterRow
```

#### Document Upload

```
POST   /legal-department/matters/:id/documents
       Body: multipart/form-data { context (JSON string — ExecutionContext with conversationId = crypto.randomUUID() set by frontend), file }
       Response: { documentId, storagePath, factsJobId, docsJobId }
       — Stores file via LegalDocumentsStorageService
       — Inserts legal.matter_documents row (facts_processed=false, docs_processed=false)
       — Enqueues MATTER_FACTS_INGEST_JOB_TYPE job
       — Enqueues MATTER_DOCS_INGEST_JOB_TYPE job
       — Returns both job IDs for frontend polling
```

#### Knowledge Read Endpoints

```
GET    /legal-department/matters/:id/documents
       Response: MatterDocumentRow[]

GET    /legal-department/matters/:id/entities
       Query: ?type=person|organization|...
       Response: MatterEntityRow[]

GET    /legal-department/matters/:id/timeline
       Response: MatterTimelineRow[]  (ordered by event_date ASC, nulls last)

GET    /legal-department/matters/:id/jobs
       Query: ?status=queued|processing|completed|failed
       Response: AgentJobRow[]  (filtered to this matter's facts/docs ingest jobs)
```

#### Worker routing

`LegalJobsWorkerService.dispatchJob()` gains two new case branches:
```typescript
case MATTER_FACTS_INGEST_JOB_TYPE:
  return this.factsAgentService.process(input);
case MATTER_DOCS_INGEST_JOB_TYPE:
  return this.documentsAgentService.process(input);
```

### 4.4 Frontend Changes

#### New page: `MatterListPage.vue`
Route: `/app/agents/legal-department/matters`
Nav: added as child under "Legal Department" in `ForgeShellPage.vue`

- Lists all matters for the org (table: name, client, type, status, document count, opened date)
- "New Matter" button opens `CreateMatterModal.vue` (form: name, clientName, matterType, jurisdiction, opposingParties, description)
- Clicking a matter row navigates to `MatterDashboard`
- Benefits button wired to `BriefModal` (same pattern as all other legal pages)

Route definition (added to `router/index.ts`):
```typescript
{
  path: 'agents/legal-department/matters',
  name: 'LegalMatters',
  component: () => import('.../MatterListPage.vue'),
  meta: { requiresAuth: true, title: 'Case Team', description: 'Persistent case team dashboard' },
}
```

#### New page: `MatterDashboard.vue`
Route: `/app/agents/legal-department/matters/:matterId`

Two tabs in Phase A:

**Tab 1 — Case Overview**
- Matter metadata (name, client, type, jurisdiction, opposing parties)
- Stats bar: document count, entity count, timeline event count, pending jobs count
- Entity list grouped by type (person / org / location / date / amount / other)
- Each entity shows name, role, description, source document badge count

**Tab 2 — Documents**
- Upload button (opens file picker, calls `POST /matters/:id/documents`)
- Document list: original name, classification badge, document date, parties, summary, processing status (pending/complete/failed)
- Processing status: shows spinner if `facts_processed=false || docs_processed=false` with polling at 5s
- Expanding a document shows full extracted metadata and timeline events sourced from it

#### New modals:
- `CreateMatterModal.vue` — form fields for all `POST /matters` body fields
- No HITL modals needed in Phase A (agents run to completion without human review gates)

#### New service methods in `legalJobsService.ts`:
```typescript
createMatter(ctx, data): Promise<MatterRow>
listMatters(ctx): Promise<MatterRow[]>
getMatter(ctx, matterId): Promise<MatterRow>
uploadMatterDocument(ctx, matterId, file): Promise<UploadResponse>
getMatterDocuments(ctx, matterId): Promise<MatterDocumentRow[]>
getMatterEntities(ctx, matterId, type?): Promise<MatterEntityRow[]>
getMatterTimeline(ctx, matterId): Promise<MatterTimelineRow[]>
getMatterJobs(ctx, matterId, status?): Promise<AgentJobRow[]>
```

### 4.5 Infrastructure Requirements

**LangGraph checkpointing**: Both agents use `PostgresCheckpointerService` (existing). Thread IDs are `matter-${matterId}-facts` and `matter-${matterId}-documents`. No new checkpointing infrastructure needed.

**File storage**: `LegalDocumentsStorageService` (existing). Storage path pattern: `matters/${matterId}/documents/${documentId}/${originalFilename}`.

**Worker**: `LegalJobsWorkerService` (existing) claims and dispatches both new job types. No new worker infrastructure.

**Concurrency**: Both agents run sequentially per matter (same `ProviderConcurrencyRegistry` slot as all other legal workflows). Two jobs per document upload (facts + docs) means two sequential processing runs.

---

## 5. Non-Functional Requirements

**Matter isolation (absolute):**
- Every DB query in `MatterRepository` filters by both `matter_id` AND `org_slug`
- `MatterService` validates that the requested `matter_id` belongs to the caller's `org_slug` before any read or write
- LangGraph thread IDs include `matter_id` — a thread for Matter A is physically unreachable from Matter B's graph invocation
- No cross-matter queries anywhere in the codebase

**Citation grounding:**
- Every entity and timeline entry in the DB has a non-null `source_document_id` (or `source_document_ids`)
- LLM prompts instruct agents to attribute every extraction to the specific document being processed
- Extractions without a traceable source document are rejected (not silently stored)

**No autonomous actions:**
- Phase A agents write to DB tables only; they do not send emails, file documents, or trigger external systems
- The only side effects are: updating `facts_processed`/`docs_processed` flags, inserting entities, inserting timeline events, updating document metadata

**Performance:**
- Single document processing (both agents) completes in under 3 minutes on Ollama (`gemma4:e4b`)
- `GET /matters/:id/knowledge` endpoints return in under 200ms (indexed queries, no LLM calls)

**Long-context accumulation:**
- The Facts Agent graph node `extract-entities` receives only the current document's content plus a condensed summary of previously extracted entities (not the full prior context). This prevents unbounded context growth while maintaining continuity.
- The condensed prior-context summary is stored as a field in the agent's **LangGraph state** (`priorKnowledgeSummary: string`), not in the database. It lives in the checkpointed thread and is updated after each document. The database tables (`matter_entities`, `matter_timeline`) are the durable read-side; the checkpoint is the agent's reasoning state.

---

## 6. Out of Scope (Phase A)

These are intentional exclusions for Phase A. Each becomes its own future effort:

- **Phase B**: Event-driven wake-ups (Pulse watchers, docket polling, automatic trigger on new filings)
- **Phase C**: Query mode — Lead Counsel Agent routing real-time Q&A to sub-agents
- **Phase D**: Synthesis cycles, Research Agent, Strategy Agent, Opposing Party Agent, autonomous escalation, partner inbox
- **Phase E**: Schedule/Deadlines Agent, Client Communications Agent, deadline tracking
- **Phase F**: Matter Dashboard knowledge graph visualization (interactive graph), audit trail, full team status panel
- Per-matter Postgres schemas (RLS + matter_id FK is sufficient for Phase A)
- Matter access controls (the `access_control` JSONB pattern used in DD Room could be added in Phase B)
- Matter closure / archival workflow
- Cross-matter analytics
- Conflict-of-interest checking
- Billing integration
- Voice/meeting ingestion
- **Entity relationship extraction** — the intention describes a knowledge graph with entities, events, AND relationships between entities. Relationships require cross-document co-reference analysis and are deferred to Phase B (when the Research Agent adds cross-document synthesis). Phase A extracts entities and timeline entries independently per document.
- **`decisions` and `communications` matter tables** — the intention lists these as part of the per-matter schema. They belong to Phase D (partner decisions after autonomous escalation) and Phase E (client communications agent) respectively.

---

## 7. Dependencies & Risks

### Dependencies
- **`LegalJobsWorkerService`** (existing) — must be extended to route two new job types
- **`LegalDocumentsStorageService`** (existing) — used as-is for file storage
- **`PostgresCheckpointerService`** (existing) — used as-is for agent checkpoint threads
- **`LegalJobsRepository`** (existing) — `insertQueued()` must handle `matterId` in `input.data`
- **LLM plane (`gemma4:e4b` via Ollama)** — all agent LLM calls use local model per the established pattern

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Long-context accumulation makes Facts Agent slow on matter with 50+ documents | Medium | Medium | `priorKnowledgeSummary` field caps the context carried forward; structured entity list (not prose) compresses efficiently |
| Entity deduplication: same person named differently across documents | Medium | Medium | `UNIQUE INDEX` on `(matter_id, entity_type, lower(name))` catches exact duplicates. Phase B adds fuzzy-match merge. |
| Two concurrent jobs per document upload creates worker contention | Low | Low | Sequential claim pattern in existing worker naturally serializes them; no deadlock risk |
| Ollama model forgets extraction format mid-document for long filings | Low | Medium | Structured JSON output with explicit schema in prompt; `record-verdict` pattern from Monte Carlo (parse failure → retry once with explicit schema reminder) |
| `matter_id` missing from observability events leaks matter data into shared traces | Low | High | `ExecutionContext.conversationId` is set to `matter-${matterId}` for all matter processing jobs; observability events are scoped by `conversationId` |

---

## 8. Phasing

### Phase 1: Database Schema + Matter CRUD API
**Objective**: Matters table, document index, entities, timeline — all schema. Full REST CRUD for matters. Document upload endpoint queues jobs (even though no workers handle them yet).

Steps:
- Migration `20260418000001_create_matter_tables.sql`
- `matter.types.ts`, `matter.repository.ts`, `matter.service.ts`, `matter.controller.ts`, `matter.module.ts`
- Add `MATTER_FACTS_INGEST_JOB_TYPE` + `MATTER_DOCS_INGEST_JOB_TYPE` to `legal-jobs.types.ts`
- Add `MatterModule` to `LegalDepartmentModule` imports
- Add `matter.controller.ts` to `LegalDepartmentModule` controllers
- Unit tests for repository and service

Gate: migration applied, lint clean, build clean, unit tests pass, curl tests confirm CRUD + upload endpoints respond.

### Phase 2: Facts Agent Graph
**Objective**: `FactsAgentService` processes a document and writes extracted entities and timeline entries to the DB. Worker routes `matter-facts-ingest` jobs to it.

Steps:
- `facts-agent.state.ts`, `facts-agent.graph.ts`, `facts-agent.service.ts`, `facts-agent.module.ts`, `facts-agent.types.ts`, `facts-agent.presentation.ts`
- Nodes: `start`, `extract-entities`, `extract-timeline`, `update-knowledge`, `complete`
- `extract-entities.node.ts`: LLM prompt → JSON array of `{ entityType, name, description, role }` → upsert `legal.matter_entities`
- `extract-timeline.node.ts`: LLM prompt → JSON array of `{ eventDateRaw, eventType, description, significance, partiesInvolved }` → insert `legal.matter_timeline`
- `update-knowledge.node.ts`: Updates `priorKnowledgeSummary` in state (condensed entity list for next run), marks `matter_documents.facts_processed = true`
- Wire `MATTER_FACTS_INGEST_JOB_TYPE` in `LegalJobsWorkerService.dispatchJob()`
- Integration test: upload a test document, verify entities and timeline entries in DB

Gate: integration test passes end-to-end against real Ollama; entities table populated correctly; `facts_processed` flag set; unit tests for all nodes.

### Phase 3: Documents Agent Graph
**Objective**: `DocumentsAgentService` classifies the document and updates `legal.matter_documents` with classification, summary, parties, key terms, document date.

Steps:
- `documents-agent.state.ts`, `documents-agent.graph.ts`, `documents-agent.service.ts`, `documents-agent.module.ts`, `documents-agent.types.ts`, `documents-agent.presentation.ts`
- Nodes: `start`, `classify-document`, `extract-metadata`, `update-index`, `complete`
- `classify-document.node.ts`: LLM prompt → `{ documentClass, documentDate, summary }` → update `matter_documents`
- `extract-metadata.node.ts`: LLM prompt → `{ parties, keyTerms, metadata }` → update `matter_documents`
- `update-index.node.ts`: Marks `matter_documents.docs_processed = true`
- Wire `MATTER_DOCS_INGEST_JOB_TYPE` in `LegalJobsWorkerService.dispatchJob()`
- Integration test: upload a test document, verify classification + metadata in `matter_documents`

Gate: integration test passes; `matter_documents` row has non-null `document_class` + `summary`; unit tests pass.

### Phase 4: Frontend — Matter List + Dashboard
**Objective**: `MatterListPage.vue` and `MatterDashboard.vue` with Case Overview + Documents tabs. Full upload flow including real-time processing status polling.

Steps:
- `MatterListPage.vue` with matter table + "New Matter" button
- `CreateMatterModal.vue` with form fields
- `MatterDashboard.vue` with two tabs
- `CaseOverviewTab.vue`: stats bar + entity list grouped by type
- `DocumentsTab.vue`: upload button + document list + polling for `facts_processed`/`docs_processed`
- Service methods in `legalJobsService.ts`
- Route added to `router/index.ts`
- Nav link added to `ForgeShellPage.vue`
- BriefModal wired (Benefits button → `BriefModal`)

Gate: dev server running; upload a document; both agent jobs complete; entities and classification appear in dashboard; lint + build:check clean; unit tests pass.

### Phase 5: Brief + Hardening
**Objective**: `brief.md` registered and surfaced. Input clamping, edge cases, type safety.

Steps:
- `workflows/persistent-case-team/brief.md` with Benefits, Features, When to use it, How it works sections
- Register in `BRIEF_PATHS` in `agent-registry.controller.ts` under key `persistent-case-team`
- Clamp document upload to max 50MB per file (configurable constant)
- Validate `matter_id` ownership (org_slug match) on every endpoint — verify this is tested
- Verify zero `any` types across all new files
- Verify no cross-matter data leakage: integration test creates two matters, uploads to each, confirms entities are isolated

Gate: `GET /agents/legal-department/brief/persistent-case-team` returns 200 with brief content; cross-matter isolation test passes; lint + build:check + all unit tests pass; PR ready.
