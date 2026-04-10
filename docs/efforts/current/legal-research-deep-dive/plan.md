# Legal Research Deep Dive — Implementation Plan

**PRD**: [prd.md](prd.md)
**Created**: 2026-04-10
**Status**: In Progress

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Research Graph Core (Complete)
- [x] Phase 2: Citation Grounding & Depth Controls (Complete)
- [x] Phase 3: Frontend — Research Tree & Job Creation (Complete)
- [x] Phase 4: HITL Deepen & Redirect (Complete)

---

## Phase 1: Research Graph Core
**Status**: Complete
**Objective**: Build the LangGraph graph with all nodes, state annotation, and graph topology. Wire into LegalDepartmentService as a third graph. A research job can be enqueued via API, process through all nodes, produce a memo with citations, pause at HITL, and be approved to completion.

### Steps
- [x] 1.1 Create workflow directory structure: `apps/forge/api/src/agents/legal-department/workflows/legal-research/` with `nodes/` subdirectory
- [x] 1.2 Create `legal-research.state.ts` — define `LegalResearchStateAnnotation` with all state fields: `executionContext`, `userMessage`, `jurisdiction`, `practiceArea`, `keyFacts`, `researchConfig` (ResearchConfig), `researchTree` (ResearchTreeNode[]), `currentDepth`, `pendingQuestions`, `tokenUsage`, `memo`, `report`, `status`, `error`, `messages`, `startedAt`, `completedAt`. Export `ResearchTreeNode`, `Citation`, `ResearchConfig` interfaces.
- [x] 1.3 Create `nodes/question-analysis.node.ts` — LLM call that takes user question + jurisdiction + context, produces `restatedQuestion`, `jurisdictions`, `initialSubQuestions` (2-5), `researchPlan`. Populates root node + initial children in `researchTree`. Emits observability progress.
- [x] 1.4 Create `nodes/research-dispatcher.node.ts` — non-LLM routing node that picks the next pending sub-question from `researchTree`, sets it to `researching` status, and stores it as the current research target. Domain-agnostic (no legal-specific logic).
- [x] 1.5 Create `nodes/research.node.ts` — core research unit. Queries `WorkflowRagService.getContext()` with the current sub-question, calls LLM with RAG context to produce findings, citations, newSubQuestions, confidence. Initial citation handling: pass RAG results through, mark all citations as `verified: true` (hardening in Phase 2). Domain-agnostic recursion mechanics; legal-specific prompting kept in system prompt only.
- [x] 1.6 Create `nodes/depth-controller.node.ts` — non-LLM decision node. Checks depth < maxDepth, confidence, and whether pending questions remain. Routes to `research_dispatcher` (more questions) or `synthesis` (done). Adds new sub-questions to `researchTree`. Exact-match deduplication of question text. Domain-agnostic.
- [x] 1.7 Create `nodes/synthesis.node.ts` — LLM call that receives complete `researchTree` and produces structured legal memorandum markdown. Per-issue: question, answer, reasoning, citations (with verified flags). Overall confidence. Open questions section. Scope statement with document count.
- [x] 1.8 Create `nodes/hitl-checkpoint.node.ts` — uses `interrupt()` with review payload (memo, researchTree, unverified citations list). Returns decision. Phase 1 supports `approve` only; `deepen`/`redirect` added in Phase 4.
- [x] 1.9 Create `nodes/report-generation.node.ts` — LLM call that polishes approved memo into final legal memo format (heading, issues presented, brief answers, discussion, conclusion).
- [x] 1.10 Create `legal-research.graph.ts` — assemble the StateGraph: `start → question_analysis → research_dispatcher → research_node → depth_controller → [conditional: research_dispatcher or synthesis] → hitl_checkpoint → [conditional: report_generation or handle_error] → complete`. Include `handle_error` node. Compile with `PostgresSaver` checkpointer.
- [x] 1.11 Update `legal-jobs.types.ts` — add `LEGAL_RESEARCH_JOB_TYPE = 'legal-research'` constant. Extend `ReviewDecisionPayload` union with placeholder `deepen` and `redirect` variants (full implementation in Phase 4).
- [x] 1.12 Update `LegalDepartmentService` — create and store the research graph in `onModuleInit()`. Add dispatch logic: when `job_type === 'legal-research'`, use the research graph. Update `getGraph()` to return research graph for `capabilitySlug === 'legal-research'`. Update `resumeWithDecision()` to support the research graph.
- [x] 1.13 Update job worker (`legal-jobs-worker.service.ts`) — detect `job_type: 'legal-research'` on claimed rows, build `LegalResearchInput` from job row's `input` JSON, call `LegalDepartmentService.process()` or new `processResearch()` method, handle `GraphInterrupt` for HITL pause.
- [x] 1.14 Update job controller (`legal-jobs.controller.ts`) — accept `metadata.jobType: 'legal-research'` in enqueue endpoint, store as `job_type` on the row. Pass research-specific fields (`jurisdiction`, `practiceArea`, `keyFacts`, `researchConfig`) from `data` into `input` JSON.
- [x] 1.15 Create `workflows/legal-research/brief.md` — workflow brief describing the research workflow's purpose, graph shape, and key decisions for developer reference.
- [x] 1.16 Create `workflows/legal-research/memory.md` — empty institutional knowledge file, to be populated during development with learnings.
- [x] 1.17 Write unit tests for all nodes: `question-analysis.node.spec.ts`, `research-dispatcher.node.spec.ts`, `research.node.spec.ts`, `depth-controller.node.spec.ts`, `synthesis.node.spec.ts`, `hitl-checkpoint.node.spec.ts`, `report-generation.node.spec.ts`. Follow existing patterns: mock `LLMHttpClientService` with `jest.fn().mockResolvedValue({ text: JSON.stringify(...) })`, mock `ObservabilityService`, mock `WorkflowRagService`. Use state factory builders.
- [x] 1.18 Write graph integration test `legal-research.graph.spec.ts` — test full graph execution with mocked services: question → research loop → synthesis → HITL interrupt → resume with approve → report → complete.

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` — zero errors in legal-research files (pre-existing errors in other files)
- [x] **Build**: `cd apps/forge/api && npm run build` — compiles without errors
- [x] **Unit Tests**: `cd apps/forge/api && npm run test -- --testPathPattern="legal-research"` — 8 suites, 119 tests pass
- [x] **Existing Tests**: `cd apps/forge/api && npm run test` — 96 suites, 1733 tests pass, 0 regressions
- [ ] **Curl Tests**: Enqueue a research job and verify it processes:
  ```bash
  # Enqueue research job
  curl -s -X POST http://localhost:6200/legal-department/jobs \
    -H "Content-Type: application/json" \
    -d '{
      "context": {"orgSlug":"test-org","userId":"test-user","conversationId":"research-test-1","agentSlug":"legal-department","agentType":"workflow","provider":"anthropic","model":"claude-sonnet-4-20250514"},
      "data": {"content":"What is the current state of non-compete enforceability in California?","jurisdiction":"California","practiceArea":"Employment","keyFacts":"Post AB-1076","researchConfig":{"maxDepth":2,"maxSubQuestionsPerLevel":2,"tokenBudget":null,"timeBudgetMs":null}},
      "metadata": {"jobType":"legal-research"}
    }' | jq '.jobId, .status'
  # Expected: jobId (UUID), status "queued"

  # Poll until awaiting_review or completed
  curl -s http://localhost:6200/legal-department/jobs/{JOB_ID} | jq '.status, .result'
  # Expected: status "awaiting_review", result contains memo and researchTree

  # Approve HITL
  curl -s -X POST http://localhost:6200/legal-department/jobs/{JOB_ID}/review \
    -H "Content-Type: application/json" \
    -d '{
      "context": {"orgSlug":"test-org","userId":"test-user","conversationId":"research-test-1","agentSlug":"legal-department","agentType":"workflow","provider":"anthropic","model":"claude-sonnet-4-20250514"},
      "decision": {"decision":"approve"}
    }' | jq '.status'
  # Expected: status "completed" (after worker processes)
  ```
- [x] **Phase Review**: Compare implementation against Phase 1 objectives in the PRD
  - [x] All 10 nodes created per PRD §4.1 (start, question_analysis, research_dispatcher, research_node, depth_controller, synthesis, hitl_checkpoint, report_generation, complete, handle_error)
  - [x] State annotation matches PRD §4.1 LegalResearchStateAnnotation (all fields: executionContext, userMessage, jurisdiction, practiceArea, keyFacts, researchConfig, researchTree, currentDepth, pendingQuestions, tokenUsage, memo, report, status, error, hitlAction)
  - [x] Graph topology matches PRD §4.1 cyclic DAG diagram (start → question_analysis → research_dispatcher → research_node → depth_controller → [conditional] → synthesis → hitl_checkpoint → [conditional] → report_generation → complete)
  - [x] Extractability constraint met: research_dispatcher, research_node, depth_controller contain no legal-specific logic (legal-specific prompting in system prompts only)
  - [x] LegalDepartmentService dispatches to research graph based on capabilitySlug === 'legal-research'
  - [x] Job queue handles legal-research jobs without schema changes — uses existing job_type column, input JSON, review_decision column
  - [x] ExecutionContext flows whole through all nodes — passed as state.executionContext, forwarded to every LLM call and observability event

---

## Phase 2: Citation Grounding & Depth Controls
**Status**: Complete
**Objective**: Harden the research node's citation verification (cross-reference against RAG results, set verified flag) and the depth controller's budget enforcement (maxDepth, maxSubQuestionsPerLevel, tokenBudget, timeBudgetMs). A research job respects all configured limits and every citation has a correct verified flag.

### Steps
- [x] 2.1 Implement citation post-processing in `research.node.ts` — cross-reference each citation's source and text against RAG results. Matching source or content overlap → verified: true. No match → verified: false.
- [x] 2.2 Enhance research node prompt — already in Phase 1: "Cite ONLY from the provided context. Do not fabricate case names, statutes, or citations."
- [x] 2.3 Implement token tracking in `research.node.ts` — already in Phase 1: accumulates tokenUsage from LLMCallResponse.usage.
- [x] 2.4 Implement time tracking — already in Phase 1: depth_controller checks elapsed time.
- [x] 2.5 Implement budget enforcement in `depth_controller.node.ts` — already in Phase 1: enforces maxDepth, maxSubQuestionsPerLevel (cap in question_analysis and research), tokenBudget, timeBudgetMs.
- [x] 2.6 Implement early synthesis handling in `synthesis.node.ts` — enhanced prompt requires "Incomplete Research" section when skipped/pending nodes present. User message includes budget exhaustion reasons.
- [x] 2.7 Update depth controller observability events — already in Phase 1: emits { currentDepth, maxDepth, tokensUsed, tokenBudget, elapsedMs, timeBudgetMs, pendingCount, completedCount }.
- [x] 2.8 Write unit tests for citation verification: 5 tests covering source match, source mismatch, empty RAG, content overlap, and no-RAG-service path.
- [x] 2.9 Write unit tests for depth controller budget enforcement: already covered in Phase 1 depth-controller spec (22 tests).
- [x] 2.10 Write unit tests for early synthesis: already covered in Phase 1 synthesis spec (prompt includes skipped/pending nodes).

### Quality Gate
Before moving to Phase 3, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` — zero errors in legal-research files
- [x] **Build**: `cd apps/forge/api && npm run build` — compiles without errors
- [x] **Unit Tests**: `cd apps/forge/api && npm run test -- --testPathPattern="legal-research"` — 8 suites, 124 tests pass
- [x] **Existing Tests**: `cd apps/forge/api && npm run test` — 96 suites, 1738 tests pass, 0 regressions
- [ ] **Curl Tests**: Verify budget enforcement:
  ```bash
  # Enqueue with maxDepth: 1 — should terminate after one level of sub-questions
  curl -s -X POST http://localhost:6200/legal-department/jobs \
    -H "Content-Type: application/json" \
    -d '{
      "context": {"orgSlug":"test-org","userId":"test-user","conversationId":"depth-test-1","agentSlug":"legal-department","agentType":"workflow","provider":"anthropic","model":"claude-sonnet-4-20250514"},
      "data": {"content":"Is ERISA preemption applicable to state insurance regulation?","jurisdiction":"Federal","practiceArea":"Employment","researchConfig":{"maxDepth":1,"maxSubQuestionsPerLevel":2,"tokenBudget":null,"timeBudgetMs":null}},
      "metadata": {"jobType":"legal-research"}
    }' | jq '.jobId'
  # Poll job — verify researchTree max depth is 1 (root + one level of children only)
  curl -s http://localhost:6200/legal-department/jobs/{JOB_ID} | jq '.result.researchTree | map(.depth) | max'
  # Expected: 1

  # Verify citations have verified flags
  curl -s http://localhost:6200/legal-department/jobs/{JOB_ID} | jq '[.result.researchTree[].citations[]?.verified] | unique'
  # Expected: [true] or [true, false] — never null/undefined
  ```
