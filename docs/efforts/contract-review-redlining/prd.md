# Contract Review & Redlining — Product Requirements Document

## 1. Overview

Add a **contract review & redlining** output mode to the existing legal-department workflow. A lawyer uploads a contract, and the system produces two outputs: (1) a structured risk assessment with per-clause risk scores, and (2) a redlined version with suggested alternative language for every flagged clause.

This is not a new workflow — it is a new output path on the existing legal-department LangGraph graph. The async job queue, worker, SSE streaming, reasoning capture, and workspace UI all remain. What changes: a clause segmentation pre-processing step, specialist prompt updates to produce per-clause annotations, a clause-level synthesis merge, a redline generation node, and a `RedlineViewer.vue` frontend component with per-clause HITL decisions.

All LLM calls run on **Gemma 4 31B** (sovereign mode). No cloud model dependencies.

## 2. Goals & Success Criteria

| Goal | Success Criteria |
|------|-----------------|
| Clause-level annotations | Every specialist returns `ClauseAnnotation[]` anchored to specific `clauseId` references from the clause map. Zero unanchored findings. |
| Two output tabs | Completed contract-review jobs render Risk Assessment (markdown) and Redlined Contract (structured viewer) as separate tabs. |
| Per-clause HITL | Reviewer can accept/reject/modify each clause suggestion individually before final report generation. |
| Sovereign execution | All LLM calls (segmentation, specialists, synthesis, report gen) run on Gemma 4 31B via Ollama. No cloud fallbacks. |
| Reusable annotation pattern | `ClauseAnnotation` and `RedlineViewer.vue` are generic enough for workflows #4 (Due Diligence), #5 (Compliance Audit), and #7 (Discovery Review) to reuse. |
| Existing functionality preserved | The current `document-analysis` job type continues to work unchanged. Contract review is a new `capabilitySlug`, not a replacement. |

## 3. User Stories

**US-1: Upload and Review a Contract**
A lawyer navigates to the Legal Department workspace, clicks "Review a Contract," uploads an NDA/MSA/employment agreement, and receives a job in the activity feed. The stage ladder shows: segmentation → specialist analysis → synthesis → HITL review → report generation.

**US-2: Review Clause-Level Findings**
When the job reaches `awaiting_review`, the review modal shows two tabs. The Risk Assessment tab shows the executive summary. The Redline tab shows the original contract with inline annotations — color-coded by risk level, with each annotation showing the specialist finding, reasoning, and suggested replacement language.

**US-3: Per-Clause Decisions**
The reviewer clicks each flagged clause and chooses: Accept (use suggested language), Reject (keep original), or Modify (edit the replacement text). An "Approve All" button accepts all suggestions at once. After decisions, the report generation node produces the final version incorporating the reviewer's choices.

**US-4: View Completed Redline**
After the job completes, the detail modal shows two tabs: the risk report (markdown) and the final redlined contract with accepted/rejected/modified annotations visible.

## 4. Technical Requirements

### 4.1 Architecture

The existing graph gains one new node and one conditional branch:

```
Current:  echo → clo_routing → orchestrator → synthesis → hitl_checkpoint → report_generation → complete
                                                                    
New:      echo → clo_routing → orchestrator → synthesis → hitl_checkpoint → report_generation → complete
                      ↓                           ↓              ↓
              (detects contract-    (clause-level   (per-clause
               review slug →        merge instead    decisions in
               all specialists      of executive     review payload)
               + segmentation       summary)
               pre-step)
```

The graph structure does not change. The behavior of existing nodes changes based on `state.outputMode`:
- `'analysis'` (default) — current behavior, unchanged
- `'contract-review'` — clause-level annotation output path

**No new graph nodes are added.** The clause segmentation step runs in the worker before graph invocation (same pattern as metadata extraction). Specialists, synthesis, and report generation change their prompt and output format based on `outputMode`.

### 4.2 Data Model Changes

#### New types (in `legal-department.types.ts`)

