# Contract Review & Redlining — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-09
**Status**: Not Started

## Progress Tracker

- [x] Phase 1: Types, State, and Clause Segmentation
- [ ] Phase 2: Specialist Prompt Updates
- [ ] Phase 3: Synthesis, Report Generation, and HITL
- [ ] Phase 4: Frontend — RedlineViewer and Per-Clause HITL
- [ ] Phase 5: Hardening and Rejection Path

---

## Phase 1: Types, State, and Clause Segmentation

**Status**: Complete
**Objective**: Define all new types, extend the state annotation, implement clause segmentation in the intelligence service, and update the worker to detect contract-review jobs.

### Steps

- [x] 1.1 Add new types to `apps/forge/api/src/agents/legal-department/legal-department.types.ts`:
  - `ClauseMap`, `ClauseMapEntry` (with `entryType`, `sectionLevel` fields)
  - `ClauseAnnotation`
  - `ClauseSynthesis`, `RedlineOutput`
  - `ClauseDecision`, `ClauseReviewPayload`

- [x] 1.2 Add three new fields to `apps/forge/api/src/agents/legal-department/legal-department.state.ts`:
  - `outputMode: Annotation<'analysis' | 'contract-review'>` (default `'analysis'`)
  - `clauseMap: Annotation<ClauseMap | undefined>` (default `undefined`)
  - `redlineOutput: Annotation<RedlineOutput | undefined>` (default `undefined`)

- [x] 1.3 Implement `segmentClauses()` method in `apps/forge/api/src/agents/legal-department/services/legal-intelligence.service.ts`:
  - Input: `ExecutionContext`, `documentText: string`, `metadata: LegalDocumentMetadata`
  - Output: `Promise<ClauseMap>`
  - Uses `LLMHttpClientService.callLLM()` with `callerName: 'legal-department:clause-segmentation'`, `temperature: 0.1`
  - Leverages existing `metadata.sections[].clauses[]` as seed data for the LLM
  - Two-pass chunked approach for documents > 30K characters: sections first, then clauses per section
  - Section-level fallback: if clauses within a section can't be parsed, mark `sectionLevel: true`, `entryType: 'section'`
  - Total failure (no sections parseable) → throw error (job fails)
  - Uses existing `extractFirstJsonObject()` for Gemma trailing-prose tolerance

- [x] 1.4 Update `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-worker.service.ts`:
  - Detect `capabilitySlug === 'contract-review'` from `job.input.data.capabilitySlug`
  - After metadata extraction, call `segmentClauses()` for contract-review jobs
  - Set `outputMode: 'contract-review'` and `clauseMap` in the initial state passed to `graph.invoke()`

- [x] 1.5 Add `'clause-segmentation': 'thinking'` to `NODE_TO_ROLE` in `apps/forge/api/src/agents/legal-department/config/legal-model-config.ts`

- [x] 1.6 Create Supabase migration seeding `contract-review` capability config:
  ```sql
  INSERT INTO legal.capability_model_config (capability_slug, role, provider, model)
  VALUES
    ('contract-review', 'workhorse', 'ollama', 'gemma4:31b'),
    ('contract-review', 'thinking', 'ollama', 'gemma4:31b')
  ON CONFLICT (capability_slug, role) DO NOTHING;
  ```

- [x] 1.7 Write tests:
  - Unit test for `segmentClauses()` in `legal-intelligence.service.spec.ts` — mock LLM response, verify `ClauseMap` output, test chunked path, test section-level fallback, test total failure throws
  - Unit test for worker contract-review detection in `legal-jobs-worker.service.spec.ts`
  - Unit test for new state annotation fields

### Quality Gate

- [x] **Lint**: `cd apps/forge/api && npm run lint` (legal-department clean; pre-existing errors in other files)
- [x] **Build**: `cd apps/forge/api && npm run build`
- [x] **Unit Tests**: `cd apps/forge/api && npx jest --testPathPattern="legal-department" --no-coverage` (16 suites, 245 tests pass)
- [ ] **Curl Test**: Upload a contract with `capabilitySlug: 'contract-review'`: (requires running server — deferred to integration)
- [x] **Phase Review**:
  - [x] All 6 new types defined and exported (ClauseMap, ClauseMapEntry, ClauseAnnotation, ClauseSynthesis, RedlineOutput, ClauseDecision, ClauseReviewPayload)
  - [x] State annotation has 3 new fields with correct reducers/defaults (outputMode, clauseMap, redlineOutput)
  - [x] `segmentClauses()` handles: normal path, chunked path, section-level fallback, total failure
  - [x] Worker detects contract-review and runs segmentation before graph
  - [x] Model config has clause-segmentation role mapping
  - [x] Migration seeds contract-review capability config

