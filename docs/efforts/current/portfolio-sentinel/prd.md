# Portfolio Sentinel — Product Requirements Document

## 1. Overview

Portfolio Sentinel is an always-on legal monitoring system that watches external legal signals — regulatory changes, enforcement actions, case law updates, and legislative developments — and cross-references them against a firm's client portfolio to surface actionable alerts. It is the first Pulse-triggered, Forge-executed workflow: a cron-scheduled automation that runs without user initiation, bridging reactive analysis and proactive intelligence.

This effort adds four new tables to the `legal` schema, two new LangGraph workflows to the Legal Department workspace (`sentinel-ingest` and `sentinel-evaluate`), Pulse cron trigger configuration, and a Sentinel dashboard in the Forge Legal Department frontend.

## 2. Goals & Success Criteria

| Goal | Success Criterion |
|------|-------------------|
| Continuous signal ingestion | Pulse cron fires on schedule, Forge `sentinel-ingest` workflow fetches new content from RSS/HTML sources, deduplicates by content hash, classifies via LLM, and stores to `legal.sentinel_signals` |
| Portfolio cross-reference | `sentinel-evaluate` workflow queries portfolio RAG collection with each new signal, scores relevance/severity/urgency via LLM, and writes alerts to `legal.sentinel_alerts` |
| Actionable alert dashboard | Partners see a ranked alert feed filterable by client, severity, practice area, and status, with full drill-down (signal text, matched holding, LLM reasoning, recommended action) |
| Portfolio management | Attorneys can add/edit/deactivate client holdings in `legal.sentinel_portfolio` via the dashboard |
| Source configuration | Attorneys can add/edit/disable signal sources with polling intervals via the dashboard |
| Audit trail | Every alert records signal ID, portfolio ID, relevance score, reasoning, and recommended action; every ingestion run is traceable via observability events |
| Fail-loud monitoring | Source fetch errors surface in the dashboard with error details — no silent skips |

## 3. User Stories / Use Cases

**UC1 — Partner Morning Check**: A partner opens the Sentinel dashboard and sees "3 new alerts this week." Each alert shows the signal (e.g., "GDPR enforcement action against data processor"), the matched holding (e.g., "Client A — EU subsidiary, data processing operations"), the relevance score, and a recommended action ("Review Client A's DPA for compliance gaps"). The partner acknowledges or dismisses each alert.

**UC2 — Source Configuration**: A compliance team lead adds a new RSS feed from the SEC enforcement actions page. They set the practice area to "Securities" and jurisdiction to "US Federal," with an hourly poll interval. Signals start flowing on the next cron cycle.

**UC3 — Portfolio Onboarding**: A practice group manager adds their client portfolio holdings — each with client name, matter name, practice areas, jurisdictions, key entities, and a description. These are ingested into the `sentinel-portfolio-{orgSlug}` RAG collection for cross-reference matching.

**UC4 — Alert Triage**: An associate reviews the alert feed filtered by "critical" severity. For each alert, they see the full signal text, the matched portfolio holding, the LLM's reasoning chain, and can change status to "acknowledged" (noted), "dismissed" (not relevant), or "actioned" (follow-up initiated).

**UC5 — System-Triggered Automation**: A Pulse cron trigger fires at 6 AM daily. Pulse constructs a system-triggered ExecutionContext (`userId: NIL_UUID`, `agentType: 'system'`) and calls `POST /legal-department/jobs` with `jobType: 'sentinel-ingest'`. The Forge worker picks up the job and runs the ingestion workflow. After ingestion completes, a `sentinel-evaluate` job is enqueued automatically to cross-reference new signals against the portfolio.

## 4. Technical Requirements

### 4.1 Architecture

**Signal flow: Pulse triggers, Forge executes.**