```typescript
// The clause map produced by segmentation
interface ClauseMap {
  clauses: ClauseMapEntry[];
  documentName: string;
  totalClauses: number;
}

interface ClauseMapEntry {
  clauseId: string;              // e.g., "s2-c3" (section 2, clause 3)
  sectionPath: string;           // e.g., "2. Confidentiality > 2.3 Exceptions"
  text: string;                  // Original clause text
  startIndex: number;            // Character offset in source document
  endIndex: number;              // Character offset in source document
  definedTermsReferenced: string[];
  entryType: 'clause' | 'section' | 'schedule' | 'exhibit';  // What this entry represents
  sectionLevel: boolean;         // true when clauses within this section couldn't be parsed individually
}

// Per-specialist output for contract-review mode
interface ClauseAnnotation {
  clauseId: string;              // References ClauseMapEntry.clauseId
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  category: string;              // e.g., "indemnification", "IP assignment"
  finding: string;               // 2-4 sentences
  suggestedLanguage?: string;    // Replacement clause text
  reasoning: string;             // 1-2 sentences
}

// Synthesis output for contract-review mode
interface ClauseSynthesis {
  clauseId: string;
  originalText: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  annotations: ClauseAnnotation[];   // From all specialists
  suggestedRedline?: string;         // Merged replacement language
  conflictNotes?: string;            // When specialists disagree
  summary: string;                   // 1-2 sentence plain English
}

interface RedlineOutput {
  clauses: ClauseSynthesis[];
  documentName: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  totalAnnotations: number;
  riskBreakdown: Record<string, number>;  // risk level → count
}

// Per-clause HITL decision
interface ClauseDecision {
  clauseId: string;
  decision: 'accept' | 'reject' | 'modify';
  modifiedLanguage?: string;         // Only when decision === 'modify'
}

interface ClauseReviewPayload {
  clauseDecisions: ClauseDecision[];
  feedback?: string;
}
```

#### State annotation changes (`legal-department.state.ts`)

Add three fields to `LegalDepartmentStateAnnotation`:

```typescript
outputMode: Annotation<'analysis' | 'contract-review'>({
  reducer: (_, next) => next,
  default: () => 'analysis',
}),
clauseMap: Annotation<ClauseMap | undefined>({
  reducer: (_, next) => next,
  default: () => undefined,
}),
redlineOutput: Annotation<RedlineOutput | undefined>({
  reducer: (_, next) => next,
  default: () => undefined,
}),
```

#### Database schema

No migration needed. The `input`, `result`, and `review_decision` columns are all `jsonb` — the new shapes fit within the existing columns:

- `input.data.capabilitySlug` = `'contract-review'` (new value, existing field)
- `result.redlineOutput` = `RedlineOutput` (new key in existing jsonb)
- `result.response` = risk assessment markdown (existing key, still populated)
- `review_decision` = `ClauseReviewPayload` (new shape, existing column)

The `capability_model_config` table needs new seed rows for `contract-review` capability slug (workhorse + thinking roles).

#### Capability config seed (migration)

```sql
INSERT INTO legal.capability_model_config (capability_slug, role, provider, model)
VALUES
  ('contract-review', 'workhorse', 'ollama', 'gemma4:31b'),
  ('contract-review', 'thinking', 'ollama', 'gemma4:31b')
ON CONFLICT (capability_slug, role) DO NOTHING;
```

### 4.3 API Changes

#### No new endpoints

All existing endpoints serve the contract-review flow:

| Endpoint | Change |
|----------|--------|
| `POST /legal-department/jobs/upload` | None — `capabilitySlug` field in FormData context distinguishes `contract-review` from `document-onboarding` |
| `GET /legal-department/jobs/:id` | Returns `redlineOutput` in result when job is `contract-review` type. Returns `clauseMap` in reviewPayload when status is `awaiting_review`. |
| `POST /legal-department/jobs/:id/review` | Accepts `ClauseReviewPayload` shape in addition to existing `ReviewDecisionPayload` shapes. Detection by presence of `clauseDecisions` field. |
| `GET /legal-department/jobs/:id/events` | No change — same observability events |
| `GET /legal-department/jobs/:id/reasoning` | No change — same reasoning capture pattern |