---

## Phase 2: Specialist Prompt Updates

**Status**: In Progress
**Objective**: Update all 8 specialist nodes to produce `ClauseAnnotation[]` output when `outputMode === 'contract-review'`, while preserving existing analysis output for `outputMode === 'analysis'`.

### Steps

- [ ] 2.1 Update `apps/forge/api/src/agents/legal-department/nodes/contract-agent.node.ts`:
  - Add `if (state.outputMode === 'contract-review')` branch
  - Contract-review prompt: receives `state.clauseMap` alongside document text, returns `ClauseAnnotation[]`
  - Existing `ContractAnalysisOutput` path unchanged for `outputMode === 'analysis'`
  - Store result in `specialistOutputs.contract` (same key, different shape based on mode)

- [ ] 2.2 Repeat for `compliance-agent.node.ts` — same pattern: mode branch, clause-annotation prompt, existing output preserved

- [ ] 2.3 Repeat for `ip-agent.node.ts`

- [ ] 2.4 Repeat for `privacy-agent.node.ts`

- [ ] 2.5 Repeat for `employment-agent.node.ts`

- [ ] 2.6 Repeat for `corporate-agent.node.ts`

- [ ] 2.7 Repeat for `litigation-agent.node.ts`

- [ ] 2.8 Repeat for `real-estate-agent.node.ts`

