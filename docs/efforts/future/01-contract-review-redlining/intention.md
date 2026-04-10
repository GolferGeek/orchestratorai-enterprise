# Intention: Contract Review & Redlining

## Priority: #1 of 10 Legal Workflows

## What

A lawyer uploads a contract (NDA, MSA, employment agreement, lease, SaaS terms, etc.) and the Legal Department produces two outputs: (1) a **structured risk assessment** with per-clause risk scores, and (2) a **redlined version** of the contract with suggested alternative language for every clause the specialists flagged.

The existing Legal Department already analyzes contracts through 8 specialists and produces a narrative report. This effort changes the **output shape** from a single prose report to a clause-level annotated document. Each specialist's findings are anchored to specific clauses, sections, and defined terms in the original document. The synthesis node merges cross-specialist findings per clause. The report generation node produces a structured redline — the original text, the risk annotation, and the suggested replacement language — for every flagged clause.

The user lands in the Legal Department workspace, clicks "Review a Contract," uploads the document, and gets back a job in the activity feed. When the job completes, the detail panel shows two tabs: (1) the risk assessment with clauses sorted by severity, and (2) the redlined contract with inline annotations. The user can accept, reject, or modify each suggested edit, and export the final redlined document.

## Why

### The market demand

Contract review is the single most in-demand legal AI use case. Every AI legal vendor — Harvey, Ironclad, Luminance, Kira — leads with it. It's the workflow that a managing partner can understand in 30 seconds and immediately see the ROI on. If the platform doesn't do contract review well, nothing else matters.

### What we already have vs. what's missing

The existing Legal Department already does the hard part: it routes a contract through the right specialists, each specialist produces domain-specific analysis, and the synthesis node merges the findings. The gap is entirely in **output granularity**. Today the specialists write prose paragraphs about the contract as a whole. We need them to write per-clause annotations anchored to specific locations in the document.

This is a prompt engineering + output format change, not an architecture change. The LangGraph workflow, the async job queue, the workspace UI, the HITL gate — all of it already works. We are changing what the specialists say, not how they're orchestrated.

### The pattern it introduces