```
Pulse cron trigger (configurable schedule per source)
    ↓
POST /legal-department/jobs { jobType: 'sentinel-ingest', source config }
    ↓
Forge LegalJobsWorker picks up → sentinel-ingest LangGraph workflow
    ↓ (on completion, enqueue)
POST /legal-department/jobs { jobType: 'sentinel-evaluate' }
    ↓
Forge LegalJobsWorker picks up → sentinel-evaluate LangGraph workflow
    ↓
Alerts written to legal.sentinel_alerts
    ↓
Dashboard reads and displays
```

Both workflows live in `apps/forge/api/src/agents/legal-department/workflows/sentinel/`. They follow the same patterns as the compliance audit workflow: `StateGraph` with `Annotation.Root()`, compiled with `PostgresCheckpointerService`, observability events throughout, and error routing.

**Pulse trigger configuration:**
- Source type: `cron`
- Action config: `{ agentSlug: 'legal-department', agentType: 'langgraph', jobType: 'sentinel-ingest' }`
- Routes to Forge (port 6200) via the existing `TriggerExecutorService.executeRemote()` path
- One trigger per source, each with its own cron expression and source ID in the payload

### 4.2 Data Model Changes

Four new tables in the `legal` schema. Migration file: `supabase/migrations/YYYYMMDD_create_sentinel_tables.sql`.

**Table: `legal.sentinel_sources`**
```sql
CREATE TABLE legal.sentinel_sources (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug              TEXT NOT NULL,
  name                  TEXT NOT NULL,
  source_type           TEXT NOT NULL CHECK (source_type IN ('rss', 'api', 'webpage')),
  url                   TEXT NOT NULL,
  poll_interval_minutes INT NOT NULL DEFAULT 60,
  practice_areas        TEXT[] DEFAULT '{}',
  jurisdictions         TEXT[] DEFAULT '{}',
  enabled               BOOLEAN DEFAULT true,
  last_polled_at        TIMESTAMPTZ,
  last_error            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sentinel_sources_org ON legal.sentinel_sources (org_slug);
CREATE INDEX idx_sentinel_sources_org_enabled ON legal.sentinel_sources (org_slug, enabled);
```

**Table: `legal.sentinel_signals`**
```sql
CREATE TABLE legal.sentinel_signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug          TEXT NOT NULL,
  source_id         UUID NOT NULL REFERENCES legal.sentinel_sources(id),
  title             TEXT NOT NULL,
  summary           TEXT,
  full_text         TEXT,
  url               TEXT,
  published_at      TIMESTAMPTZ,
  signal_type       TEXT CHECK (signal_type IN ('enforcement', 'ruling', 'legislation', 'guidance', 'news')),
  jurisdictions     TEXT[] DEFAULT '{}',
  practice_areas    TEXT[] DEFAULT '{}',
  content_hash      TEXT NOT NULL,
  processed         BOOLEAN DEFAULT false,
  ingested_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sentinel_signals_hash ON legal.sentinel_signals (org_slug, content_hash);
CREATE INDEX idx_sentinel_signals_org ON legal.sentinel_signals (org_slug);
CREATE INDEX idx_sentinel_signals_source ON legal.sentinel_signals (source_id);
CREATE INDEX idx_sentinel_signals_unprocessed ON legal.sentinel_signals (org_slug, processed) WHERE NOT processed;
```

**Table: `legal.sentinel_portfolio`**
```sql
CREATE TABLE legal.sentinel_portfolio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug        TEXT NOT NULL,
  client_name     TEXT NOT NULL,
  matter_name     TEXT,
  practice_areas  TEXT[] DEFAULT '{}',
  jurisdictions   TEXT[] DEFAULT '{}',
  key_entities    TEXT[] DEFAULT '{}',
  description     TEXT,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sentinel_portfolio_org ON legal.sentinel_portfolio (org_slug);
CREATE INDEX idx_sentinel_portfolio_org_active ON legal.sentinel_portfolio (org_slug, active);
```