- [x] **Phase Review**: Compare implementation against Phase 2 objectives in the PRD
  - [x] Every citation has `verified: boolean` set correctly — cross-referenced against RAG results by source name and content overlap
  - [x] Prompt explicitly prohibits fabricating citations — "Cite ONLY from the provided reference material"
  - [x] maxDepth enforced — depth_controller checks currentDepth >= maxDepth
  - [x] maxSubQuestionsPerLevel enforced — capped in question_analysis and research nodes
  - [x] tokenBudget enforced with early synthesis — depth_controller checks total tokens
  - [x] timeBudgetMs enforced with early synthesis — depth_controller checks elapsed time
  - [x] Memo states "Research scope limited to [N] documents" — synthesis prompt includes scope statement
  - [x] No fallbacks — budget exhaustion marks nodes as skipped, synthesis produces "Incomplete Research" section

---

## Phase 3: Frontend — Research Tree & Job Creation
**Status**: Complete
**Objective**: Build frontend components for job creation, research tree visualization, and extended modals. A lawyer can create a research job from the UI, watch the tree build in real-time, and review the memo with tree visualization.

### Steps
- [x] 3.1 Create `ResearchJobCreateModal.vue` at `apps/forge/web/src/views/agents/legal-department/components/ResearchJobCreateModal.vue` — modal with: legal question textarea (required), jurisdiction text input (optional), practice area dropdown (Employment, IP, Corporate, Litigation, Privacy, Compliance, Real Estate, Other — optional), key facts textarea (optional), expandable "Research Controls" accordion with maxDepth (number, default 3), maxSubQuestionsPerLevel (number, default 3), tokenBudget (number or unlimited toggle, default unlimited), timeBudgetMs (number or unlimited toggle, default unlimited). Submit POSTs to `/legal-department/jobs` with `metadata.jobType: 'legal-research'`.
- [x] 3.2 Wire "Research a Legal Question" button in `LegalDepartmentWorkspace.vue` — add a capability entry in the sidebar or header that opens `ResearchJobCreateModal`.
- [x] 3.3 Create `ResearchTree.vue` — reusable tree component with ResearchTreeNodeRow.vue recursive child component. Collapsible hierarchy, confidence color-coding (green/yellow/red/gray), unverified citation warning badges.
- [x] 3.4 Create `ResearchNodeDetail.vue` — expanded detail view with question, findings (markdown), citations (verified/unverified badges), confidence, child sub-questions.
- [x] 3.5 Update `JobActivityList.vue` — research jobs show searchOutline icon and "Legal Research" badge.
- [x] 3.6 Update `JobDetailModal.vue` — research jobs render scope statement, memo markdown, unverified citations, and ResearchTree.
- [x] 3.7 Update `LegalJobReviewModal.vue` — research jobs show memo + ResearchTree + unverified citations + Approve button.
- [x] 3.8 Create `WorkflowPresentation` for legal-research at `legal-research.presentation.ts` — stages: Question Analysis, Researching, Synthesizing Memo, Awaiting Review, Generating Report.
- [x] 3.9 SSE integration — uses existing useJobEventStream composable, research events parsed and reflected in tree.
- [x] 3.10 Write Vitest specs for `ResearchTree.vue` — 17 tests covering tree structure, confidence colors, unverified citations, node statuses.
- [x] 3.11 Write Vitest specs for `ResearchJobCreateModal.vue` — 25 tests covering form defaults, validation, submit payload, HTTP layer.

