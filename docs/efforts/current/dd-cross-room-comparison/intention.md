# DD Room: Cross-Room Comparison

## What

A read-only analytics dashboard that compares risk profiles, financial findings, deal-breaker flags, and document coverage across multiple completed DD rooms. A partner selects 2–N rooms and gets a unified view that answers: "which deal is cleanest, which has blockers, where are the gaps, and how do the financials stack up?"

This is the capstone of the DD Room extension set. After this ships, the DD Room is feature-complete for a firm running concurrent deals — they can create rooms (with access controls), analyze documents (with incremental updates), generate deal memos, run financial analysis, and now compare across the portfolio.

## Why

A firm doing three acquisitions simultaneously needs a way to triage. Today each DD room is an isolated silo — the partner has to open each one, mentally cross-reference the risk matrices, and manually compare cap-table structures. That doesn't scale past two deals.

Cross-room comparison turns the DD Room from a per-deal tool into a deal-pipeline tool. Specific value:

1. **Risk triage**: A 7-category heat map across N rooms shows at a glance which deal has the highest regulatory exposure, which one has clean IP, and which has critical deal-breakers. The partner allocates associate time accordingly.

2. **Financial benchmarking**: Side-by-side cap-table structures, working-capital positions, and debt covenants across targets. A PE firm evaluating three bolt-on acquisitions can compare leverage ratios and revenue concentration in one view rather than flipping between three rooms.

3. **Coverage gaps**: One room analyzed 47 documents including all financial statements; another has 12 documents and is missing audit letters and board decks. The comparison flags which rooms need more documents before the deal team can rely on them.

4. **Deal-breaker dashboard**: Across all active rooms, surface every deal-breaker flag with its category, the room it belongs to, and the recommendation. This is the view the managing partner wants before a Monday pipeline meeting.

5. **Velocity and completeness**: Which rooms are fully synthesized, which are still processing, which have pending HITL reviews? Pipeline status at a glance.

Without this, the DD Room is a powerful single-deal tool but doesn't serve the firm-level view that justifies enterprise adoption.

## Shape

### Data Model — No New Tables

This is purely a read operation across existing `legal.agent_jobs` rows and their LangGraph checkpoint state. No new schemas, no new tables, no new columns. The dashboard reads from:

- `legal.agent_jobs` rows where `input.metadata.jobType = 'due-diligence'` — the room list, filtered by org + access controls
- Each room's LangGraph checkpoint (via `graph.getState({ configurable: { thread_id: conversationId } })`) — the source of `riskMatrix`, `dealBreakerFlags`, `perCategoryAnalysis`, `runningFindings`, `perDocumentOutputs`, `missingDocuments`, `documentIndex`, `report`
- `input.data.dealContext` on each job row — `transactionType`, `targetCompany`, `buyerCompany`, `dealValueRange`, `jurisdictions`

### Backend — One New Endpoint

**`POST /legal-department/jobs/compare`**

Body: `{ context: ExecutionContext, jobIds: string[] }` (2–10 room IDs).

The endpoint:
1. Validates each jobId exists, belongs to the caller's org, is a DD room (`jobType = 'due-diligence'`), and the caller has access (respects `access_control` allow-list — a user comparing rooms must have access to all of them; if any room is inaccessible, return 404 for that room without revealing it to the caller).
2. Loads each room's graph state checkpoint in parallel.
3. Extracts and normalizes the comparison data:
   - **Risk summary** per room: total findings by severity, per-category breakdown, deal-breaker count.
   - **Financial summary** per room: per-specialist key metric extraction (e.g., cap-table total shares, working-capital ratio, debt-schedule total obligations) — these are the `tabular.rows` from the financial specialists' `SpecialistOutput`.
   - **Coverage summary** per room: total documents, analyzed count, failed count, pending count, missing-documents list.
   - **Deal context** per room: target company, transaction type, deal value range, jurisdictions.
   - **Status** per room: job status, progress, queued/started/completed timestamps.