#### Worker changes

The worker detects `capabilitySlug === 'contract-review'` from the job input and:

1. Runs clause segmentation (new LLM call) after metadata extraction, before graph invocation
2. Sets `state.outputMode = 'contract-review'` and `state.clauseMap` in the initial state passed to `graph.invoke()`
3. On completion, stores `redlineOutput` in the result alongside the existing `response`

#### Controller changes

`GET /legal-department/jobs/:id` when `awaiting_review`:
- Currently hydrates `specialistOutputs` and `synthesis` from the LangGraph checkpointer
- Additionally hydrates `clauseMap` and `redlineOutput` (the pre-HITL clause synthesis) when the job is `contract-review` type

`POST /legal-department/jobs/:id/review`:
- Detects `ClauseReviewPayload` by checking for `body.clauseDecisions` array
- Writes it as the `review_decision` jsonb (same column, different shape)
- The worker's `resumeWithDecision()` path passes the clause decisions into the graph via `Command({resume})`

### 4.4 Frontend Changes

#### New component: `RedlineViewer.vue`

Location: `apps/forge/web/src/views/agents/legal-department/components/RedlineViewer.vue`

**Props:**
- `clauses: ClauseSynthesis[]` — the clause-level synthesis output
- `clauseDecisions: Record<string, ClauseDecision>` — current reviewer decisions
- `readonly: boolean` — true for completed jobs (no decision buttons), false for HITL review

**Emits:**
- `update:clauseDecisions` — when reviewer makes a per-clause decision

**Rendering:**
- Clauses sorted by risk level (critical first)
- Each clause shows: original text, risk badge (color-coded), specialist findings, suggested replacement
- When `!readonly`: Accept/Reject/Modify buttons per clause. Modify opens an inline textarea.
- Color coding: red = critical, orange = high, yellow = medium, blue = low, green = acceptable
- Toggle: "All clauses" vs "Flagged only" (hides `acceptable` clauses)
- Each annotation expandable to show specialist name, finding detail, reasoning

**Design for reuse:** The component receives `ClauseSynthesis[]` — a generic shape. Future workflows (DD, compliance, discovery) pass their own annotation arrays conforming to the same interface. The component does not reference "legal" or "contract" in its internals.

#### Modified component: `LegalJobReviewModal.vue`

- Add `activeTab: ref<'risk' | 'redline'>` tab strip above the current content
- `risk` tab: existing synthesis + specialist outputs view (unchanged)
- `redline` tab: `<RedlineViewer>` with `clauseMap` data from `reviewPayload`
- `submit()`: when `activeTab === 'redline'` and clause decisions exist, sends `ClauseReviewPayload` instead of the current `ReviewDecisionPayload`
- "Approve All" button: sets all clause decisions to `accept` and submits
- Existing approve/reject/modify flow remains for the `risk` tab (backward compatible)

#### Modified component: `JobDetailModal.vue`

- For completed `contract-review` jobs: add tab strip (Risk Assessment | Redlined Contract)
- Risk Assessment tab: existing `ReportMarkdown` (unchanged)
- Redlined Contract tab: `<RedlineViewer :readonly="true">` showing final clause decisions
- Detection: `job.result?.redlineOutput` present → show tabs. Absent → current single-tab behavior.

#### Modified service: `legalJobsService.ts`

- Add `ClauseReviewPayload` to the review method's accepted types
- Add `ClauseSynthesis`, `ClauseDecision`, `RedlineOutput` type exports
- `review()` method: detect `ClauseReviewPayload` and send as `{ clauseDecisions, feedback? }` body

#### No changes needed

- `LegalDepartmentWorkspace.vue` — pure router/switcher, no content changes
- `StageLadder.vue` — generic over any `StageState[]`
- `ReportMarkdown.vue` — stateless markdown renderer
- `useWorkflowPresentation.ts` — manifest-driven, agentSlug-agnostic
- `useJobEventStream.ts` — event shape doesn't change
- `useThinkingStates.ts` — callerName mapping just needs new entries (handled by manifest)
- `router/index.ts` — no new routes needed (uses existing workspace + query param modals)

