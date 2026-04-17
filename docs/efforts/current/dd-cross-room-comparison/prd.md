# DD Room: Cross-Room Comparison — Product Requirements Document

## 1. Overview

Cross-room comparison turns the DD Room from a per-deal tool into a deal-pipeline tool. A partner selects 2–10 completed DD rooms and gets a unified read-only dashboard comparing risk profiles, financial findings, deal-breaker flags, and document coverage — answering "which deal is cleanest, which has blockers, where are the gaps?" in one view.

This is the capstone of the DD Room extension set. After this ships, a firm running concurrent deals can create rooms (with access controls), analyze documents (with incremental updates), generate deal memos, run financial analysis, and compare across the portfolio.

## 2. Goals & Success Criteria

| Goal | Success Criterion |
|------|-------------------|
| Risk triage at a glance | A 7-category heat map across N rooms renders in under 2s, showing finding counts colored by severity |
| Financial benchmarking | Side-by-side specialist metrics (cap-table, working-capital, debt-schedule, revenue-concentration) across rooms |
| Coverage gap identification | Per-room document counts (analyzed/failed/pending/missing) with visual distribution |
| Deal-breaker dashboard | Flat list of all deal-breaker flags across compared rooms, grouped by room, sortable by category |
| Pipeline velocity | Per-room status, progress percentage, and timestamps visible in comparison |
| Export | Markdown comparison report downloadable as artifact |
| Access control enforcement | User cannot see any data from rooms they lack access to — fail-closed |
| No new data model | Zero new tables, columns, or schemas |
| Read-only | Zero graph mutations, zero LLM calls, zero new data generation |

## 3. User Stories

1. **Managing partner before pipeline meeting**: Selects 4 active DD rooms, sees the risk heat map, identifies that Target C has 3 critical deal-breakers while A and B are clean, drills into the deal-breaker list, exports the comparison for the Monday deck.

2. **Associate triaging workload**: Compares 3 rooms to find that Room 2 is missing audit letters and board decks (coverage gap), while Rooms 1 and 3 are fully analyzed — reallocates document collection effort to Room 2.

3. **PE analyst evaluating bolt-on acquisitions**: Compares financial summaries across 5 targets — leverage ratios, revenue concentration, working-capital positions side-by-side — to rank acquisition attractiveness without flipping between rooms.

4. **Partner with restricted access**: Attempts to compare 3 rooms but only has access to 2. The endpoint returns a 404 error without revealing the existence of the restricted room. The comparison does not proceed with partial data.

## 4. Technical Requirements

### 4.1 Architecture

This feature adds:
- **One new backend endpoint** on the existing `LegalJobsController`
- **One new frontend route** under the legal department workspace
- **New Vue components** for the comparison dashboard, composing existing components where possible

No new NestJS modules, no new services beyond methods on the existing `LegalJobsService`, no new database schemas.

### 4.2 Data Model Changes

**None.** All data is read from:
- `legal.agent_jobs` rows (job metadata, status, deal context, access control)
- LangGraph checkpoints via `graph.getState()` (risk matrix, findings, document index, financial outputs)

### 4.3 API Changes

#### New Endpoint: `POST /legal-department/jobs/compare`

**Request:**
```typescript
{
  context: ExecutionContext;  // passed whole, per project rules
  jobIds: string[];          // 2–10 DD room job IDs
}
```

**Validation:**
1. `jobIds` length must be 2–10. Return 400 if not.
2. Each job must exist, belong to the caller's org (`org_slug` match), and have `jobType = 'due-diligence'`. If any job doesn't exist or isn't a DD room, return 404.
3. Each job must pass `isAccessAllowed(row, callerUserId, isAdmin)` — uses the existing access control function from `legal-jobs.repository.ts`. If any room is inaccessible, return 404 for that room (fail-closed, no partial comparison, no information leakage).

**Processing:**
1. Resolve access via existing `resolveAccess()` (calls `AdminLookupService.isOrgAdmin`).
2. Load all job rows from `legal.agent_jobs` via `findByIdForOrg()` (which already enforces org filtering).
3. Check `isAccessAllowed()` for each row.
4. Load graph state checkpoints in parallel via `graph.getState({ configurable: { thread_id: conversationId } })` for each room.
5. Extract and normalize comparison data from each checkpoint.
6. Return `ComparisonResult`.