**Table: `legal.sentinel_alerts`**
```sql
CREATE TABLE legal.sentinel_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug          TEXT NOT NULL,
  signal_id         UUID NOT NULL REFERENCES legal.sentinel_signals(id),
  portfolio_id      UUID NOT NULL REFERENCES legal.sentinel_portfolio(id),
  relevance_score   INT NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  severity          TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  urgency           TEXT NOT NULL CHECK (urgency IN ('immediate', 'this_week', 'informational')),
  summary           TEXT NOT NULL,
  reasoning         TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'dismissed', 'actioned')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_by   TEXT,
  acknowledged_at   TIMESTAMPTZ
);

CREATE INDEX idx_sentinel_alerts_org ON legal.sentinel_alerts (org_slug);
CREATE INDEX idx_sentinel_alerts_org_status ON legal.sentinel_alerts (org_slug, status);
CREATE INDEX idx_sentinel_alerts_signal ON legal.sentinel_alerts (signal_id);
CREATE INDEX idx_sentinel_alerts_portfolio ON legal.sentinel_alerts (portfolio_id);
```

### 4.3 API Changes

All sentinel API endpoints live within the existing Legal Department controller structure. No new NestJS modules — sentinel is a new workflow within the Legal Department capability.

**Job enqueue (existing endpoint, new jobType):**
- `POST /legal-department/jobs` with `jobType: 'sentinel-ingest'` or `jobType: 'sentinel-evaluate'`
- Uses the existing `LegalJobsWorkerService` polling and dispatch mechanism
- New job type constants: `SENTINEL_INGEST_JOB_TYPE = 'sentinel-ingest'`, `SENTINEL_EVALUATE_JOB_TYPE = 'sentinel-evaluate'`

**New REST endpoints (SentinelController):**

Sources CRUD:
- `GET /legal-department/sentinel/sources` — list sources for org
- `POST /legal-department/sentinel/sources` — create source
- `PATCH /legal-department/sentinel/sources/:id` — update source
- `DELETE /legal-department/sentinel/sources/:id` — delete source

Portfolio CRUD:
- `GET /legal-department/sentinel/portfolio` — list holdings for org
- `POST /legal-department/sentinel/portfolio` — create holding
- `PATCH /legal-department/sentinel/portfolio/:id` — update holding
- `DELETE /legal-department/sentinel/portfolio/:id` — deactivate holding (soft delete via `active = false`)

Signals (read-only):
- `GET /legal-department/sentinel/signals` — list signals, filterable by source, type, date range

Alerts:
- `GET /legal-department/sentinel/alerts` — list alerts, filterable by client, severity, status, date range
- `GET /legal-department/sentinel/alerts/:id` — alert detail with signal text, portfolio holding, reasoning
- `PATCH /legal-department/sentinel/alerts/:id/status` — update status (acknowledge, dismiss, action)

All endpoints use JwtAuthGuard + RbacGuard. ExecutionContext passed in request body for job enqueue, extracted from JWT for CRUD.

### 4.4 Frontend Changes

New pages and components in `apps/forge/web/src/views/agents/legal-department/`.

**New page: `PortfolioSentinelPage.vue`**
- Registered in the Legal Department workspace router
- Tab-based layout: Alerts | Signals | Portfolio | Sources

**Alerts tab:**
- Chronological alert feed (newest first) with IonCard list
- Filter bar: client (dropdown from portfolio), severity (multi-select), urgency (multi-select), status (multi-select), date range
- Each alert card shows: severity badge, client name, signal title, relevance score bar, summary, timestamp
- Click to expand: full signal text, matched portfolio holding details, LLM reasoning, recommended action, status controls (Acknowledge / Dismiss / Action buttons)
- Badge count of "new" alerts in the tab header

**Signals tab:**
- Chronological signal feed with source attribution
- Filter bar: source, signal type, jurisdiction, practice area, date range
- Each signal card shows: type badge, title, summary, source name, published date, ingestion date
- Click to expand: full text, URL link, jurisdictions, practice areas
- Error banner if any source has `last_error` set