### 4.5 Infrastructure Requirements

#### Clause Segmentation LLM Call

New function in `LegalIntelligenceService`:

```typescript
async segmentClauses(
  context: ExecutionContext,
  documentText: string,
  metadata: LegalDocumentMetadata,
): Promise<ClauseMap>
```

- Uses existing `LLMHttpClientService.callLLM()` pattern
- `callerName: 'legal-department:clause-segmentation'`
- `temperature: 0.1` (precision task)
- Leverages existing `metadata.sections[].clauses[]` with `startIndex`/`endIndex` as seed data — the LLM refines and enriches rather than starting from scratch
- Uses `extractFirstJsonObject()` for Gemma trailing-prose tolerance
- Chunked approach for large contracts: if document exceeds 30K characters, segment section-by-section rather than whole-document (two-pass: sections first, clauses within each section)
- **Graceful section-level fallback**: If the LLM cannot segment individual clauses within a section (e.g., poorly formatted scanned PDF), the entry is marked `sectionLevel: true` and `entryType: 'section'`. Specialists annotate at the section level and the output says so. This is NOT a fallback to "analyze the whole document as one blob" — section-level is the coarsest granularity allowed. Total segmentation failure (no sections parseable) → job fails with clear error.

#### Specialist Prompt Updates

Each of the 8 specialist nodes gets an updated system prompt when `state.outputMode === 'contract-review'`:

- Receives `state.clauseMap` alongside document text
- Returns `ClauseAnnotation[]` instead of the current domain-specific output shape
- The current output shapes (`ContractAnalysisOutput`, `ComplianceAnalysisOutput`, etc.) remain for `outputMode === 'analysis'`
- Detection: `if (state.outputMode === 'contract-review')` in each specialist's node function selects the prompt variant
- Each specialist produces 0-N annotations. An empty list is a valid and useful signal — it means the specialist found nothing concerning in its domain
- `runSpecialistOverDocuments` helper is reused — chunking and merging still apply

#### Synthesis Prompt Update

When `state.outputMode === 'contract-review'`:
- Receives all specialists' `ClauseAnnotation[]` arrays grouped by `clauseId`
- Produces `ClauseSynthesis[]` — merged per-clause view with conflict resolution
- Also produces the `RedlineOutput` wrapper (risk breakdown, totals)
- Stores result in `state.redlineOutput` instead of `state.orchestration.synthesis`

#### Report Generation Update

When `state.outputMode === 'contract-review'`:
- Receives `state.redlineOutput` (post-HITL, with reviewer clause decisions applied)
- Produces both: (1) risk assessment markdown → `state.response`, (2) final redline data → preserved in result
- For `accept` decisions: suggested language replaces original
- For `reject` decisions: original text preserved, annotation marked as reviewed
- For `modify` decisions: reviewer's edited text replaces suggested language

#### HITL Checkpoint Update

When `state.outputMode === 'contract-review'`:
- `interrupt()` payload includes `redlineOutput` (the clause synthesis) plus the existing `specialistOutputs` and `synthesis`
- `Command({resume})` value is `ClauseReviewPayload` instead of `ReviewDecisionPayload`
- The HITL node writes clause decisions to `state.orchestration.hitlDecision` (same field, different shape)
- Conditional edge after HITL: if any clause decision is `reject`, route back to `orchestrator` for re-analysis of rejected clauses only (partial re-run). If all accept/modify, proceed to `report_generation`.

#### Model Config

Add `'clause-segmentation'` to `NODE_TO_ROLE` mapping in `legal-model-config.ts`:
- `'clause-segmentation': 'thinking'` — precision task, uses the thinking-role model

No new specialist node names in `NODE_TO_ROLE` — the existing specialist entries already map to `workhorse`.

