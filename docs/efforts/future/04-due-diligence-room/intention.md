# Intention: Due Diligence Room

## Priority: #4 of 10 Legal Workflows

## What

An M&A team uploads a virtual data room — 50 to 500 documents (contracts, financials, corporate records, IP filings, employment agreements, environmental reports, regulatory permits). The Legal Department dispatches a **multi-specialist team** that crawls the entire room, classifies every document, extracts key terms and obligations, flags risks across categories, cross-references findings across documents, and produces a structured Due Diligence Report with a risk matrix, document index, and per-category analysis.

The user clicks "Open a Due Diligence Room" in the Legal Department workspace, uploads documents (individually or as a ZIP), tags the deal context (acquisition, merger, investment, asset purchase), and gets a job. The activity feed shows the DD room progressing through phases: document classification → extraction → specialist analysis → cross-reference → synthesis → report. Each phase emits granular progress events so the lawyer can see which documents are being analyzed in real time.

This is the first **high-volume batch workflow** — dozens to hundreds of documents flowing through the specialist pipeline. It introduces the batch processing pattern that Discovery Document Review (#7) scales up further.

## Why

### The market

M&A due diligence is the second-largest legal spend category after litigation. A typical mid-market deal involves 200-400 documents in the data room, and the legal DD review costs $100K-$500K in associate time. Large deals can exceed $1M in legal DD costs. The timeline is brutal — the buyer's counsel has 2-4 weeks to review everything and produce a comprehensive report identifying every risk, liability, and obligation.

### What exists today

Kira Systems (now Litera) and Luminance do data room document extraction and classification. They're good at finding specific clause types (change of control, assignment, non-compete) across a large document set. What they don't do is **specialist reasoning** — they extract clauses but don't analyze them in context. They find every indemnification clause, but they don't tell you whether the indemnification is adequate for this deal, how it interacts with the rep & warranty provisions in the purchase agreement, or whether it creates an undisclosed liability.

Our existing Legal Department specialists already do this reasoning — they just do it one document at a time. The DD Room workflow scales them to hundreds of documents and adds cross-document analysis that identifies risks spanning multiple agreements.

### The patterns it builds on and introduces

**Builds on:**
- Clause-level annotation from Contract Review (#1) — each document gets per-clause annotations
- Recursive research from Legal Research (#2) — when a DD flag requires deeper investigation

**Introduces:**
- **Batch document ingestion** — a queue-within-a-queue pattern where the DD job manages a pipeline of individual document analyses
- **Cross-document analysis** — findings from one document inform the analysis of other documents (e.g., the employment agreements reference a non-compete that the IP assignment agreement modifies)
- **Progressive reporting** — the DD report builds incrementally as documents are analyzed, not all-at-once at the end

These patterns are directly reused by Discovery Document Review (#7), which is essentially the same pipeline at 10x scale with different annotation categories.

## The shape of the thing

### Data room structure

When the user creates a DD room, they provide:

- **Documents** — uploaded individually, as a batch, or as a ZIP. Each document gets a unique `documentId` within the room.
- **Deal context** — transaction type (acquisition, merger, investment, joint venture, asset purchase), target company name, buyer company name, deal value range, jurisdiction(s).
- **Focus areas** — optional. The lawyer can flag specific risk categories to prioritize (e.g., "focus on change-of-control provisions and IP ownership").
- **Known issues** — optional. Pre-identified concerns that specialists should pay special attention to.

The room is a persistent entity scoped to the job. All documents, analysis results, and the evolving report live under one `conversationId`.

### Phase 1: Document classification and indexing

Every document is classified by type: contract, corporate record, financial statement, employment agreement, IP filing, regulatory permit, correspondence, other. Classification uses a lightweight LLM call per document (the same clause segmentation approach from Contract Review #1, but at the document level).

Output: a **Document Index** — a structured table of every document with its type, parties, date, and a one-line summary. This index is displayed in the DD room UI immediately and updated as analysis progresses.

### Phase 2: Extraction and specialist analysis

Each document flows through the specialist pipeline. The CLO routing node determines which specialists are relevant for each document type (e.g., an employment agreement routes to the employment, privacy, and IP specialists; a corporate record routes to the corporate specialist only).

The key difference from single-document analysis: **specialists accumulate context across documents.** The contract specialist analyzing agreement #47 knows what it found in agreements #1-46. This allows it to identify:

- **Cross-references** — agreement #47 references a schedule defined in agreement #12
- **Inconsistencies** — the non-compete in agreement #47 contradicts the non-compete waiver in agreement #23
- **Cumulative obligations** — the aggregate indemnification cap across all agreements exceeds the deal value
- **Missing documents** — agreement #47 references an exhibit that isn't in the data room

Cross-document context is managed via a **running findings summary** that each specialist maintains in the graph state. After analyzing each document, the specialist appends its key findings to the summary. When analyzing the next document, it receives the summary as context (not the full analysis of every prior document — that would overflow the context window).

### Phase 3: Cross-document synthesis

After all documents are analyzed, a synthesis node produces:

- **Risk matrix** — a grid of risk categories (contractual, IP, employment, regulatory, financial, corporate, environmental) × severity (critical, high, medium, low), with the count and document references for each cell.
- **Per-category analysis** — for each risk category, a narrative summary of findings across all documents, with specific clause references.
- **Deal-breaker flags** — findings that the synthesis agent considers potential deal-breakers, highlighted separately.
- **Missing document list** — documents that are referenced in the data room but not present.
- **Cross-reference map** — which documents reference which other documents, and where the cross-references create risk.

### Phase 4: Report generation

The final DD report includes:

1. **Executive summary** — 1-page overview for the partner/client
2. **Risk matrix** — the visual grid
3. **Per-category detailed analysis** — organized by risk category, with clause-level citations
4. **Document index** — the classified list of all documents with per-document risk score
5. **Cross-reference map** — visual or tabular representation of inter-document relationships
6. **Appendix: per-document annotations** — the full clause-level analysis for each document (reusing the Contract Review #1 output format)

### HITL gate: phased review

The DD workflow has **two HITL gates**:

1. **After Phase 2 (extraction)** — the lawyer reviews the document index and initial findings. They can:
   - Flag documents for deeper analysis
   - Correct misclassifications
   - Add focus areas based on what's been found
   - Skip documents that are irrelevant

2. **After Phase 3 (synthesis)** — the lawyer reviews the risk matrix and deal-breaker flags before the final report is generated. They can:
   - Reclassify risks (e.g., "this isn't a deal-breaker, downgrade to high")
   - Request deeper research on specific findings (fires the recursive research pattern from #2)
   - Add commentary that appears in the final report

### Batch processing: the queue-within-a-queue

The DD room job is a single entry in the `legal.agent_jobs` table. But internally, it manages a pipeline of individual document analyses. The architecture:

- The DD graph's **document dispatcher node** maintains a queue of unanalyzed documents
- It dispatches documents to the specialist pipeline one at a time (respecting Ollama's concurrency limit) or in parallel (for cloud providers)
- Each document analysis emits progress events that the frontend renders as a per-document progress row in the DD room UI
- If a single document fails (LLM error, parsing failure), the failure is logged for that document and the pipeline continues to the next. The final report notes which documents failed analysis.
- The overall job status reflects the pipeline progress: "Analyzing document 23 of 147"

This is NOT a sub-job architecture. There is one job, one graph execution, one conversationId. The document dispatcher is a loop node within the graph, not a separate job queue. This keeps the architecture simple and the observability unified.

### Frontend: DD Room view

The DD room detail panel has three tabs:

1. **Document Index** — the classified list, updated in real time as documents are analyzed. Each row shows the document name, type, risk score, and a status indicator (pending / analyzing / complete / failed).
2. **Risk Matrix** — the category × severity grid, updated after synthesis. Click a cell to see the findings.
3. **Report** — the full DD report, available after report generation.

A new `DataRoomViewer.vue` component handles the document index with real-time updates. The risk matrix reuses a generic `RiskMatrix.vue` component. The report tab reuses `ReportMarkdown.vue`.

## Constraints

- **No fallbacks on document failures.** If a document can't be parsed or analyzed, it's marked as failed in the index with the real error. The pipeline continues. The report notes the failure. We do not skip silently.
- **No cross-document state leakage between DD rooms.** Each room is isolated. A specialist's accumulated findings from Room A never appear in Room B.
- **ExecutionContext is the capsule.** One room = one job = one conversationId.
- **The running findings summary is the cross-document context mechanism.** We do not pass full prior analyses to subsequent document analyses — that would overflow the context window on large rooms. The summary is a compressed, structured representation maintained by each specialist.
- **Document upload size limits must be enforced.** Individual documents: configurable max (default 50MB). Total room: configurable max (default 1GB). These are hard limits, not suggestions.
- **Provider concurrency is respected.** On Ollama (concurrent=1), documents are analyzed sequentially. On cloud providers, they parallelize up to the configured limit.

## Out of scope

- **Incremental room updates.** Adding new documents to an existing DD room after analysis has started. Future enhancement — requires re-running synthesis with the new documents.
- **Automated deal memo generation.** The DD report identifies risks; it doesn't draft the acquisition agreement. Future workflow.
- **Financial analysis.** The specialists analyze legal documents, not financial statements. Financial DD is a different discipline. Future expansion if there's demand.
- **Data room access controls.** All users in the org can see all DD rooms. Per-room access control is a future hardening item.
- **Comparison across DD rooms.** "How does this target's risk profile compare to the last three acquisitions?" Future analytics feature.

## Dependencies

- Contract Review & Redlining (#1) — clause-level annotation format, clause segmentation
- Legal Research Deep Dive (#2) — recursive research pattern for deep-dive on flagged findings
- Legal Department async workspace (completed)
- Legal Department HITL (completed)

## Estimated scope

Medium-large. 3-4 weeks. The document dispatcher loop, cross-document context management, phased HITL gates, and the DD-specific report format are the net-new work. The per-document specialist analysis reuses the existing pipeline with the annotation output format from #1.

## Why this goes fourth

- First high-volume batch workflow — introduces the pattern Discovery (#7) scales up.
- Second-largest legal spend category — immediate, obvious ROI.
- Builds naturally on #1 (annotations) and #2 (research for deep dives).
- The cross-document analysis capability is genuinely differentiated — competitors extract clauses, we analyze them in context across the full room.
- Validates batch processing on local Ollama models (a 200-document room on a Mac Studio is an overnight job — perfect for the async architecture).
