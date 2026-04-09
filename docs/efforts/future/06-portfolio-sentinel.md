# Intention: Always-On Portfolio Sentinel

## Priority: #6 of 10 Legal Workflows

## What

A sovereign, always-on monitoring system that watches the outside world for legal signals — regulatory changes, court decisions, agency actions, legislative updates, enforcement actions — and cross-references them against a client's entire legal portfolio (contracts, policies, filings, employment agreements) in real time. When a signal matches something in the portfolio, a specialist team is dispatched to produce an impact memo and a proposed action before the human General Counsel has had their morning coffee.

This is the flagship "sovereignty" workflow — the whole thing runs on the customer's own Mac Studio (or cluster), ingesting the customer's own privileged documents, and never sends anything to a third party. It's the first workflow that integrates **Pulse** (event-driven watchers) with **Forge** (specialist analysis), proving the platform thesis that these products compose.

The user configures the Sentinel from the Legal Department workspace: upload the portfolio, select which regulatory domains to monitor, set alert thresholds, and activate. From that point forward, the Sentinel runs autonomously — the GC inbox in the workspace shows impact memos whenever something relevant is detected.

## Why

### The problem it solves

In-house legal teams miss 60-80% of applicable regulatory changes (ACC surveys). The reason: monitoring is manual, reactive, and dependent on individual lawyers remembering to check specific sources. A GC managing a portfolio of 2,000 contracts across 50 states and 10 federal agencies cannot humanly track every relevant change. By the time a relevant change is noticed — often when opposing counsel cites it, or when an auditor flags it — the response window has closed.

### Why it was impossible before

- Required **persistent long-running agents** (watchers) that run for months — only tractable with durable checkpointed state (LangGraph + our observability plane).
- Required **cross-referencing a streaming signal against a large static corpus** with specialist reasoning, not just keyword search.
- Required **event-driven specialist dispatch** — Pulse's watcher pattern is purpose-built for this.
- Required **sovereign deployment** — in-house legal teams will not ingest 12,000 privileged contracts into third-party SaaS.

### The economic unlock

- Human equivalent: $500K-$2M/yr per GC office to monitor 50 states + 10 agencies.
- Sentinel: $2K-$10K/mo subscription, runs on one Mac Studio.
- Every miss caught is a prevented liability, often 10-100x the annual subscription cost.
- This is the only workflow that produces **recurring subscription revenue** instead of per-project fees.

### The platform thesis

Sentinel ties three products together: Pulse (event-driven watchers), Forge/Legal Department (specialist analysis), and the observability plane (audit trail). This is the workflow that proves the platform architecture isn't just clean engineering — it's a business advantage. No SaaS-only architecture (Harvey, Hebbia, Ironclad) can match this because they can't run persistent watchers on customer hardware processing privileged documents.

## The shape of the thing

### Architecture overview

```
Pulse Watchers → Signal Queue → Triage Agent → Legal Department Specialists → Impact Memo → HITL Gate → GC Inbox
       ↓                                              ↑
  External Sources                              Portfolio Index
  (Federal Register,                            (client contracts,
   PACER, state feeds,                           policies, agreements)
   agency RSS, news)
```

### Layer 1: Pulse watchers (signal ingestion)

Persistent Pulse watcher agents monitoring external sources:

- **Federal Register watcher** — polls the Federal Register API daily for new rules, proposed rules, and notices. Filters by agency and topic based on the client's regulatory domains.
- **State AG enforcement watcher** — monitors state Attorney General enforcement action feeds for relevant actions.
- **Court filing watcher** — monitors PACER and court RSS feeds for decisions relevant to the client's industries and legal theories.
- **Agency action watcher** — monitors SEC, FTC, EEOC, FINRA, HHS, EPA action feeds.
- **Legislative watcher** — monitors state and federal legislative tracking services for bills relevant to the client's regulatory domains.
- **News watcher** — monitors legal news sources (Law360, Reuters Legal, etc.) for industry-relevant developments.