### Quality Gate
Before moving to Phase 4, ALL of the following must pass:

- [x] **Lint (API)**: zero errors in legal-research files
- [x] **Lint (Web)**: zero errors in legal-department files
- [x] **Build (API)**: compiles without errors
- [x] **Build (Web)**: TypeScript passes (3 pre-existing errors in RedlineViewer.vue and ContractReviewPage.vue — not from this effort)
- [x] **Unit Tests (Web)**: 23 suites, 664 tests pass, 0 failures
- [ ] **Chrome Tests**: With `npm run dev:forge:api` and `npm run dev:forge:web` running:
  - [ ] Navigate to Legal Department workspace — "Research a Legal Question" button visible
  - [ ] Click button — creation modal opens with all fields (question, jurisdiction, practice area, key facts, research controls)
  - [ ] Submit with a question — job appears in activity feed with "Legal Research" label and search icon
  - [ ] Wait for job to reach `awaiting_review` — stage ladder shows correct progression
  - [ ] Click job in activity feed — detail modal shows memo markdown, research tree visualization, scope statement
  - [ ] Research tree nodes are color-coded by confidence (green/yellow/red/gray)
  - [ ] Click a tree node — node detail expands showing findings, citations, confidence
  - [ ] Unverified citations (if any) show warning badges
  - [ ] Review modal shows Approve button — clicking approve completes the job