- [ ] 2.9 Add post-specialist validation in `orchestrator.node.ts`:
  - When `state.outputMode === 'contract-review'`: after collecting specialist results, validate each `ClauseAnnotation.clauseId` exists in `state.clauseMap`
  - Strip annotations with invalid `clauseId` references (log warning, don't fail)

- [ ] 2.10 Write/update tests:
  - Test one representative specialist (contract-agent) with both output modes
  - Test orchestrator post-validation strips invalid clauseIds
  - Ensure existing specialist tests still pass for analysis mode

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest --testPathPattern="legal-department" --no-coverage`
- [ ] **Curl Test — Contract Review**: Upload a contract as `contract-review`:
  ```bash
  curl -X POST http://localhost:6200/legal-department/jobs/upload \
    -F 'files=@test-contract.pdf' \
    -F 'context={"orgSlug":"test","userId":"test-user","conversationId":"'$(uuidgen)'","agentSlug":"legal-department","agentType":"langgraph","provider":"ollama","model":"gemma4:31b","capabilitySlug":"contract-review"}'
  ```
  Expected: Job processes, all specialists produce `ClauseAnnotation[]`, annotations reference valid clauseIds. Job continues to synthesis (still old format — Phase 3 changes it) and completes.
- [ ] **Curl Test — Existing Flow**: Upload a contract as `document-onboarding`:
  ```bash
  curl -X POST http://localhost:6200/legal-department/jobs/upload \
    -F 'files=@test-contract.pdf' \
    -F 'context={"orgSlug":"test","userId":"test-user","conversationId":"'$(uuidgen)'","agentSlug":"legal-department","agentType":"langgraph","provider":"ollama","model":"gemma4:e4b","capabilitySlug":"document-onboarding"}'
  ```
  Expected: Existing analysis flow works exactly as before — no regressions.
- [ ] **Phase Review**:
  - [ ] All 8 specialists produce `ClauseAnnotation[]` when `outputMode === 'contract-review'`
  - [ ] All 8 specialists produce their original output when `outputMode === 'analysis'`
  - [ ] Orchestrator validates clauseId references and strips invalid ones
  - [ ] Empty annotation lists are passed through (not treated as errors)

---

## Phase 3: Synthesis, Report Generation, and HITL

**Status**: Not Started
**Objective**: Update synthesis to produce clause-level merge, report generation to output both risk assessment and redline data, and HITL checkpoint to include redline output in the interrupt payload.

### Steps

- [ ] 3.1 Update `apps/forge/api/src/agents/legal-department/nodes/synthesis.node.ts`:
  - When `state.outputMode === 'contract-review'`:
    - Group all specialist `ClauseAnnotation[]` arrays by `clauseId`
    - LLM call merges per-clause: produces `ClauseSynthesis[]` with conflict resolution
    - Build `RedlineOutput` wrapper (risk breakdown, totals, overall risk)
    - Write to `state.redlineOutput` (new field) AND `state.orchestration.synthesis` (for backward compat)
  - Existing synthesis path unchanged for `outputMode === 'analysis'`

- [ ] 3.2 Update `apps/forge/api/src/agents/legal-department/nodes/hitl-checkpoint.node.ts`:
  - When `state.outputMode === 'contract-review'`:
    - Include `redlineOutput` and `clauseMap` in `interrupt()` payload alongside existing `specialistOutputs` and `synthesis`
  - `Command({resume})` value: detect `ClauseReviewPayload` (has `clauseDecisions`) vs existing `ReviewDecisionPayload`
  - Write clause decisions to `state.orchestration.hitlDecision` (same field, new shape)

- [ ] 3.3 Update `apps/forge/api/src/agents/legal-department/nodes/report-generation.node.ts`:
  - When `state.outputMode === 'contract-review'`:
    - Receive `state.redlineOutput` with reviewer clause decisions applied
    - For `accept` decisions: use suggested language
    - For `reject` decisions: keep original, mark as reviewed
    - For `modify` decisions: use reviewer's edited text
    - Produce risk assessment markdown → `state.response`
    - Preserve final `redlineOutput` in state for result storage
  - Existing report path unchanged for `outputMode === 'analysis'`

- [ ] 3.4 Update worker to store `redlineOutput` in job result on completion:
  - `markCompleted()` call: include `redlineOutput` alongside existing `response`, `specialistOutputs`, etc.

- [ ] 3.5 Update controller `GET /legal-department/jobs/:id`:
  - When `awaiting_review` AND contract-review job: hydrate `clauseMap` and `redlineOutput` from checkpointer state into `reviewPayload`

- [ ] 3.6 Update controller `POST /legal-department/jobs/:id/review`:
  - Detect `ClauseReviewPayload` by checking for `body.clauseDecisions` array
  - Write as `review_decision` jsonb (same column)

- [ ] 3.7 Write/update tests:
  - Synthesis test: contract-review mode produces `ClauseSynthesis[]` with merged annotations
  - HITL checkpoint test: interrupt payload includes redlineOutput for contract-review
  - Report generation test: clause decisions applied correctly (accept/reject/modify)
  - Controller test: reviewPayload hydration includes clauseMap and redlineOutput
  - Controller test: review endpoint accepts ClauseReviewPayload

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest --testPathPattern="legal-department" --no-coverage`
- [ ] **Curl Test — Full Pipeline to HITL**:
  ```bash
  # Upload contract-review job
  CONV_ID=$(uuidgen)
  curl -X POST http://localhost:6200/legal-department/jobs/upload \
    -F 'files=@test-contract.pdf' \
    -F 'context={"orgSlug":"test","userId":"test-user","conversationId":"'$CONV_ID'","agentSlug":"legal-department","agentType":"langgraph","provider":"ollama","model":"gemma4:31b","capabilitySlug":"contract-review"}'
  
  # Wait for awaiting_review, then GET job
  curl http://localhost:6200/legal-department/jobs/{JOB_ID}?orgSlug=test
  # Expected: reviewPayload contains redlineOutput with ClauseSynthesis[], clauseMap
  
  # Submit per-clause review
  curl -X POST http://localhost:6200/legal-department/jobs/{JOB_ID}/review \
    -H 'Content-Type: application/json' \
    -d '{"context":{"orgSlug":"test","userId":"test-user","conversationId":"'$CONV_ID'","agentSlug":"legal-department","agentType":"langgraph","provider":"ollama","model":"gemma4:31b"},"clauseDecisions":[{"clauseId":"s1-c1","decision":"accept"},{"clauseId":"s2-c1","decision":"reject"},{"clauseId":"s3-c2","decision":"modify","modifiedLanguage":"New clause text here"}]}'
  # Expected: Job resumes, report generates with decisions applied, completes
  
  # GET completed job
  curl http://localhost:6200/legal-department/jobs/{JOB_ID}?orgSlug=test
  # Expected: result contains both response (markdown) and redlineOutput
  ```
- [ ] **Curl Test — Existing Flow**: Same as Phase 2 — document-onboarding still works unchanged
- [ ] **Phase Review**:
  - [ ] Synthesis produces clause-level merge with conflict notes for contract-review
  - [ ] HITL payload includes redlineOutput and clauseMap
  - [ ] Report generation applies accept/reject/modify decisions per clause
  - [ ] Controller hydrates clause data in reviewPayload
  - [ ] Controller accepts ClauseReviewPayload
  - [ ] Result stores both response and redlineOutput
  - [ ] Existing analysis flow completely unaffected

---

## Phase 4: Frontend — RedlineViewer and Per-Clause HITL

**Status**: Not Started
**Objective**: Build the `RedlineViewer.vue` component, add two-tab layout to the review and detail modals, and wire per-clause HITL decisions.

### Steps

- [ ] 4.1 Add frontend types to `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts`:
  - `ClauseSynthesis`, `RedlineOutput`, `ClauseDecision`, `ClauseReviewPayload`
  - Extend `ReviewDecisionPayload` union to include `ClauseReviewPayload`
  - Extend `ReviewPayloadSnapshot` with optional `clauseMap` and `redlineOutput`
  - Extend `AgentJobRow.result` typing with optional `redlineOutput`

- [ ] 4.2 Build `apps/forge/web/src/views/agents/legal-department/components/RedlineViewer.vue`:
  - Props: `clauses: ClauseSynthesis[]`, `clauseDecisions: Record<string, ClauseDecision>`, `readonly: boolean`
  - Emits: `update:clauseDecisions`
  - Clauses sorted by risk level (critical first)
  - Each clause renders: original text, risk badge (color-coded), specialist findings, suggested replacement
  - When `!readonly`: Accept/Reject/Modify buttons per clause. Modify opens inline textarea.
  - Color coding: red=critical, orange=high, yellow=medium, blue=low, green=acceptable
  - "Flagged only" toggle hides acceptable clauses
  - Each annotation expandable to show specialist name, finding, reasoning
  - Generic — no "legal" or "contract" references in component internals

- [ ] 4.3 Update `apps/forge/web/src/views/agents/legal-department/components/LegalJobReviewModal.vue`:
  - Add `activeTab: ref<'risk' | 'redline'>` tab strip above current content
  - `risk` tab: existing synthesis + specialist outputs (unchanged)
  - `redline` tab: `<RedlineViewer>` with data from `reviewPayload.redlineOutput`
  - Tab strip only visible when `reviewPayload.redlineOutput` exists (contract-review jobs)
  - `submit()`: when clause decisions exist, send `ClauseReviewPayload` shape
  - "Approve All" button: sets all clause decisions to `accept` and submits

- [ ] 4.4 Update `apps/forge/web/src/views/agents/legal-department/components/JobDetailModal.vue`:
  - For completed jobs with `job.result.redlineOutput`: add Risk Assessment / Redlined Contract tab strip
  - Risk Assessment tab: existing `ReportMarkdown` (unchanged)
  - Redlined Contract tab: `<RedlineViewer :readonly="true">` with final clause data
  - No tabs when `redlineOutput` absent (existing behavior preserved)

- [ ] 4.5 Update `apps/forge/web/src/views/agents/legal-department/composables/useThinkingStates.ts`:
  - Add `'legal-department:clause-segmentation'` → stage ID mapping

- [ ] 4.6 Update workflow presentation manifest (agent definition or API):
  - Add `clause_segmentation` stage before existing specialist stages

- [ ] 4.7 Write tests:
  - `RedlineViewer.vue` component test: renders clauses, color-codes risk, emits decisions
  - `LegalJobReviewModal.vue` test: tab strip appears for contract-review jobs, submit sends ClauseReviewPayload

### Quality Gate

- [ ] **Lint**: `cd apps/forge/web && npm run lint`
- [ ] **Build**: `cd apps/forge/web && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/web && npm run test`
- [ ] **Chrome Test — HITL Review Flow**:
  1. Upload a contract via the workspace "Review a Contract" flow
  2. Wait for job to reach `awaiting_review`
  3. Click the job in JobActivityList → review modal opens
  4. Verify two tabs: Risk Assessment and Redline
  5. Click Redline tab → RedlineViewer renders with clauses sorted by risk
  6. Accept one clause, reject another, modify a third (edit replacement text)
  7. Click Submit → job resumes processing
  8. Wait for completion → detail modal shows two tabs with final results
- [ ] **Chrome Test — Existing Flow Preserved**:
  1. Upload a document via existing Document Onboarding flow
  2. Job completes → detail modal shows single report tab (no tabs for non-contract-review jobs)
- [ ] **Phase Review**:
  - [ ] RedlineViewer renders clauses with correct color-coding and risk sorting
  - [ ] Per-clause Accept/Reject/Modify buttons work in review modal
  - [ ] "Approve All" button works
  - [ ] "Flagged only" toggle hides acceptable clauses
  - [ ] Completed job detail shows two-tab layout
  - [ ] Readonly mode works in detail modal (no decision buttons)
  - [ ] Existing document-onboarding flow unaffected
  - [ ] RedlineViewer is generic (no legal/contract references in internals)

---

## Phase 5: Hardening and Rejection Path

**Status**: Not Started
**Objective**: Implement partial re-run on clause rejection, test edge cases, and profile performance on Gemma 4 31B.

### Steps

- [ ] 5.1 Implement partial re-run in orchestrator:
  - When `state.orchestration.hitlDecision` contains rejected `clauseId`s:
    - Pass rejected clauseId list to specialists
    - Specialists only re-analyze rejected clauses (skip accepted/modified)
    - Merge new annotations with existing accepted/modified ones

- [ ] 5.2 Handle second HITL round:
  - `clearReviewDecision()` before re-run (same pattern as existing reject path)
  - Worker detects `GraphInterrupt` on second HITL → marks `awaiting_review` again
  - Frontend review modal renders updated clause data from second round

- [ ] 5.3 Test edge cases:
  - Empty contract (no text) → should fail at segmentation with clear error
  - Single-clause contract → should produce one ClauseMapEntry, specialists annotate it
  - Contract with no flagged clauses → all specialists return empty lists, synthesis produces "no issues found" output, HITL still pauses for confirmation
  - Large contract (200+ clauses) → verify "Flagged only" toggle filters to manageable set
  - Poorly formatted contract → verify section-level fallback works (sectionLevel: true)
  - All clauses rejected → full re-run of all specialists

- [ ] 5.4 Performance profiling on Gemma 4 31B:
  - Measure: clause segmentation time, per-specialist time, synthesis time, report generation time
  - Target: < 10 minutes total for a 50-page contract
  - If bottleneck identified: document findings and potential optimizations (smarter routing, fewer specialists)

- [ ] 5.5 Update tests for rejection path:
  - Test partial re-run: only rejected clauses re-analyzed
  - Test second HITL round: job transitions awaiting_review → review_rejected → processing → awaiting_review
  - Test edge cases from 5.3

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint` AND `cd apps/forge/web && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build` AND `cd apps/forge/web && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest --testPathPattern="legal-department" --no-coverage` AND `cd apps/forge/web && npm run test`
- [ ] **Curl Test — Rejection Path**:
  ```bash
  # After job reaches awaiting_review, reject 2 clauses
  curl -X POST http://localhost:6200/legal-department/jobs/{JOB_ID}/review \
    -H 'Content-Type: application/json' \
    -d '{"context":{...},"clauseDecisions":[{"clauseId":"s1-c1","decision":"accept"},{"clauseId":"s2-c1","decision":"reject"},{"clauseId":"s3-c2","decision":"reject"}]}'
  # Expected: Job re-processes, only s2-c1 and s3-c2 re-analyzed
  # Job reaches awaiting_review again with updated annotations for those 2 clauses
  
  # Approve all on second round
  curl -X POST http://localhost:6200/legal-department/jobs/{JOB_ID}/review \
    -H 'Content-Type: application/json' \
    -d '{"context":{...},"clauseDecisions":[{"clauseId":"s2-c1","decision":"accept"},{"clauseId":"s3-c2","decision":"accept"}]}'
  # Expected: Job completes with final report
  ```
- [ ] **Chrome Test — Full Rejection Flow**:
  1. Upload contract → wait for HITL
  2. In review modal: accept some clauses, reject 2-3
  3. Submit → job re-processes (stage ladder shows only rejected clause re-analysis)
  4. Second HITL pause → review modal shows updated annotations for rejected clauses
  5. Approve all → job completes → detail shows final two-tab output
- [ ] **Performance Check**:
  - [ ] 50-page contract completes in < 10 minutes on Gemma 4 31B
  - [ ] Per-node timing logged and reviewed
- [ ] **Phase Review**:
  - [ ] Partial re-run only re-analyzes rejected clauses
  - [ ] Second HITL round works end-to-end
  - [ ] All edge cases handled (empty, single-clause, no flags, large, poorly formatted, all rejected)
  - [ ] Performance within target
  - [ ] Existing document-onboarding flow completely unaffected (final regression check)