**Response:**
```typescript
interface ComparisonResult {
  rooms: Array<{
    jobId: string;
    targetCompany: string;
    transactionType: string;
    dealValueRange?: string;
    jurisdictions: string[];
    status: JobStatus;
    progress: number;
    documentCount: number;
    analyzedCount: number;
    missingDocumentCount: number;
    dealBreakerCount: number;
    riskSummary: {
      byCategory: Record<RiskCategory, {
        critical: number;
        high: number;
        medium: number;
        low: number;
      }>;
      totalBySeverity: {
        critical: number;
        high: number;
        medium: number;
        low: number;
      };
    };
    financialSummary: Record<string, {
      specialistKey: string;
      overallRisk: Severity;
      keyMetrics: Array<{ label: string; value: string | number }>;
      findingCount: number;
    }>;
    completedAt: string | null;
  }>;
  dealBreakers: Array<{
    jobId: string;
    targetCompany: string;
    finding: string;
    category: string;
    reasoning: string;
    recommendation: string;
  }>;
  missingDocuments: Array<{
    jobId: string;
    targetCompany: string;
    description: string;
    importance: Severity;
  }>;
}
```

**Why POST, not GET:** The request carries `ExecutionContext` (per project rules — context flows from frontend, passed whole) and a variable-length `jobIds` array that may exceed query-string limits. Matches the existing invoke-style convention.

**Error responses:**
- 400: `jobIds` empty, length < 2 or > 10, or not an array
- 404: Any job not found, not a DD room, or inaccessible to caller (fail-closed — no distinction between "doesn't exist" and "no access")

### 4.4 Frontend Changes

#### New Route

```
/agents/legal-department/compare → CrossRoomComparisonPage.vue
```

Added to the existing legal department router group in `apps/forge/web/src/router/index.ts`.

#### Room Selector (entry point)

Located on the `DueDiligenceRoomPage.vue` or as the initial state of `CrossRoomComparisonPage.vue`:

- Multi-select interface listing DD rooms the user has access to
- Source: existing `GET /legal-department/jobs?orgSlug=...&callerUserId=...&jobType=due-diligence` endpoint
- Each room shows: target company name, status badge, document count, creation date
- Selection limited to 2–10 rooms
- "Compare" button triggers `POST /legal-department/jobs/compare`
- Add a "Compare Rooms" button to `DueDiligenceRoomPage.vue` that navigates to the comparison route

#### Comparison Dashboard (4 panels)

**Panel 1: Risk Heat Map**
- Table layout: rooms as columns, 7 risk categories (`contractual`, `ip`, `employment`, `regulatory`, `financial`, `corporate`, `environmental`) as rows
- Each cell: finding count, background colored by highest severity in that cell (critical=red, high=orange, medium=yellow, low=green, zero=neutral)
- Header row: room name (target company) + deal-breaker badge count
- Footer row: total findings per severity per room
- Clicking a cell could expand to show findings (stretch — not required for initial ship)

**Panel 2: Deal-Breaker Summary**
- Flat list of all `dealBreakers` from the comparison result
- Grouped by room (target company)
- Each entry: finding text, category badge, recommendation
- Sortable by category or room
- Visual indicator for rooms with zero deal-breakers (green checkmark)

**Panel 3: Financial Comparison**
- Table: rooms as columns, financial specialist metrics as rows
- Rows grouped by specialist: cap-table (total authorized shares, option pool %), working-capital (current ratio, cash position), debt-schedule (total obligations, nearest maturity), revenue-concentration (top-customer %)
- Values from `financialSummary[specialistKey].keyMetrics`
- Color-code cells by `overallRisk` severity
- Empty cells for rooms that lack a particular specialist output (no fallbacks — show "N/A" text)

**Panel 4: Coverage & Status**
- Per-room card or row: document count, analyzed/failed/pending/missing breakdown
- Stacked bar chart using Chart.js (already at `^4.5.0` in forge-web `package.json`) showing document status distribution per room
- Highlight rooms with critical missing documents (red indicator)
- Show job status, progress %, and completed-at timestamp per room

#### Export Button

"Export Comparison" button generates a markdown report:
- Structured sections for each of the 4 panels
- Uses existing artifact pattern (markdown stored to media storage, downloadable)
- Reuses the same export mechanism as deal memos (`MEDIA_STORAGE_PROVIDER` upload + download endpoint)

#### New Components

| Component | Purpose |
|-----------|---------|
| `CrossRoomComparisonPage.vue` | Page shell with room selector + dashboard |
| `ComparisonRiskHeatMap.vue` | Multi-room risk heat map table |
| `ComparisonDealBreakers.vue` | Cross-room deal-breaker list |
| `ComparisonFinancials.vue` | Side-by-side financial metrics |
| `ComparisonCoverage.vue` | Document coverage + Chart.js bar chart |

#### Service Changes

Add to `legalJobsService.ts`:
```typescript
async compareRooms(orgSlug: string, jobIds: string[]): Promise<ComparisonResult>
```

### 4.5 Infrastructure Requirements

**None.** No new dependencies, no new database objects, no new services. Chart.js is already installed.

## 5. Non-Functional Requirements

### Performance
- Target: <2s response time for a 5-room comparison
- Graph state checkpoints loaded in parallel (Promise.all)
- If 10-room comparisons exceed 2s due to checkpointer latency, add a `comparison_cache` field to the `agent_jobs` result column populated at synthesis time — but only if measured latency justifies it (do not pre-optimize)