**Portfolio tab:**
- Card list of client holdings (active first)
- Create/edit modal: client name, matter name, practice areas (multi-select), jurisdictions (multi-select), key entities (tag input), description (textarea)
- Deactivate toggle (soft delete)
- Active/inactive filter

**Sources tab:**
- Card list of configured sources
- Create/edit modal: name, source type (RSS/API/Webpage), URL, poll interval (dropdown: 15m/30m/1h/4h/12h/24h), practice areas (multi-select), jurisdictions (multi-select)
- Enable/disable toggle
- Status indicator: last polled timestamp, error state if `last_error` set
- "Poll Now" button (manual trigger via existing `POST /triggers/:id/run` or direct job enqueue)

**Service: `sentinelService.ts`**
- HTTP client to `/legal-department/sentinel/*` endpoints
- Typed request/response interfaces
- Uses existing `forgeApiClient` pattern from `legalJobsService.ts`

### 4.5 Infrastructure Requirements

**RAG Collections (two per org):**
- `sentinel-signals-{orgSlug}` — ingested signal text for cross-reference queries
- `sentinel-portfolio-{orgSlug}` — portfolio holding descriptions for semantic matching

Both use the existing `WorkflowRagService` and `RAG_STORAGE_SERVICE` from `@orchestratorai/planes/rag`. Ingestion follows the same pattern as compliance audit document ingestion — chunked text with metadata.

**LLM usage:**
- Signal classification (type, jurisdictions, practice areas): local Ollama model per project convention
- Alert scoring (relevance, severity, urgency, reasoning, recommended action): local Ollama model per project convention
- Both use `LLMHttpClientService` via `callLLMMaybeWithReasoning()` helper

**Observability:**
- All workflow nodes emit progress events via `ObservabilityService`
- Ingestion runs trackable via `conversationId` in observability events
- Source fetch errors logged via `observability.emitFailed()`

## 5. Non-Functional Requirements

**Performance:**
- Signal ingestion should process a single source in under 60 seconds (RSS parse + LLM classification of ~20 items)
- Portfolio cross-reference should evaluate a single signal against up to 200 portfolio holdings in under 120 seconds
- Dashboard alert list should load in under 2 seconds for up to 1,000 alerts

**Reliability:**
- Source fetch failures must be recorded in `sentinel_sources.last_error` and surfaced in the dashboard — no silent failures
- Content hash deduplication prevents duplicate signals across runs
- Job queue ensures at-most-once processing via `FOR UPDATE SKIP LOCKED`

**Security:**
- All data is org-scoped via `org_slug` on every table
- Dashboard endpoints protected by JwtAuthGuard + RbacGuard
- System-triggered jobs use `userId: NIL_UUID` to distinguish from user-initiated actions

## 6. Out of Scope

- **Real-time streaming**: Poll-based only. Hourly or daily polling is sufficient for legal signals.
- **Automated client notifications**: Alerts surface to firm attorneys only. No external emails or client-facing communication.
- **Document generation from alerts**: No auto-generated memos or briefs. Future extension: alert → research workflow → memo.
- **Custom source parsers**: V1 supports RSS and basic HTML extraction. Custom API integrations (Westlaw, LexisNexis, PACER) are future.
- **Alert ML training**: No feedback loop to improve scoring. V1 uses per-alert LLM scoring. ML-based relevance tuning is future.
- **HITL approval for alerts**: Unlike compliance audit, alert generation does not pause for human review. Alerts are generated and triaged post-hoc. HITL patterns can be added later if firms want pre-publication review.