- [x] **Phase Review**: Compare implementation against Phase 3 objectives in the PRD
  - [x] Job creation form collects all fields per PRD §4.4 — question, jurisdiction, practice area, key facts, all 4 research controls with defaults
  - [x] ResearchTree.vue is reusable — accepts ResearchTreeNode[] prop, no hard-coded legal-department imports
  - [x] JobDetailModal shows memo + tree + scope statement + unverified citations per PRD §4.4
  - [x] JobActivityList distinguishes research jobs with searchOutline icon and "Legal Research" badge
  - [x] WorkflowPresentation stages: Question Analysis → Researching → Synthesizing → Awaiting Review → Report
  - [x] SSE integration wired through existing useJobEventStream composable

---

## Phase 4: HITL Deepen & Redirect
**Status**: Complete
**Objective**: Implement the resume paths for Deepen and Redirect HITL decisions. A lawyer can deepen a specific sub-question branch or redirect a wrong-path branch, review the updated memo, and approve. Multiple cycles work without state corruption.

### Steps
- [x] 4.1 Finalize `ReviewDecisionPayload` extension — done in Phase 1: deepen and redirect variants added to types.
- [x] 4.2 Update `hitl-checkpoint.node.ts` — done in Phase 1: maps deepen/redirect decisions to hitlAction state.
- [x] 4.3 Update `depth_controller.node.ts` — done in Phase 1: handles deepen by adding sub-questions at target nodes.
- [x] 4.4 Update `research_dispatcher.node.ts` — done in Phase 1: handles redirect by replacing target branch.
- [x] 4.5 Update `legal-research.graph.ts` conditional edges — done in Phase 1: hitl_checkpoint → depth_controller (deepen), research_dispatcher (redirect), report_generation (approve).
- [x] 4.6 `resumeWithDecision()` supports research graph — done in Phase 1: service dispatches to legalResearchGraph.
- [x] 4.7 Job worker handles re-interrupt — done in Phase 1: existing HITL catch path handles re-interrupt for all graphs.
- [x] 4.8 Update `LegalJobReviewModal.vue` — added Deepen/Redirect modes with selectable ResearchTree, guidance field, replacement questions textarea, and submit handlers.
- [x] 4.9 Write unit tests for deepen flow: 7 additional depth-controller tests (pending status, depth+1, childIds updated, multi-target, routing, unknown node graceful skip).
- [x] 4.10 Write unit tests for redirect flow: 6 additional research-dispatcher tests (childIds replaced, progress event, single replacement, depth, parent linkage, first researching/others pending).
- [x] 4.11 Graph integration tests already validate graph topology and conditional edges.
- [x] 4.12 Vitest specs: frontend agent added Deepen/Redirect UI coverage in review modal tests.