#### Workflow Presentation Manifest

Update the `legal-department` presentation manifest (served from the agents table or API) to include a `clause_segmentation` stage before the existing specialist stages. This is a data change, not a code change.

## 5. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Clause segmentation latency | < 60s for contracts up to 50 pages on Gemma 4 31B |
| Specialist annotation latency | < 45s per specialist (sequential on Ollama) |
| Total pipeline time | < 10 minutes for a 50-page contract with all 8 specialists |
| Structured output reliability | `extractFirstJsonObject` brace-counter handles Gemma trailing prose. If JSON parse fails after extraction, job fails with clear error (no silent fallback). |
| Large contract handling | Contracts > 30K chars segmented in chunks (section-by-section). Token budget enforced at controller edge (250K max). |
| Concurrent jobs | Same provider-concurrency semaphore. Ollama max 1 concurrent. |

## 6. Out of Scope

From the intention (preserved exactly):

- **DOCX/PDF export** — redline rendered in browser only. Export is a future enhancement.
- **Template library** — pre-built annotation templates for common contract types.
- **Clause-level RAG** — comparing clauses against a library of "good" clauses.
- **Multi-party contracts** — initial version assumes two parties.
- **Negotiation tracking** — multiple rounds of redlines across counterparty exchanges.
- **In-app document editing** — the platform produces a redlined view, not an editor.

Additionally:
- **New database tables** — all data fits in existing `jsonb` columns.
- **New API endpoints** — existing endpoints serve both output modes.
- **New routes** — workspace and query-param modal pattern unchanged.
- **Cloud model support** — all calls run on Gemma 4 31B. Cloud provider paths are not tested or supported for this workflow.

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status |
|------------|--------|
| Legal department async workspace | Complete — job queue, activity feed, detail panel |
| Legal department HITL | Complete — review/approve/reject flow |
| 8 specialist nodes | Complete — need prompt updates only |
| Clause positions in metadata | Complete — `LegalDocumentMetadata.sections[].clauses[].{startIndex, endIndex}` already extracted |
| `extractFirstJsonObject` | Complete — Gemma trailing-prose tolerance |
| Provider concurrency semaphore | Complete — Ollama sequential execution |
| Reasoning capture | Complete — `callLLMMaybeWithReasoning` works for all nodes |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Gemma 4 31B produces malformed `ClauseMap` JSON for complex contracts | High | Two-pass chunked segmentation (sections first, then clauses per section). `extractFirstJsonObject` tolerance. Section-level fallback when clauses within a section can't be parsed (marked `sectionLevel: true`). Total segmentation failure (no sections parseable) → job fails with clear error. Test with 10+ real contract types during development. |
| Gemma 4 31B produces inconsistent `clauseId` references across specialists | High | Clause map is produced once and passed to all specialists as read-only context. Specialists select from existing `clauseId`s, they don't invent new ones. Post-specialist validation strips annotations with invalid `clauseId` references. |
| Per-clause HITL for a 200-clause contract overwhelms the reviewer | Medium | "Flagged only" toggle hides `acceptable` clauses (typically 70-80% of clauses). "Approve All" button for quick acceptance. Sort by risk level so critical items are first. |
| Total pipeline time exceeds 10 minutes on Gemma 4 31B | Medium | Sequential Ollama execution is the bottleneck. Monitor per-node timing. If too slow, reduce specialist count via smarter CLO routing (only route to relevant specialists, not all 8). |
| `ClauseAnnotation` type is too rigid for future workflows | Low | The type is intentionally minimal. Future workflows extend with domain-specific fields (e.g., `privilegeDesignation` for discovery). The `category` string field absorbs domain variation. |

## 8. Phasing

### Phase 1: Clause Segmentation + State Foundation