### Security
- Access control is fail-closed: if the caller lacks access to any requested room, the entire comparison fails with 404
- No information leakage: inaccessible rooms return the same 404 as non-existent rooms
- ExecutionContext flows from frontend, passed whole, never constructed in backend
- JWT + RBAC guards on the new endpoint (same as all existing legal department endpoints)

### Scalability
- 2–10 rooms per comparison is the hard limit; no need to optimize for larger sets
- No database writes, no LLM calls — the endpoint is a pure read aggregation

### Compatibility
- Rooms at any `DDStatus` can be included in a comparison — incomplete rooms show partial data (whatever is in the checkpoint)
- Rooms with no financial specialists, no risk matrix, or no documents are valid — they show empty/zero values in the comparison

## 6. Out of Scope

- **LLM-generated comparison narrative**: The dashboard shows structured data only. No LLM call to "summarize the comparison." The data tells the story.
- **Historical trending**: No time-series ("how has this room's risk evolved over three uploads"). Each comparison is a point-in-time snapshot.
- **Cross-org comparison**: Rooms from different orgs cannot be compared. Same org only.
- **Auto-refresh / live updates**: The comparison is a one-shot request. User re-runs to get updated data.
- **Comparison persistence**: Comparisons are not saved. No "saved comparisons" table.
- **Cell drill-down**: Clicking a heat map cell to expand findings is a nice-to-have, not required for initial ship.
- **Deal memo comparison**: Comparing deal memos across rooms is not in scope.

## 7. Dependencies & Risks

### Dependencies
- Existing `isAccessAllowed()` function in `legal-jobs.repository.ts` — relied upon for access enforcement
- LangGraph checkpointer — each comparison loads N graph states; checkpoint read performance is the critical path
- Existing DD room data quality — comparison is only as good as the underlying synthesis. Incomplete rooms show incomplete data.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Checkpoint reads for 10 rooms may exceed 2s | Slow comparison UX | Load in parallel; measure real latency; add caching only if needed |
| Financial specialist output varies by document type | Missing metrics in comparison cells | Show "N/A" for missing data; don't fabricate or fall back |
| Rooms at different stages of completion compared | Confusing partial data | Show status badge + progress clearly; label incomplete rooms |
| Large graph states may carry significant payload | Memory pressure on backend | Extract only comparison-relevant fields; don't return full state |

## 8. Phasing

### Phase 1: Backend Comparison Endpoint

**Scope:** Add `POST /legal-department/jobs/compare` to the existing controller, with full validation, access control, parallel checkpoint loading, and data normalization.

**Deliverables:**
- New method on `LegalJobsService` for comparison logic
- New controller route with JWT + RBAC guards
- `ComparisonResult` type definition (in the existing types file)
- Extraction logic for risk summary, financial summary, coverage, and deal-breaker aggregation from graph state
- Access control enforcement: all-or-nothing, fail-closed

**Validation gate:** `curl` the endpoint with 2+ real DD room IDs and verify the response shape matches `ComparisonResult`. Verify 404 when an inaccessible room is included.

### Phase 2: Frontend — Room Selector + Route

**Scope:** Add the comparison route, page shell, and room selector interface.

**Deliverables:**
- `CrossRoomComparisonPage.vue` with room multi-select
- Route added to `router/index.ts` under legal department group
- "Compare Rooms" navigation button on `DueDiligenceRoomPage.vue`
- `compareRooms()` method on `legalJobsService.ts`
- Loading state while comparison endpoint processes

**Validation gate:** Navigate to comparison page, select 2+ rooms, trigger comparison, verify API call succeeds and raw data is received.

### Phase 3: Frontend — Comparison Dashboard Panels

**Scope:** Build the four comparison panels that display the ComparisonResult data.

**Deliverables:**
- `ComparisonRiskHeatMap.vue` — risk heat map table with severity coloring and deal-breaker badges
- `ComparisonDealBreakers.vue` — grouped deal-breaker list with sorting
- `ComparisonFinancials.vue` — side-by-side financial metrics table with risk coloring
- `ComparisonCoverage.vue` — document coverage breakdown with Chart.js stacked bar chart + status/progress display

**Validation gate:** Compare 3+ rooms in the browser. Verify all 4 panels render correctly with real data. Verify rooms with missing financial data show "N/A" rather than errors.

### Phase 4: Export + Polish

**Scope:** Markdown export and UX polish.

**Deliverables:**
- "Export Comparison" button generating markdown covering all 4 panels
- Markdown uploaded to media storage via `MEDIA_STORAGE_PROVIDER`, downloadable as artifact
- Empty state handling (no rooms selected, all rooms incomplete, no deal-breakers)
- Responsive layout for varying room counts (2 vs 10 columns)

**Validation gate:** Export comparison of 3+ rooms, download the markdown, verify it contains risk heat map, deal-breakers, financials, and coverage data in readable format.