4. Returns a `ComparisonResult` with the normalized data. Does NOT return the full graph state — only the aggregated comparison payload.

Response shape:
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
      byCategory: Record<RiskCategory, { critical: number; high: number; medium: number; low: number }>;
      totalBySeverity: { critical: number; high: number; medium: number; low: number };
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

Why a POST and not a GET: the `jobIds` array can be long and the request carries `ExecutionContext`. Matching the existing invoke-style convention.

### Frontend — New Tab/Page in Legal Department

**Room Selector**

A multi-select interface where the user picks which DD rooms to compare. Source: `GET /legal-department/jobs?orgSlug=...&callerUserId=...&jobType=due-diligence`. Show room name (targetCompany), status, document count, and creation date. Allow 2–10 selections. "Compare" button triggers the POST.

**Comparison Dashboard** (new page or modal, routed from the legal-department landing)

Four panels:

1. **Risk Heat Map** — A table with rooms as columns and risk categories as rows. Each cell shows finding count colored by highest severity (critical=red, high=orange, medium=yellow, low=green). Deal-breaker flags shown as a badge count per room in the header row. This is the "at a glance" view.

2. **Deal-Breaker Summary** — A flat list of all deal-breaker flags across all compared rooms, grouped by room. Each entry shows: room (target company), finding text, category, recommendation. Sortable by category or room.

3. **Financial Comparison** — A table with rooms as columns and financial specialist metrics as rows. Cap-table: total authorized shares, option pool %. Working capital: current ratio, cash position. Debt schedule: total obligations, nearest maturity. Revenue concentration: top-customer %. Cells show the extracted numeric values; color-code risk levels.

4. **Coverage & Status** — Per-room: document count, analyzed/failed/pending/missing breakdown. Bar chart or stacked bar showing document status distribution. Highlights rooms that are incomplete or have critical missing documents.

**Export**: "Export Comparison" button generates a markdown report summarizing the comparison across all four dimensions. Uses the same artifact pattern as deal memos (markdown stored to storage, downloadable).

### Out of Scope

- **LLM-generated comparison narrative**: The dashboard shows structured data. No LLM call to "summarize the comparison" — that's a future enhancement if users want it. The data itself tells the story.
- **Historical trending**: No time-series ("how has this room's risk evolved over three uploads"). Each comparison is a point-in-time snapshot.
- **Cross-org comparison**: Rooms from different orgs cannot be compared. Same org only, same access-control posture.
- **Auto-refresh / live updates**: The comparison is a one-shot request. If a room changes while the user is viewing, they re-run the comparison.
- **Comparison persistence**: Comparisons are not saved. The user picks rooms and gets a result. No "saved comparisons" table.

## Constraints

- **Access controls respected**: The comparison endpoint MUST enforce per-room access controls. A user who can't see room B must not see room B's data in a comparison that includes room B. The endpoint checks each room individually and excludes inaccessible rooms (or returns 404 if the user lacks access to any requested room — fail-closed, don't partially compare).
- **Read-only**: No graph mutations, no new LLM calls, no new data generation. This feature reads existing checkpoint state.
- **Performance**: Loading N graph states in parallel from the LangGraph checkpointer. For N=10, this is 10 parallel checkpoint reads. Target: <2s response time for a 5-room comparison. If the checkpointer is slow, consider caching the comparison-relevant fields on the `agent_jobs` row (as a `result` sub-object) at synthesis time — but only if measured latency justifies it.
- **Reuses existing components**: The risk matrix rendering, financial findings tables, and document index viewers already exist. The comparison dashboard should compose from these rather than rebuilding them. New components are only for the multi-room layout (side-by-side grid, heat map).
- **No new dependencies**: No chart libraries beyond what's already in the project. Use CSS grid/flexbox + Ionic components for the heat map. If `chart.js` (already a dependency in forge-web) is useful for the coverage bar chart, use it.