Each watcher is a persistent Pulse agent with durable state. It runs on a configurable schedule (hourly, daily, etc.), tracks what it's already processed (preventing duplicates), and emits a **Signal** event for each new item:

```typescript
interface LegalSignal {
  signalId: string;
  source: string;              // "federal-register", "pacer", "sec", etc.
  sourceUrl: string;
  title: string;
  summary: string;             // LLM-generated summary of the signal
  fullText?: string;           // Full text if available
  date: string;
  categories: string[];        // Regulatory categories
  jurisdictions: string[];     // Affected jurisdictions
  agencies?: string[];         // Issuing agencies
}
```

**For the initial build**, we ship with 2-3 watchers:
- Federal Register (clean API, well-structured data, highest signal quality)
- One state AG feed (California — largest economy, most active enforcement)
- News aggregation (RSS feeds from 3-5 legal news sources)

Additional watchers are added incrementally. The watcher interface is pluggable — each watcher implements the same `LegalSignalWatcher` interface and registers with Pulse.

### Layer 2: Triage agent (signal scoring)

For each incoming signal, the triage agent:

1. **Cross-references against the portfolio index** — queries the client's portfolio (indexed during setup) for documents potentially affected by the signal. Uses the regulatory framework mapping from Compliance Audit (#5) to identify which requirements and policies are relevant.

2. **Scores relevance** — on a 1-10 scale:
   - 1-3: noise, discard silently
   - 4-6: potentially relevant, log for weekly digest
   - 7-8: likely relevant, queue for specialist analysis
   - 9-10: definitely relevant, queue for urgent specialist analysis

3. **Tags affected documents** — which specific contracts, policies, or agreements in the portfolio are potentially affected.

**Triage calibration is the make-or-break feature.** If the GC gets 50 low-quality alerts a day, they turn the product off. The triage agent must be aggressively filtered:

- Default threshold for specialist dispatch: 7+
- Configurable per organization
- Weekly digest for 4-6 scored signals (so the GC knows what was filtered and can adjust the threshold)
- Triage accuracy metrics in the dashboard (what percentage of dispatched signals resulted in actionable impact memos)

### Layer 3: Specialist analysis (impact assessment)

When a signal clears the triage threshold, the Legal Department specialist team is dispatched:

- The signal and the affected documents are packaged as a specialist analysis job
- The CLO routing agent determines which specialists are relevant (a regulatory change affecting privacy goes to the privacy specialist; an employment law change goes to the employment specialist)
- The specialists produce an **Impact Memo**:

```typescript
interface ImpactMemo {
  signalId: string;
  signalSummary: string;
  affectedDocuments: {
    documentId: string;
    documentName: string;
    specificClauses: string[];     // Which clauses are affected
    impactSeverity: 'critical' | 'high' | 'medium' | 'low';
    analysis: string;              // What the impact is
  }[];
  overallImpact: string;           // Cross-document impact summary
  proposedActions: {
    action: string;                // "Amend clause 7.2 of MSA with Client X"
    urgency: 'immediate' | 'within-30-days' | 'next-review-cycle';
    effort: 'small' | 'medium' | 'large';
  }[];
  regulatoryDeadline?: string;     // If the signal has a compliance deadline
}
```

### Layer 4: HITL gate (GC review)

Impact memos land in the **GC Inbox** — a dedicated view in the Legal Department workspace showing all pending impact memos, sorted by urgency.

For each memo, the GC can:
- **Acknowledge** — "I've read this, no action needed"
- **Accept actions** — "proceed with the proposed amendments"
- **Modify actions** — "change the approach to [X]"
- **Dismiss** — "this isn't actually relevant, adjust triage scoring"
- **Escalate** — "send this to [colleague] for review"

Dismissals feed back into triage calibration — the triage agent learns from the GC's decisions over time.

### Layer 5: Audit trail

Every signal, every triage score, every specialist analysis, every GC decision is logged in the sovereign observability plane:

- When regulators ask "did you know about [regulatory change X]?", the audit trail shows exactly when the signal was detected, how it was scored, what analysis was performed, and what action was taken.
- This is a **regulatory defensibility** feature, not just observability. "We have a documented, continuous monitoring process with a complete audit trail" is a meaningful compliance posture.

### Portfolio indexing (setup phase)

When the Sentinel is first configured, the client's portfolio must be indexed:

- All documents are ingested, classified, and indexed using the document classification from Due Diligence (#4)
- The Policy Index from Compliance Audit (#5) is built for the portfolio
- The regulatory framework mappings from #5 are applied
- The index is stored in the database plane with vector embeddings for semantic search

**Index maintenance:** when the client adds, removes, or updates documents in the portfolio, the index must update. This is handled via a Pulse watcher on the portfolio storage — when a document changes, re-index it.

### Frontend: Sentinel dashboard

A new section in the Legal Department workspace:

1. **GC Inbox** — pending impact memos, sorted by urgency
2. **Signal Feed** — all detected signals (including those below triage threshold) with their scores. The GC can browse this to see what's being filtered.
3. **Portfolio Status** — which documents are being monitored, when they were last updated, coverage heat map by regulatory domain
4. **Sentinel Health** — watcher status (running/stopped/error), last check time, signal volume, triage accuracy metrics

## Constraints

- **No fallbacks on watcher failures.** If a source is unavailable, the watcher emits a failure event and the dashboard shows the watcher as unhealthy. We do not silently skip sources.
- **Triage false-positive fatigue is the existential risk.** The default threshold must be conservative (7+). Better to miss a medium-relevance signal than to flood the GC with noise.
- **Portfolio index staleness is a critical bug.** When a document changes, the index must update or the next signal assessment is wrong. The Pulse watcher on portfolio storage is not optional.
- **Sovereign by default.** No signal data, no portfolio data, no impact memos leave the customer's hardware. The watchers fetch from public sources, but all processing and storage is local.
- **ExecutionContext for each impact assessment.** Each signal-to-memo pipeline gets its own conversationId and full ExecutionContext capsule. The Sentinel as a whole doesn't have a single context — each analysis does.

## Out of scope

- **All watcher adapters beyond the initial 2-3.** Additional sources (PACER, FINRA, HHS, etc.) are added incrementally as separate micro-efforts.
- **Triage ML model.** Initial triage uses LLM-based scoring with the structured framework from #5. A trained triage classifier is a future optimization.
- **Automated remediation.** The Sentinel proposes actions; it doesn't execute them (no automated contract amendments, no automated policy updates). Future capability.
- **Multi-tenant Sentinel.** One Sentinel instance per organization. A law firm running Sentinel for multiple clients needs one instance per client. Multi-tenant Sentinel is a future infrastructure improvement.
- **Historical signal backfill.** The Sentinel starts monitoring from activation. Catching up on historical signals ("what did we miss in the last 6 months?") is a future feature.

## Dependencies

- Regulatory Compliance Audit (#5) — regulatory framework library, cross-reference pattern, policy indexing
- Due Diligence (#4) — document classification and batch indexing
- Legal Research (#2) — recursive research for deep-dive on ambiguous signals
- Legal Department async workspace (completed)
- Pulse event-driven infrastructure (existing, needs watcher adapter development)
- Database plane with vector embeddings for semantic portfolio search

## Estimated scope

Large. 6-8 weeks. The Pulse watcher adapters (2-3 sources), triage agent, portfolio indexing, GC inbox UI, and the Sentinel dashboard are all net-new. The specialist analysis reuses the existing Legal Department pipeline. The audit trail reuses the observability plane.

## Why this goes sixth

- Builds directly on the regulatory framework and cross-reference pattern from #5.
- The sovereignty flagship — the workflow that proves the platform thesis.
- Recurring subscription revenue model — the only workflow in the portfolio that bills monthly, not per-project.
- First Pulse integration — validates the event-driven architecture for Persistent Case Team (#10).
- Impossible for SaaS-only competitors to match.
