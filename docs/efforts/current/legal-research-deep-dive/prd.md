# Legal Research Deep Dive — Product Requirements Document

## 1. Overview

The Legal Research Deep Dive adds a second LangGraph workflow to the Legal Department workspace in Forge: a **recursive depth-first research engine** that takes a legal question, decomposes it into sub-questions, researches each recursively with RAG-grounded citations, and synthesizes the results into a structured legal memorandum.

This is the second capability in the Legal Department (after document analysis / contract review). It introduces the **recursive research pattern** — question → research → sub-questions → depth control → synthesis — which is the most reused pattern across the 10-workflow Legal Department sequence (reused by workflows #3, #4, #6, #8, #9, #10).

The workflow is a new LangGraph graph (`legal-research.graph.ts`), separate from `legal-department.graph.ts` and `contract-review.graph.ts`. It shares the same async job queue (`law.agent_jobs`), HITL infrastructure, checkpointer, observability, and workspace frontend, but has its own state, nodes, and graph topology.

## 2. Goals & Success Criteria

### Goals

1. **Deliver a recursive research workflow** that identifies sub-questions, researches each with RAG-grounded citations, tracks depth, detects convergence, and synthesizes into a legal memorandum.
2. **Guarantee citation integrity** — every citation comes from a grounded RAG source with a `verified` boolean. No hallucinated citations. Ever.
3. **Provide depth and cost controls** — configurable max depth, max sub-questions per level, token budget, and time budget that are visible at job creation and enforced during execution.
4. **Build a research tree visualization** — a `ResearchTree.vue` component that renders the question/sub-question hierarchy with confidence color-coding and drill-down.
5. **Enable HITL review** — lawyers can approve the memo, deepen specific sub-questions, or redirect research on a different path.
6. **Structure the recursive pattern for future extraction** — the recursion mechanics (depth tracking, convergence detection, sub-question generation) should not hardcode legal-specific logic, enabling extraction as a reusable sub-graph for workflow #3 (Adversarial Brief) and beyond.

### Success Criteria

- A lawyer can submit a legal question with jurisdiction and context, and receive a structured legal memorandum organized by issue/sub-issue.
- Every citation in the memo has `verified: true` (came from RAG) or `verified: false` with a visible warning. Zero fabricated citations.
- The research tree is visible in the frontend, color-coded by confidence, with drill-down to individual sub-question research outputs.
- Depth and cost controls are configurable at job creation and enforced — the workflow synthesizes early when limits are hit.
- HITL supports approve, deepen (resume from depth controller with new sub-questions), and redirect (replay from research node with corrected sub-questions).
- The memo states "Research scope limited to [N] documents in the organization's legal knowledge base" so the lawyer knows the research is bounded.

## 3. User Stories / Use Cases

### US-1: Legal Question Submission
A lawyer navigates to the Legal Department workspace, clicks "Research a Legal Question" in the capabilities sidebar, enters their question (e.g., "Can we enforce this non-compete in California post-AB 1076?"), specifies jurisdiction (California), practice area (Employment), and any relevant key facts. They configure depth/cost limits or accept defaults. The job appears in the activity feed.

### US-2: Research Progress Monitoring
While the job processes, the lawyer sees the research tree building in real-time via SSE events. Sub-questions appear as branches, each showing its status (researching, answered, pending). The stage ladder shows the current phase (question analysis → research → synthesis).

### US-3: Memo Review (HITL)
When the research completes, the job enters `awaiting_review`. The lawyer opens the review modal and sees:
- The structured legal memorandum with issue-by-issue analysis
- The research tree with confidence ratings
- Unverified citations highlighted prominently
- Options: Approve, Deepen (select specific sub-questions for further research), Redirect (replace a sub-question's research direction)

### US-4: Deepen Research
The lawyer reviews the memo and decides the analysis of ERISA preemption is insufficiently deep (medium confidence). They select the ERISA sub-question node and click "Deepen" with optional guidance. The workflow resumes from the depth controller, generating new sub-questions under the ERISA branch, researching them, and producing an updated memo.

### US-5: Redirect Research
The lawyer sees the workflow went down the wrong path on a sub-question — it researched federal preemption when the question was about state-law preemption. They click "Redirect" on that node, provide corrected sub-questions, and the workflow replays from the research node with the new direction.

### US-6: Bounded Research Awareness
The memo header clearly states "Research scope limited to 247 documents in the [org]'s legal knowledge base." The lawyer understands the research is bounded by what's been ingested into RAG and does not assume comprehensive coverage.

## 4. Technical Requirements

### 4.1 Architecture

#### New LangGraph Graph: `legal-research.graph.ts`

Location: `apps/forge/api/src/agents/legal-department/workflows/legal-research/`

Following the established pattern from `contract-review/`, this is a separate graph with its own state annotation, nodes, and topology. It shares:
- The same `LegalDepartmentService` (which dispatches to the correct graph based on `job_type`)
- The same `PostgresCheckpointerService` for state persistence
- The same `LLMHttpClientService`, `ObservabilityService`, and `WorkflowRagService`
- The same async job queue (`law.agent_jobs`) with a new `job_type: 'legal-research'`

**Extractability constraint**: The recursion mechanics — `research_dispatcher`, `research_node`, `depth_controller`, and their state fields (`researchTree`, `currentDepth`, `pendingQuestions`, `researchConfig`) — must not hardcode legal-specific logic. Legal-domain specifics (jurisdiction, practice area, legal memo structure) live in `question_analysis`, `synthesis`, and `report_generation`. This separation enables the recursive core to be extracted as a reusable LangGraph sub-graph for Adversarial Brief (#3) and downstream workflows.

#### Graph Topology (Cyclic DAG with Depth Tracking)

```
__start__ → start → question_analysis → research_dispatcher → research_node → depth_controller → [conditional]
                                                                                    ├─ research_dispatcher (more sub-questions)
                                                                                    └─ synthesis → hitl_checkpoint → [conditional]
                                                                                                                        ├─ report_generation → complete
                                                                                                                        ├─ depth_controller (deepen)
                                                                                                                        └─ research_dispatcher (redirect)
                                                                          handle_error ← (any node on failure)
```

**Nodes:**

1. **`start`** — Initialize workflow, emit observability started event.

2. **`question_analysis`** — LLM call that receives the user's question, jurisdiction, and context. Produces:
   - `restatedQuestion`: precise, unambiguous restatement
   - `jurisdictions`: in-scope jurisdictions
   - `initialSubQuestions`: 2–5 sub-questions with priorities
   - `researchPlan`: ordering and source strategy
   
3. **`research_dispatcher`** — Non-LLM routing node. Takes the next batch of pending sub-questions from the research tree, emits observability progress events, and routes each to the research node. Handles sequential processing of sub-questions at the current depth level.

4. **`research_node`** — The core research unit. For a single sub-question:
   - Queries the RAG collection via `WorkflowRagService.getContext()` with the sub-question as query. The research node treats `WorkflowRagService` as its **pluggable source interface** — it never calls RAG providers directly. Future source adapters (Courtlistener, Google Scholar Legal) can be added behind `WorkflowRagService` without modifying the research node.
   - Receives RAG results with document references and content chunks
   - Calls LLM with the RAG context + sub-question to produce:
     - `findings`: 2–4 paragraph summary
     - `citations`: array of `{ text, source, documentId, chunkId, verified: boolean, relevanceScore }` — citations derived from RAG results have `verified: true`; any citation the LLM asserts without RAG backing gets `verified: false`
     - `newSubQuestions`: 0–3 emergent sub-questions
     - `confidence`: `'high' | 'medium' | 'low'`
   - **Critical: citation grounding.** The prompt instructs the LLM to cite ONLY from the provided RAG context. Post-processing cross-references every citation against the RAG results. Citations not traceable to a RAG chunk are marked `verified: false`.

5. **`depth_controller`** — Non-LLM decision node. Receives research node output and decides routing:
   - If new sub-questions exist AND `currentDepth < maxDepth` AND confidence is not high AND token/time budget not exhausted: add sub-questions to the research tree, route to `research_dispatcher`
   - If max depth reached OR all sub-questions answered with high confidence OR budget exhausted: route to `synthesis`
   - Tracks the full research tree to prevent circular research (exact-match deduplication of sub-question text)
   - Emits observability events with tree state and budget consumption

6. **`synthesis`** — LLM call that receives the complete research tree and produces:
   - Structured legal memorandum organized by issue/sub-issue
   - Per-issue: question, answer, reasoning, supporting citations (with verified flags)
   - Per-issue confidence assessment
   - Overall confidence assessment
   - "Open questions" section for unresolved items
   - Scope statement: "Research scope limited to [N] documents in [org]'s legal knowledge base"

7. **`hitl_checkpoint`** — Uses `interrupt()` (same pattern as existing HITL nodes). The review payload includes the memo, research tree, and unverified citation list. Attorney options:
   - **Approve** → route to `report_generation`
   - **Deepen** → route to `depth_controller` with specified sub-questions and increased depth allowance
   - **Redirect** → route to `research_dispatcher` with corrected sub-questions replacing the targeted branch

8. **`report_generation`** — LLM call that polishes the approved memo into final markdown format with proper legal memo structure (heading, issues presented, brief answers, discussion, conclusion).

9. **`complete`** — Emit observability completed event, finalize state.

10. **`handle_error`** — Emit observability failed event. Errors propagate — no silent swallowing.

#### State Annotation: `LegalResearchStateAnnotation`

New state annotation specific to this workflow (following the pattern where contract-review reuses `LegalDepartmentStateAnnotation` — but research has fundamentally different state needs):

```typescript
interface ResearchTreeNode {
  id: string;                    // Unique node ID
  parentId: string | null;       // null for root
  question: string;              // The sub-question
  depth: number;                 // 0 = root question, 1 = first sub-questions, etc.
  status: 'pending' | 'researching' | 'answered' | 'skipped';
  findings?: string;             // Research summary
  citations?: Citation[];        // Grounded citations
  confidence?: 'high' | 'medium' | 'low';
  childIds: string[];            // Sub-question node IDs
}

interface Citation {
  text: string;                  // The cited passage
  source: string;                // Document filename / identifier
  documentId: string;            // RAG document ID
  chunkId: string;               // RAG chunk ID
  verified: boolean;             // true = traceable to RAG result
  relevanceScore: number;        // 0-1
}

interface ResearchConfig {
  maxDepth: number;              // Default 3
  maxSubQuestionsPerLevel: number; // Default 3
  tokenBudget: number | null;    // null = unlimited
  timeBudgetMs: number | null;   // null = unlimited
}

// State fields:
// executionContext: ExecutionContext
// userMessage: string (the original question)
// jurisdiction: string
// practiceArea: string
// keyFacts: string
// researchConfig: ResearchConfig
// researchTree: ResearchTreeNode[]
// currentDepth: number
// pendingQuestions: string[] (queue of sub-question IDs to research next)
// tokenUsage: { input: number, output: number }
// startedAt: number
// memo: string | undefined (synthesized memo)
// report: string | undefined (final polished report)
// status, error, messages, etc.
```

### 4.2 Data Model Changes

#### `law.agent_jobs` Table — No Schema Changes

The existing table supports this workflow without modification:
- `job_type`: new value `'legal-research'` (existing column, text type)
- `input`: stores the research question, jurisdiction, practice area, key facts, and research config as JSON
- `result`: stores the final memo, research tree, and citations as JSON
- `review_decision`: stores the HITL decision (approve/deepen/redirect) — existing column

#### No New Tables Required

The research tree lives in the LangGraph state (checkpointed via `PostgresSaver`). The job queue row's `result` JSON contains the final tree for frontend consumption. No separate tree table needed.

### 4.3 API Changes

#### New Job Type in Existing Endpoints

The Legal Department's job endpoints already support multiple job types via the `job_type` field. Changes:

**POST `/legal-department/jobs`** — Enqueue a research job:
```json
{
  "context": { "orgSlug": "...", "userId": "...", "conversationId": "...", "agentSlug": "legal-department", "agentType": "workflow", "provider": "...", "model": "..." },
  "data": {
    "content": "Can we enforce this non-compete in California post-AB 1076?",
    "jurisdiction": "California",
    "practiceArea": "Employment",
    "keyFacts": "Employee signed non-compete in 2019, left company in 2024...",
    "researchConfig": {
      "maxDepth": 3,
      "maxSubQuestionsPerLevel": 3,
      "tokenBudget": null,
      "timeBudgetMs": null
    }
  },
  "metadata": { "jobType": "legal-research" }
}
```

The controller reads `metadata.jobType` to determine which graph to dispatch to (existing pattern: `outputMode` already dispatches between document-analysis and contract-review graphs).

**POST `/legal-department/jobs/:id/review`** — Extended decision type:
```json
{
  "context": { ... },
  "decision": { "decision": "deepen", "targetNodeIds": ["node-5", "node-8"], "guidance": "Focus on state-law preemption, not federal" }
}
// or
{
  "context": { ... },
  "decision": { "decision": "redirect", "targetNodeId": "node-3", "replacementQuestions": ["Does California AB 1076 apply retroactively?"] }
}
```

`ReviewDecisionPayload` union extended with `deepen` and `redirect` variants.

**GET `/legal-department/jobs/:id`** — No changes. The `result` field contains the research tree and memo.

**GET `/legal-department/jobs/:id/events`** — No changes. Observability events flow through the existing durable event history endpoint.

### 4.4 Frontend Changes

#### Capabilities Sidebar

The Legal Department workspace's `JobActivityList.vue` already displays jobs from `law.agent_jobs`. Research jobs appear automatically with `job_type: 'legal-research'`. The activity list shows them with a distinct icon/label ("Legal Research" vs "Document Analysis" vs "Contract Review").

#### Job Creation Form

A new component or modal for "Research a Legal Question" that collects:
- Legal question (textarea, required)
- Jurisdiction (text input, optional)
- Practice area (dropdown: Employment, IP, Corporate, Litigation, Privacy, Compliance, Real Estate, Other — optional)
- Key facts (textarea, optional)
- Research depth controls (accordion/expandable, defaults pre-filled):
  - Max depth (number, default 3)
  - Max sub-questions per level (number, default 3)
  - Token budget (number or "unlimited", default unlimited)
  - Time budget (number or "unlimited", default unlimited)

#### Research Tree Visualization: `ResearchTree.vue`

A new reusable component at `apps/forge/web/src/views/agents/legal-department/components/ResearchTree.vue`:

- **Layout**: Collapsible tree rendering the `ResearchTreeNode[]` hierarchy
- **Root node**: The original restated question
- **Branch nodes**: Sub-questions with their research status
- **Leaf nodes**: Terminal sub-questions (high confidence or max depth)
- **Color coding**: Green (high confidence), Yellow (medium), Red (low), Gray (pending/skipped)
- **Click interaction**: Clicking a node shows the full research output (findings, citations, new sub-questions) in a side panel or expandable section
- **Unverified citation highlighting**: Nodes with `verified: false` citations show a warning badge
- **Live updates**: During processing, nodes update from pending → researching → answered via SSE events

This component is designed to be reusable for Adversarial Brief (#3 — debate tree) and Persistent Case Team (#10 — knowledge graph).

#### Job Detail Modal

The existing `JobDetailModal.vue` is extended for `legal-research` jobs to show:
- The structured legal memorandum (rendered markdown)
- The research tree (via `ResearchTree.vue`)
- Scope statement prominently displayed
- Unverified citations listed with warnings

#### Review Modal

The existing `LegalJobReviewModal.vue` is extended for `legal-research` jobs:
- Shows the memo + research tree
- Unverified citations highlighted with prominent warnings — lawyer must acknowledge each
- Three decision buttons: Approve, Deepen, Redirect
- **Deepen**: Opens a sub-panel showing the tree. Lawyer clicks nodes to select for deeper research. Optional guidance text field.
- **Redirect**: Opens a sub-panel showing the tree. Lawyer clicks a node to redirect. Enters replacement sub-questions.

#### Workflow Presentation

A new `WorkflowPresentation` definition for `legal-research` that maps observability events to stage ladder states:
- Question Analysis
- Researching (with sub-stage showing current depth/question)
- Depth Control Decision
- Synthesizing Memo
- Awaiting Review
- Generating Report
- Complete

### 4.5 Infrastructure Requirements

No new infrastructure. The workflow uses existing services:

| Dependency | How Used | Already Exists |
|-----------|----------|----------------|
| `LLMHttpClientService` | All LLM calls (question analysis, research, synthesis, report) | Yes |
| `WorkflowRagService` | RAG queries for citation grounding | Yes |
| `PostgresCheckpointerService` | LangGraph state persistence and HITL resume | Yes |
| `ObservabilityService` | Progress events, SSE streaming | Yes |
| `law.agent_jobs` table | Async job queue | Yes |
| Provider concurrency gating | Slot reservation per provider | Yes |

## 5. Non-Functional Requirements

### Performance
- Question analysis node: < 15 seconds
- Each research node: < 30 seconds (LLM call + RAG query)
- Synthesis node: < 60 seconds (processes full tree)
- Total workflow at default depth (3 levels, 3 sub-questions): typically 5–15 minutes depending on model speed
- SSE events emitted at each node transition for real-time progress

### Security
- Citation grounding is safety-critical. The research node prompt explicitly instructs the LLM to cite ONLY from provided RAG context. Post-processing verifies every citation against RAG results. This is not a "nice to have" — hallucinated citations in legal work cause sanctions, malpractice, and reputational harm.
- ExecutionContext flows whole through all nodes. No construction in backend.
- Job access scoped by `org_slug` (existing pattern).

### Scalability
- Recursive depth is bounded by `maxDepth` and `maxSubQuestionsPerLevel`. Worst case at defaults: 1 + 3 + 9 + 27 = 40 research node executions. Token budget and time budget provide additional backstops.
- Provider concurrency gating (existing) prevents overloading local models like Ollama.

### Compatibility
- Works with all LLM providers supported by `LLMHttpClientService` (Ollama, OpenRouter, Azure, Vertex AI).
- Works with all RAG providers supported by `RAG_STORAGE_SERVICE` (Supabase, PostgreSQL, SQL Server).
- Sovereign mode: when `context.sovereignMode === true`, uses local models only (existing behavior).

## 6. Out of Scope

- **External legal database integrations** (Courtlistener, PACER, Google Scholar Legal, state court feeds). The architecture supports pluggable sources via `WorkflowRagService`, but this effort uses RAG collections only. Adapters are a follow-up.
- **Case law update monitoring** (alerting when a cited case is overruled). That's Portfolio Sentinel (#6) territory.
- **Comparative jurisdiction analysis** ("How does this differ across 50 states?"). Requires a parallel-research graph structure, not recursive depth-first. Future enhancement.
- **Brief/memo formatting templates** (firm-branded memo export with caption, table of authorities). Output is structured markdown. Formatting is a future export feature.
- **Semantic deduplication of sub-questions**. The intention requires "preventing circular research" — this effort satisfies that with exact-match deduplication (the depth controller tracks question text and prevents re-research of identical questions). Semantic similarity deduplication (detecting that two differently-worded sub-questions ask the same thing) is a v2 optimization.

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| Legal Department async workspace | Completed | Job queue, HITL, SSE — all in place |
| Legal Department HITL infrastructure | Completed | `interrupt()`/`Command({resume})` pattern proven |
| RAG collections in database | Existing | `WorkflowRagService` with hybrid search operational |
| Contract Review (#1) settled | Completed | Specialist infrastructure and annotation format stable |
| LangGraph cyclic graph support | Available | LangGraph supports cycles via conditional edges — the contract-review reject loop is a proof point |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM generates citations not in RAG context | Critical | Post-processing cross-references every citation against RAG result set. Unverified citations marked `verified: false` and highlighted in review. Prompt explicitly prohibits inventing citations. |
| Recursive research runs away (exponential branching) | High | Hard limits: maxDepth (default 3), maxSubQuestionsPerLevel (default 3), tokenBudget, timeBudgetMs. Depth controller enforces all four. |
| RAG collection has insufficient coverage for the question | Medium | Memo explicitly states scope limitation. "Open questions" section lists unresolvable items. The lawyer is never led to believe research is comprehensive when it isn't. |
| LangGraph state size grows large with deep research trees | Medium | Research tree nodes store findings summaries, not raw RAG chunks. Citations store references (documentId, chunkId), not full text. Synthesis receives the tree but the checkpoint stores deltas. |
| HITL deepen/redirect adds complexity to resume path | Medium | Deepen and redirect are encoded as `ReviewDecisionPayload` variants, handled by the same `resumeWithDecision()` pattern. The depth controller interprets the decision type and routes accordingly. |

## 8. Phasing

### Phase 1: Research Graph Core

Build the LangGraph graph with all nodes, state annotation, and graph topology. Wire into `LegalDepartmentService` as a third graph (alongside document-analysis and contract-review).

**Deliverables:**
- `workflows/legal-research/legal-research.graph.ts` — graph definition
- `workflows/legal-research/legal-research.state.ts` — state annotation with ResearchTreeNode, Citation, ResearchConfig
- `workflows/legal-research/nodes/question-analysis.node.ts`
- `workflows/legal-research/nodes/research-dispatcher.node.ts`
- `workflows/legal-research/nodes/research.node.ts` — with RAG-grounded citation verification
- `workflows/legal-research/nodes/depth-controller.node.ts`
- `workflows/legal-research/nodes/synthesis.node.ts`
- `workflows/legal-research/nodes/hitl-checkpoint.node.ts`
- `workflows/legal-research/nodes/report-generation.node.ts`
- `LegalDepartmentService` updated to create and dispatch to the research graph
- `legal-jobs.types.ts` updated with `LEGAL_RESEARCH_JOB_TYPE` and extended `ReviewDecisionPayload`
- Job worker updated to dispatch `legal-research` jobs to the research graph
- `workflows/legal-research/brief.md` and `memory.md`

**Validation:** A research job can be enqueued via API, processes through all nodes, produces a memo with citations, pauses at HITL, and can be approved to completion.

### Phase 2: Citation Grounding & Depth Controls

Harden the research node's citation verification and the depth controller's budget enforcement.

**Deliverables:**
- Citation post-processing: cross-reference every citation against RAG query results, set `verified` flag
- Depth controller: enforce `maxDepth`, `maxSubQuestionsPerLevel`, `tokenBudget`, `timeBudgetMs`
- Token counting integration: track cumulative token usage across all research node executions
- Time tracking: cumulative elapsed time checked at each depth controller pass
- Early synthesis: when budget is exhausted, depth controller routes to synthesis with partial tree
- Research node prompt engineering: explicit instructions to cite only from provided context

**Validation:** A research job with `maxDepth: 2` terminates at depth 2. A job with a low token budget synthesizes early. All citations in the memo have correct `verified` flags.

### Phase 3: Frontend — Research Tree & Job Creation

Build the frontend components for job creation, research tree visualization, and extended review modal.

**Deliverables:**
- Job creation form/modal for "Research a Legal Question" with depth/cost controls
- `ResearchTree.vue` — reusable tree visualization component
- `JobDetailModal.vue` extended for `legal-research` jobs (memo + tree + scope statement)
- `LegalJobReviewModal.vue` extended with Deepen and Redirect flows
- `WorkflowPresentation` definition for `legal-research` stage ladder
- `JobActivityList.vue` updated with distinct icon/label for research jobs
- SSE integration: live tree updates during processing

**Validation:** A lawyer can create a research job from the UI, watch the tree build in real-time, review the memo with tree visualization, and use Deepen/Redirect.

### Phase 4: HITL Deepen & Redirect

Implement the resume paths for Deepen and Redirect decisions.

**Deliverables:**
- Extended `ReviewDecisionPayload` with `deepen` and `redirect` variants
- `hitl-checkpoint.node.ts`: encode deepen/redirect into graph state
- `depth_controller`: handle deepen decision (add sub-questions at specified nodes, increase local depth allowance)
- `research_dispatcher`: handle redirect decision (replace target branch's sub-questions)
- `resumeWithDecision()` path for research graph
- Job worker: handle re-interrupt after deepen/redirect (lawyer may review again)

**Validation:** A lawyer can deepen a specific sub-question branch, review the updated memo, and approve. A lawyer can redirect a wrong-path branch, review the corrected memo, and approve. Multiple deepen/redirect cycles work without state corruption.