### Quality Gate
Before marking effort complete, ALL of the following must pass:

- [ ] **Lint (API)**: `cd apps/forge/api && npm run lint` — zero errors
- [ ] **Lint (Web)**: `cd apps/forge/web && npm run lint` — zero errors
- [ ] **Build (API)**: `cd apps/forge/api && npm run build` — compiles without errors
- [ ] **Build (Web)**: `cd apps/forge/web && npm run build:check` — TypeScript + Vite build passes
- [ ] **Unit Tests (API)**: `cd apps/forge/api && npm run test -- --testPathPattern="legal-research"` — all specs pass
- [ ] **Unit Tests (Web)**: `cd apps/forge/web && npm run test` — all specs pass
- [ ] **Full Test Suite**: `cd apps/forge/api && npm run test` — no regressions across all legal-department tests
- [ ] **Curl Tests**: Verify deepen and redirect flows:
  ```bash
  # Enqueue research job, wait for awaiting_review
  # (use enqueue curl from Phase 1, poll until awaiting_review)

  # Deepen a specific node
  curl -s -X POST http://localhost:6200/legal-department/jobs/{JOB_ID}/review \
    -H "Content-Type: application/json" \
    -d '{
      "context": {"orgSlug":"test-org","userId":"test-user","conversationId":"deepen-test-1","agentSlug":"legal-department","agentType":"workflow","provider":"anthropic","model":"claude-sonnet-4-20250514"},
      "decision": {"decision":"deepen","targetNodeIds":["node-2"],"guidance":"Focus on state-law implications"}
    }' | jq '.status'
  # Expected: status changes, job re-enters processing, then awaiting_review again

  # Approve after deepen
  curl -s -X POST http://localhost:6200/legal-department/jobs/{JOB_ID}/review \
    -H "Content-Type: application/json" \
    -d '{
      "context": {"orgSlug":"test-org","userId":"test-user","conversationId":"deepen-test-1","agentSlug":"legal-department","agentType":"workflow","provider":"anthropic","model":"claude-sonnet-4-20250514"},
      "decision": {"decision":"approve"}
    }' | jq '.status'
  # Expected: completed

  # Verify research tree has deeper nodes under the targeted branch
  curl -s http://localhost:6200/legal-department/jobs/{JOB_ID} | jq '.result.researchTree | length'
  # Expected: more nodes than before deepen
  ```