**Clause-level annotation** is the output pattern that Due Diligence (#4), Regulatory Compliance (#5), and Discovery Document Review (#7) all need. In DD, agents annotate data room documents with risk flags. In compliance, agents annotate policies with regulatory gaps. In discovery, agents annotate documents with relevance and privilege codes. All of these are "read a document, produce per-section structured annotations." Building this pattern once, correctly, on a contract review use case — where the expected output is well-understood and easy to validate — means the later workflows just reuse the annotation output format.

## The shape of the thing

### Document parsing: clause segmentation

Before the specialists run, a new **clause segmentation** pre-processing step breaks the contract into a structured representation:

- **Sections** (numbered or titled blocks)
- **Clauses** (individual provisions within sections)
- **Defined terms** (capitalized terms with definitions)
- **Schedules/exhibits** (appendices)

This produces a `ClauseMap`: an ordered list of `{ clauseId, sectionPath, text, definedTermsReferenced }`. The clause map flows through the state alongside the raw document text. Specialists receive both the full document (for context) and the clause map (for anchoring their findings).

The segmentation is done by an LLM call — not regex. Contracts are too varied in formatting for rule-based parsing. The LLM receives the document and produces structured JSON output matching the `ClauseMap` schema.

### Specialist output format change

Each specialist currently returns unstructured prose. In this effort, each specialist returns a list of **clause annotations**:

```typescript
interface ClauseAnnotation {
  clauseId: string;           // References the ClauseMap entry
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  category: string;           // e.g., "indemnification", "IP assignment", "non-compete"
  finding: string;            // What the specialist found (2-4 sentences)
  suggestedLanguage?: string; // Replacement clause text, if the specialist has a recommendation
  reasoning: string;          // Why this matters (1-2 sentences)
}
```

Each specialist produces 0-N annotations. A specialist that finds nothing wrong with any clause in its domain returns an empty list — this is a valid and useful signal.

### Synthesis: clause-level merge

The synthesis node receives all specialist annotations, groups them by `clauseId`, and produces a merged view:

```typescript
interface ClauseSynthesis {
  clauseId: string;
  originalText: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  annotations: ClauseAnnotation[];  // From all specialists
  suggestedRedline?: string;        // Merged replacement language if multiple specialists have suggestions
  summary: string;                  // 1-2 sentence plain-English summary
}
```

When multiple specialists flag the same clause, the synthesis LLM merges their suggestions into a single coherent redline. When suggestions conflict (e.g., the IP agent wants to broaden the IP assignment clause while the employment agent wants to narrow it), the synthesis flags the conflict explicitly and presents both options.

### Report generation: two output modes

The report generation node produces two outputs:

1. **Risk Assessment Report** — A structured document organized by risk level (critical first), with each clause's annotations, findings, and suggested changes. This is the "executive summary" output that a partner reads.

2. **Redlined Contract** — The original document text with inline annotations and suggested replacements. Each annotation includes the risk level, the specialist(s) that flagged it, and the suggested alternative language. This is the "working document" output that an associate uses.

Both outputs are persisted as part of the job result. The frontend renders them as two tabs in the job detail panel.

### HITL gate: per-clause decisions

The existing HITL gate pauses for human review. In this workflow, the review modal shows the redlined contract with each annotation. The reviewer can:

- **Accept** a suggested redline (the replacement language is marked as accepted)
- **Reject** a suggested redline (the original language is kept, the annotation is noted as reviewed-and-rejected)
- **Modify** a suggested redline (the reviewer edits the replacement language)
- **Approve all** (accept all suggestions and proceed to final report)

After the reviewer makes their decisions, the report generation node produces the final version incorporating the human's choices.

### Frontend: redline viewer component

A new `RedlineViewer.vue` component renders the annotated contract. It shows:

- Original text on the left, annotated text on the right (or inline with strikethrough/insertion markup)
- Color-coded risk levels (red = critical, orange = high, yellow = medium, blue = low)
- Click any annotation to see the specialist finding and reasoning
- Toggle between "all annotations" and "unresolved only"

This component is built generically enough that Due Diligence (#4) and Compliance Audit (#5) can reuse it with different annotation categories.

## Constraints

- **No fallbacks. No cheating.** If clause segmentation fails on a contract format, the job fails with a clear error. We do not silently fall back to "analyze the whole document as one blob."
- **ExecutionContext is the capsule.** Same job queue, same conversationId threading, same observability events.
- **Clause segmentation is best-effort but honest.** If the LLM can't segment a clause (e.g., a poorly formatted scanned PDF), the annotation targets the section level instead, and the output says so.
- **Specialists are not rewritten.** Their prompts are updated to produce `ClauseAnnotation[]` output instead of prose. The specialist node code, the orchestrator, and the routing are unchanged.
- **The redline viewer is a new component, not a modification of the existing report markdown renderer.** The existing `ReportMarkdown.vue` stays for the risk assessment tab. The redline viewer is purpose-built for clause-level annotations.
- **No document editing.** The platform produces a redlined view, not an editor. The user exports the redline as a document (markdown or DOCX) and makes the actual edits in their document tool. In-app editing is a future effort.

## Out of scope

- **DOCX/PDF export.** The redline is rendered in the browser. Export to Word or PDF is a future enhancement.
- **Template library.** Pre-built annotation templates for common contract types (NDA, MSA, employment) would speed up specialist analysis. Future effort.
- **Clause-level RAG.** Comparing clauses against a library of "good" clauses from the firm's own contracts. Powerful, but requires a clause-indexed RAG collection that doesn't exist yet.
- **Multi-party contracts.** The initial version assumes two parties. Multi-party agreements (joint ventures, consortium agreements) add complexity to the annotation model.
- **Negotiation tracking.** Tracking multiple rounds of redlines across counterparty exchanges. Future workflow (could become its own workflow in a future expansion).

## Dependencies

- Legal Department async workspace (completed — the job queue, activity feed, and detail panel)
- Legal Department HITL (completed — the review/approve/reject flow)
- Existing 8 specialists (completed — they just need prompt updates)

## Estimated scope

Small-medium. 1-2 weeks. The LangGraph workflow doesn't change structurally. The work is: clause segmentation LLM call, specialist prompt updates, synthesis merge logic, report generation for two output modes, and the RedlineViewer.vue frontend component.

## Why this goes first

- Fastest to build on the existing foundation — 90% of the infrastructure is already running.
- Highest immediate market demand — every law firm evaluating AI tools asks "can it review contracts?"
- Introduces the clause-level annotation pattern that workflows #4, #5, and #7 depend on.
- Produces a tangible, billable work product on day one.
- Validates the specialist output format change pattern that every subsequent workflow will use.