## 7. Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| RSS/HTML fetch fails due to site changes | Medium | `last_error` field surfaces failures in dashboard; fail-loud design means broken sources are visible immediately |
| LLM classification quality on local models | Medium | Classification prompt tuning during implementation; fields are human-reviewable in signal detail view |
| RAG relevance threshold too low/high | Medium | Configurable threshold in workflow state; tunable without code changes via source/portfolio metadata |
| Large portfolio (200+ holdings) × many signals = slow evaluation | Low | Evaluate only unprocessed signals (`processed = false`); sequential evaluation with progress tracking |
| Pulse → Forge A2A call fails | Low | Trigger execution table records failure with error; manual retry via "Poll Now" button or `POST /triggers/:id/run` |

**Dependencies:**
- Working Pulse cron adapter (exists, proven with existing triggers)
- Working Forge job queue (exists, proven with 7 other job types)
- Working RAG infrastructure (`WorkflowRagService`, `RAG_STORAGE_SERVICE`) — exists, proven with compliance audit
- Working `LLMHttpClientService` with local Ollama — exists, proven with all Legal Department workflows

## 8. Phasing

### Phase 1 — Data Model & Source CRUD
- Create migration with all four sentinel tables
- Implement `SentinelRepository` for CRUD operations on all tables
- Implement `SentinelController` with source CRUD endpoints (GET/POST/PATCH/DELETE)
- Frontend Sources tab with create/edit/disable UI
- **Gate**: Sources can be created, listed, updated, and disabled via API and UI

### Phase 2 — Signal Ingestion Workflow
- Implement `sentinel-ingest` LangGraph workflow:
  - `fetch_source` node: RSS parse / HTML extract from source URL
  - `deduplicate` node: content hash check against `legal.sentinel_signals`
  - `classify` node: LLM classification (type, jurisdictions, practice areas)
  - `store` node: write signals + ingest into `sentinel-signals-{orgSlug}` RAG collection
  - `update_source` node: update `last_polled_at` (or `last_error` on failure)
- Register `SENTINEL_INGEST_JOB_TYPE` in legal jobs types and service dispatch
- Frontend Signals tab (read-only feed)
- **Gate**: Manual job enqueue via `POST /legal-department/jobs` with `jobType: 'sentinel-ingest'` fetches, deduplicates, classifies, and stores signals

### Phase 3 — Portfolio Management & RAG
- Implement portfolio CRUD endpoints (GET/POST/PATCH/DELETE)
- On portfolio create/update: ingest holding description into `sentinel-portfolio-{orgSlug}` RAG collection
- On portfolio deactivate: remove from RAG collection
- Frontend Portfolio tab with create/edit/deactivate UI
- **Gate**: Portfolio holdings can be managed via API and UI; holdings are searchable in RAG collection

### Phase 4 — Alert Evaluation Workflow
- Implement `sentinel-evaluate` LangGraph workflow:
  - `load_unprocessed` node: query unprocessed signals from `legal.sentinel_signals`
  - `evaluate_loop` / `evaluate_signal` nodes: for each signal, query portfolio RAG, score matches via LLM, write alerts
  - `mark_processed` node: flip `processed = true` on evaluated signals
  - Pattern: reuse compliance audit's `cross_reference_loop` / `evaluate_finding` queue pattern
- Auto-enqueue `sentinel-evaluate` job after `sentinel-ingest` completes
- Register `SENTINEL_EVALUATE_JOB_TYPE` in legal jobs types and service dispatch
- Frontend Alerts tab with filter, expand, and status controls
- **Gate**: End-to-end: ingest signals → evaluate against portfolio → alerts appear in dashboard with reasoning

### Phase 5 — Pulse Cron Integration
- Create Pulse cron triggers for each enabled source (one trigger per source)
- Trigger `action_config`: `{ agentSlug: 'legal-department', agentType: 'langgraph', jobType: 'sentinel-ingest', payload: { sourceId } }`
- Source create/update/disable syncs trigger state in Pulse (via A2A call or direct DB)
- "Poll Now" button in Sources tab fires manual trigger
- **Gate**: Cron triggers fire on schedule → ingestion runs → evaluation runs → alerts generated without human initiation