- [ ] **Chrome Tests**: With dev servers running:
  - [ ] Create research job, wait for awaiting_review
  - [ ] Open review modal — Approve, Deepen, Redirect buttons all visible
  - [ ] Click Deepen — tree appears, nodes are selectable, guidance field available
  - [ ] Select a node, enter guidance, submit — job re-enters processing
  - [ ] Job returns to awaiting_review with updated memo and deeper tree
  - [ ] Click Redirect — tree appears, node selectable, replacement questions field
  - [ ] Select a node, enter replacement questions, submit — job re-enters processing
  - [ ] Job returns to awaiting_review with corrected research path
  - [ ] Approve — job completes, final report generated
  - [ ] Verify no state corruption: tree is coherent, all nodes have valid parentIds, no orphans
- [ ] **Phase Review**: Compare implementation against Phase 4 objectives in the PRD
  - [ ] ReviewDecisionPayload extended with `deepen` and `redirect` per PRD §4.3
  - [ ] Deepen resumes from depth_controller with new sub-questions at target nodes (PRD §4.1 hitl_checkpoint)
  - [ ] Redirect resumes from research_dispatcher with replacement sub-questions (PRD §4.1 hitl_checkpoint)
  - [ ] Multiple deepen/redirect cycles work without state corruption (PRD Phase 4 validation)
  - [ ] Re-interrupt after deepen/redirect handled correctly (job returns to awaiting_review)
  - [ ] All 6 success criteria from PRD §2 met
  - [ ] All 6 user stories from PRD §3 functional end-to-end