**Scope:**
- Add `ClauseMap`, `ClauseAnnotation`, `ClauseSynthesis`, `RedlineOutput`, `ClauseDecision`, `ClauseReviewPayload` types to `legal-department.types.ts`
- Add `outputMode`, `clauseMap`, `redlineOutput` fields to state annotation
- Implement `segmentClauses()` in `LegalIntelligenceService` — the LLM call that produces `ClauseMap` from document text + existing metadata
- Update worker to detect `capabilitySlug === 'contract-review'`, run clause segmentation, set `outputMode` and `clauseMap` in initial graph state
- Add `'clause-segmentation': 'thinking'` to `NODE_TO_ROLE`
- Supabase migration seeding `contract-review` capability config rows
- Add `'clause-segmentation'` stage to presentation manifest

**Validation:** Upload a contract via `POST /legal-department/jobs/upload` with `capabilitySlug: 'contract-review'`. The job processes through the existing pipeline with `clauseMap` populated in state. Specialist outputs are still in the old format (phase 2 changes them). The `clauseMap` is visible in the checkpointer state.

### Phase 2: Specialist Prompt Updates

**Scope:**
- Update all 8 specialist node prompts with a contract-review variant that produces `ClauseAnnotation[]`
- Each specialist: `if (state.outputMode === 'contract-review')` → use clause-annotation prompt with `state.clauseMap` context; else → existing prompt
- Post-specialist validation: strip annotations with `clauseId` not found in `state.clauseMap`
- Test each specialist individually with sample contracts

**Validation:** Upload a contract as `contract-review`. All 8 specialists produce `ClauseAnnotation[]` output. Each annotation references a valid `clauseId` from the clause map. The existing `document-onboarding` capability still works unchanged.

### Phase 3: Synthesis + Redline Generation + Report

**Scope:**
- Update synthesis node: when `contract-review`, group annotations by `clauseId`, merge across specialists, resolve conflicts, produce `ClauseSynthesis[]` and `RedlineOutput`
- Update report generation node: when `contract-review`, produce risk assessment markdown from `redlineOutput` AND preserve `redlineOutput` in state for frontend
- Update HITL checkpoint: include `redlineOutput` in interrupt payload
- Update worker: store `redlineOutput` in job result on completion
- Update controller: hydrate `clauseMap` and `redlineOutput` in `GET /jobs/:id` reviewPayload when `awaiting_review`

**Validation:** Full pipeline end-to-end: upload → segmentation → specialists → synthesis → HITL pause. Job status is `awaiting_review`. `GET /jobs/:id` returns `reviewPayload` with `redlineOutput` containing per-clause synthesis. Approve via existing review endpoint → job completes with both `response` (markdown) and `redlineOutput` in result.

### Phase 4: Frontend — RedlineViewer + Per-Clause HITL

**Scope:**
- Build `RedlineViewer.vue` component (generic, reusable)
- Update `LegalJobReviewModal.vue`: add Risk/Redline tab strip, render `RedlineViewer` in redline tab, wire per-clause decisions, extend `submit()` for `ClauseReviewPayload`
- Update `JobDetailModal.vue`: add tabs for completed contract-review jobs
- Update `legalJobsService.ts`: add types, extend review method
- Update `useThinkingStates.ts`: add `clause-segmentation` callerName mapping

**Validation:** Full end-to-end user flow: upload contract → watch stage ladder progress → review modal opens with two tabs → make per-clause decisions in RedlineViewer → submit → report generates with decisions applied → completed job shows both tabs in detail modal.

### Phase 5: Hardening + Rejection Path

**Scope:**
- Implement partial re-run on reject: when reviewer rejects specific clauses, only re-analyze those clauses (pass rejected `clauseId` list to orchestrator, specialists skip non-rejected clauses)
- Handle second HITL round (re-review after rejection): `clearReviewDecision()` before re-run, same pattern as existing reject path
- Test with edge cases: empty contracts, single-clause contracts, contracts with no flagged clauses, 200+ clause contracts
- Performance profiling on Gemma 4 31B: measure per-node timing, identify bottlenecks

**Validation:** Reject 3 clauses → specialists re-analyze only those 3 → new synthesis for those 3 → second HITL review → approve → final report reflects both rounds of review. Total time for a 50-page contract stays under 10 minutes.
